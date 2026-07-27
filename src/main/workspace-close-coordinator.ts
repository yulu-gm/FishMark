import type {
  DocumentRevision,
  DocumentSessionProjection,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type {
  KeyedOperationCoordinator,
  KeyedOperationLease
} from "./keyed-operation-coordinator";

type DirtyWorkspaceTabChoice = "save" | "discard" | "cancel";

export type CloseWorkspaceTabRequest = {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
};

export type WorkspaceWindowCloseConfirmation = Readonly<{
  windowId: string;
  checkpoints: readonly CloseWorkspaceTabRequest[];
}>;

export type ConfirmWorkspaceWindowCloseRequest = Readonly<{
  windowId: string;
  isActive: () => boolean;
}>;

type WorkspaceCloseCoordinatorDependencies = {
  workspace: Pick<
    WorkspaceState,
    | "getTabSession"
    | "getWindowProjection"
    | "getWindowTabIds"
    | "closeTab"
  >;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive" | "runExclusiveWithLease"
  >;
  promptToSaveWorkspaceTab: (
    tab: DocumentSessionProjection
  ) => Promise<DirtyWorkspaceTabChoice>;
  persistWorkspaceTab: (
    tab: DocumentSessionProjection,
    commitGuard: () => boolean,
    tabLease: KeyedOperationLease<string>
  ) => Promise<SaveMarkdownFileResult>;
};

export type CloseWorkspaceTabResult = {
  readonly status: "closed" | "cancelled";
  readonly snapshot: WorkspaceWindowProjection;
};

export function createWorkspaceCloseCoordinator(
  dependencies: WorkspaceCloseCoordinatorDependencies
): {
  closeTab: (input: CloseWorkspaceTabRequest) => Promise<CloseWorkspaceTabResult>;
  confirmWindowClose: (
    input: ConfirmWorkspaceWindowCloseRequest,
    tabLease?: KeyedOperationLease<string>
  ) => Promise<WorkspaceWindowCloseConfirmation | null>;
} {
  async function closeTab(
    input: CloseWorkspaceTabRequest
  ): Promise<CloseWorkspaceTabResult> {
    return dependencies.documentOperations.runExclusiveWithLease(input.tabId, async (lease) => {
      const shouldProceed = await confirmTabCheckpoint(input, () => true, lease);
      if (!shouldProceed || getMatchingCheckpoint(input) === null) {
        return cancelledResult(input.expectedWindowId);
      }

      const result = dependencies.workspace.closeTab(input);
      if (result.kind === "applied") {
        return { status: "closed", snapshot: result.projection };
      }
      if (result.projection === null) {
        throw new Error(
          `Workspace window '${input.expectedWindowId}' no longer exists.`
        );
      }
      return { status: "cancelled", snapshot: result.projection };
    });
  }

  async function confirmWindowClose(
    input: ConfirmWorkspaceWindowCloseRequest,
    tabLease?: KeyedOperationLease<string>
  ): Promise<WorkspaceWindowCloseConfirmation | null> {
    if (tabLease !== undefined) {
      return confirmWindowCloseWithLease(input, tabLease);
    }
    let tabIds: readonly string[];
    try {
      tabIds = dependencies.workspace.getWindowTabIds(input.windowId);
    } catch {
      return null;
    }
    const acquired = await dependencies.documentOperations.acquireExclusive(tabIds);
    try {
      return await confirmWindowCloseWithLease(input, acquired);
    } finally {
      acquired.release();
    }
  }

  async function confirmWindowCloseWithLease(
    input: ConfirmWorkspaceWindowCloseRequest,
    tabLease: KeyedOperationLease<string>
  ): Promise<WorkspaceWindowCloseConfirmation | null> {
    if (!input.isActive()) {
      return null;
    }
    let initialTabIds: readonly string[];
    try {
      initialTabIds = dependencies.workspace.getWindowTabIds(input.windowId);
    } catch {
      return null;
    }
    const checkpoints: CloseWorkspaceTabRequest[] = [];
    for (const tabId of initialTabIds) {
      if (!input.isActive()) {
        return null;
      }
      let tab: DocumentSessionProjection;
      try {
        tab = dependencies.workspace.getTabSession(tabId);
      } catch {
        return null;
      }
      if (tab.windowId !== input.windowId) {
        return null;
      }
      checkpoints.push({
        tabId,
        expectedWindowId: input.windowId,
        expectedRevision: tab.revision
      });
    }

    for (const checkpoint of checkpoints) {
      if (
        !input.isActive() ||
        !(await confirmTabCheckpoint(checkpoint, input.isActive, tabLease)) ||
        !input.isActive()
      ) {
        return null;
      }
    }

    if (
      !input.isActive() ||
      !hasSameOrderedTabs(input.windowId, initialTabIds)
    ) {
      return null;
    }

    if (
      !checkpoints.every(
        (checkpoint) => getMatchingCheckpoint(checkpoint) !== null
      )
    ) {
      return null;
    }

    if (!input.isActive()) {
      return null;
    }

    return Object.freeze({
      windowId: input.windowId,
      checkpoints: Object.freeze(
        checkpoints.map((checkpoint) => Object.freeze({ ...checkpoint }))
      )
    });
  }

  function hasSameOrderedTabs(
    windowId: string,
    expectedTabIds: readonly string[]
  ): boolean {
    let currentTabIds: readonly string[];
    try {
      currentTabIds = dependencies.workspace.getWindowTabIds(windowId);
    } catch {
      return false;
    }

    return currentTabIds.length === expectedTabIds.length &&
      currentTabIds.every((tabId, index) => tabId === expectedTabIds[index]);
  }

  async function confirmTabCheckpoint(
    input: CloseWorkspaceTabRequest,
    isActive: () => boolean,
    tabLease: KeyedOperationLease<string>
  ): Promise<boolean> {
    if (!isActive()) {
      return false;
    }
    const initial = getMatchingCheckpoint(input);
    if (initial === null) {
      return false;
    }
    if (!initial.isDirty) {
      return isActive();
    }

    const choice = await dependencies.promptToSaveWorkspaceTab(initial);
    if (!isActive()) {
      return false;
    }
    const checkpoint = getMatchingCheckpoint(input);
    if (checkpoint === null) {
      return false;
    }
    if (choice === "cancel") {
      return false;
    }
    if (choice === "discard") {
      return isActive();
    }

    if (!isActive()) {
      return false;
    }

    const result = await dependencies.persistWorkspaceTab(
      checkpoint,
      isActive,
      tabLease
    );

    if (!isActive()) {
      return false;
    }

    if (result.status === "cancelled") {
      return false;
    }
    if (result.status === "error") {
      throw new Error(result.error.message);
    }

    const finalCheckpoint = getMatchingCheckpoint(input);
    return isActive() && finalCheckpoint !== null && !finalCheckpoint.isDirty;
  }

  function getMatchingCheckpoint(
    input: CloseWorkspaceTabRequest
  ): DocumentSessionProjection | null {
    let tab: DocumentSessionProjection;
    try {
      tab = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return null;
    }

    return tab.windowId === input.expectedWindowId &&
      tab.revision === input.expectedRevision
      ? tab
      : null;
  }

  function cancelledResult(expectedWindowId: string): CloseWorkspaceTabResult {
    return {
      status: "cancelled",
      snapshot: dependencies.workspace.getWindowProjection(expectedWindowId)
    };
  }

  return { closeTab, confirmWindowClose };
}
