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

type DirtyWorkspaceTabChoice = "save" | "discard" | "cancel";

export type CloseWorkspaceTabRequest = {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
};

type WorkspaceCloseCoordinatorDependencies = {
  workspace: Pick<
    WorkspaceState,
    | "getTabSession"
    | "getWindowProjection"
    | "getWindowTabIds"
    | "saveTabDocument"
    | "closeTab"
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
  confirmWindowClose: (windowId: string) => Promise<boolean>;
} {
  async function closeTab(
    input: CloseWorkspaceTabRequest
  ): Promise<CloseWorkspaceTabResult> {
    const shouldProceed = await confirmTabCheckpoint(input);
    if (!shouldProceed || getMatchingCheckpoint(input) === null) {
      return cancelledResult(input.expectedWindowId);
    }

    const result = dependencies.workspace.closeTab(input);
    return result.kind === "applied"
      ? { status: "closed", snapshot: result.projection }
      : { status: "cancelled", snapshot: result.projection };
  }

  async function confirmWindowClose(windowId: string): Promise<boolean> {
    const checkpoints: CloseWorkspaceTabRequest[] = [];
    for (const tabId of dependencies.workspace.getWindowTabIds(windowId)) {
      const tab = dependencies.workspace.getTabSession(tabId);
      if (tab.windowId !== windowId) {
        return false;
      }
      checkpoints.push({
        tabId,
        expectedWindowId: windowId,
        expectedRevision: tab.revision
      });
    }

    for (const checkpoint of checkpoints) {
      if (!(await confirmTabCheckpoint(checkpoint))) {
        return false;
      }
    }

    return checkpoints.every(
      (checkpoint) => getMatchingCheckpoint(checkpoint) !== null
    );
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
