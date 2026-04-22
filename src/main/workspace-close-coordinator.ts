import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import type { SaveMarkdownFileAsInput, SaveMarkdownFileInput, SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type { WorkspaceWindowSnapshot } from "../shared/workspace";
import type { WorkspaceTabSessionSnapshot } from "./workspace-service";

type DirtyWorkspaceTabChoice = "save" | "discard" | "cancel";

type WorkspaceServiceLike = {
  getTabSession: (tabId: string) => WorkspaceTabSessionSnapshot;
  getWindowTabIds: (windowId: string) => string[];
  saveTabDocument: (tabId: string, document: OpenMarkdownDocument) => WorkspaceWindowSnapshot;
  closeTab: (tabId: string) => WorkspaceWindowSnapshot;
};

type WorkspaceCloseCoordinatorDependencies = {
  workspaceService: WorkspaceServiceLike;
  promptToSaveWorkspaceTab: (
    tab: WorkspaceTabSessionSnapshot
  ) => Promise<DirtyWorkspaceTabChoice>;
  saveMarkdownFileToPath: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
  showSaveMarkdownDialog: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
};

type CloseWorkspaceTabResult =
  | {
      status: "closed";
      snapshot: WorkspaceWindowSnapshot;
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
    const tab = dependencies.workspaceService.getTabSession(tabId);
    const shouldProceed = await confirmDirtyTab(tab);

    if (!shouldProceed) {
      return { status: "cancelled" };
    }

    return {
      status: "closed",
      snapshot: dependencies.workspaceService.closeTab(tabId)
    };
  }

  async function confirmWindowClose(windowId: string): Promise<boolean> {
    for (const tabId of dependencies.workspaceService.getWindowTabIds(windowId)) {
      const tab = dependencies.workspaceService.getTabSession(tabId);
      const shouldProceed = await confirmDirtyTab(tab);

      if (!shouldProceed) {
        return false;
      }
    }

    return true;
  }

  async function confirmDirtyTab(tab: WorkspaceTabSessionSnapshot): Promise<boolean> {
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

    const result =
      tab.path === null
        ? await dependencies.showSaveMarkdownDialog({
            tabId: tab.tabId,
            currentPath: null,
            content: tab.content
          })
        : await dependencies.saveMarkdownFileToPath({
            tabId: tab.tabId,
            path: tab.path,
            content: tab.content
          });

    if (result.status === "cancelled") {
      return false;
    }

    if (result.status === "error") {
      throw new Error(result.error.message);
    }

    dependencies.workspaceService.saveTabDocument(tab.tabId, result.document);
    return true;
  }

  return {
    closeTab,
    confirmWindowClose
  };
}
