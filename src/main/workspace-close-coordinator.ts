import type {
  DocumentSessionProjection,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { SaveMarkdownFileAsInput, SaveMarkdownFileInput, SaveMarkdownFileResult } from "../shared/save-markdown-file";

type DirtyWorkspaceTabChoice = "save" | "discard" | "cancel";

type WorkspaceCloseCoordinatorDependencies = {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "getWindowTabIds" | "saveTabDocument" | "closeTab"
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

type CloseWorkspaceTabResult =
  | {
      status: "closed";
      snapshot: WorkspaceWindowProjection;
    }
  | {
      status: "cancelled";
    };

export function createWorkspaceCloseCoordinator(
  dependencies: WorkspaceCloseCoordinatorDependencies
): {
  closeTab: (tabId: string) => Promise<CloseWorkspaceTabResult>;
  confirmWindowClose: (windowId: string) => Promise<boolean>;
} {
  async function closeTab(tabId: string): Promise<CloseWorkspaceTabResult> {
    const shouldProceed = await confirmDirtyTab(tabId);

    if (!shouldProceed) {
      return { status: "cancelled" };
    }

    return {
      status: "closed",
      snapshot: dependencies.workspace.closeTab(tabId)
    };
  }

  async function confirmWindowClose(windowId: string): Promise<boolean> {
    for (const tabId of dependencies.workspace.getWindowTabIds(windowId)) {
      const shouldProceed = await confirmDirtyTab(tabId);

      if (!shouldProceed) {
        return false;
      }
    }

    return true;
  }

  async function confirmDirtyTab(tabId: string): Promise<boolean> {
    const tab = dependencies.workspace.getTabSession(tabId);

    if (!tab.isDirty) {
      return true;
    }

    const choice = await dependencies.promptToSaveWorkspaceTab(tab);

    if (choice === "cancel") {
      return false;
    }

    if (choice === "discard") {
      return true;
    }

    const checkpoint = dependencies.workspace.getTabSession(tabId);

    if (!checkpoint.isDirty) {
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

    dependencies.workspace.saveTabDocument({
      tabId: checkpoint.tabId,
      capturedRevision: checkpoint.revision,
      document: result.document,
      diskVersion: null
    });
    return !dependencies.workspace.getTabSession(tabId).isDirty;
  }

  return {
    closeTab,
    confirmWindowClose
  };
}
