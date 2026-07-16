import type {
  DocumentRevision,
  DocumentSessionProjection,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import type { WorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";

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

type WorkspaceCloseCoordinatorDependencies = {
  workspace: Pick<
    WorkspaceState,
    | "getTabSession"
    | "getWindowProjection"
    | "getWindowTabIds"
    | "saveTabDocument"
    | "closeTab"
  >;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "runExclusive"
  >;
  promptToSaveWorkspaceTab: (
    tab: DocumentSessionProjection
  ) => Promise<DirtyWorkspaceTabChoice>;
  saveMarkdownFileToPath: (
    input: SaveMarkdownFileInput & { content: string }
  ) => Promise<SaveMarkdownFileResult>;
  showSaveMarkdownDialog: (
    input: SaveMarkdownFileAsInput & { content: string }
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
    windowId: string
  ) => Promise<WorkspaceWindowCloseConfirmation | null>;
} {
  async function closeTab(
    input: CloseWorkspaceTabRequest
  ): Promise<CloseWorkspaceTabResult> {
    return dependencies.documentOperations.runExclusive(input.tabId, async () => {
      const shouldProceed = await confirmTabCheckpoint(input);
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
    windowId: string
  ): Promise<WorkspaceWindowCloseConfirmation | null> {
    let initialTabIds: readonly string[];
    try {
      initialTabIds = dependencies.workspace.getWindowTabIds(windowId);
    } catch {
      return null;
    }
    const checkpoints: CloseWorkspaceTabRequest[] = [];
    for (const tabId of initialTabIds) {
      const tab = dependencies.workspace.getTabSession(tabId);
      if (tab.windowId !== windowId) {
        return null;
      }
      checkpoints.push({
        tabId,
        expectedWindowId: windowId,
        expectedRevision: tab.revision
      });
    }

    for (const checkpoint of checkpoints) {
      if (!(await confirmTabCheckpoint(checkpoint))) {
        return null;
      }
    }

    if (!hasSameOrderedTabs(windowId, initialTabIds)) {
      return null;
    }

    if (
      !checkpoints.every(
        (checkpoint) => getMatchingCheckpoint(checkpoint) !== null
      )
    ) {
      return null;
    }

    return Object.freeze({
      windowId,
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
    input: CloseWorkspaceTabRequest
  ): Promise<boolean> {
    const initial = getMatchingCheckpoint(input);
    if (initial === null) {
      return false;
    }
    if (!initial.isDirty) {
      return true;
    }

    const choice = await dependencies.promptToSaveWorkspaceTab(initial);
    const checkpoint = getMatchingCheckpoint(input);
    if (checkpoint === null) {
      return false;
    }
    if (choice === "cancel") {
      return false;
    }
    if (choice === "discard") {
      return true;
    }

    const result =
      checkpoint.path === null
        ? await dependencies.showSaveMarkdownDialog({
            tabId: checkpoint.tabId,
            currentPath: null,
            content: checkpoint.content
          })
        : await dependencies.saveMarkdownFileToPath({
            tabId: checkpoint.tabId,
            path: checkpoint.path,
            content: checkpoint.content
          });

    if (result.status === "cancelled") {
      return false;
    }
    if (result.status === "error") {
      throw new Error(result.error.message);
    }

    const commit = dependencies.workspace.saveTabDocument({
      tabId: checkpoint.tabId,
      expectedWindowId: input.expectedWindowId,
      capturedRevision: checkpoint.revision,
      document: result.document,
      diskVersion: null
    });
    if (commit.kind === "stale") {
      return false;
    }

    const finalCheckpoint = getMatchingCheckpoint(input);
    return finalCheckpoint !== null && !finalCheckpoint.isDirty;
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
