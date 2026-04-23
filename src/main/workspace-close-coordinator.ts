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
    const shouldProceed = await confirmDirtyTab(tabId);

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
      const shouldProceed = await confirmDirtyTab(tabId);

      if (!shouldProceed) {
        return false;
      }
    }

    return true;
  }

  async function confirmDirtyTab(tabId: string): Promise<boolean> {
    const tab = dependencies.workspaceService.getTabSession(tabId);

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

    const latestTab = dependencies.workspaceService.getTabSession(tabId);

    if (!latestTab.isDirty) {
      return true;
    }

    const result =
      latestTab.path === null
        ? await dependencies.showSaveMarkdownDialog({
            tabId: latestTab.tabId,
            currentPath: null,
            content: latestTab.content
          })
        : await dependencies.saveMarkdownFileToPath({
            tabId: latestTab.tabId,
            path: latestTab.path,
            content: latestTab.content
          });

    if (result.status === "cancelled") {
      return false;
    }

    if (result.status === "error") {
      throw new Error(result.error.message);
    }

    dependencies.workspaceService.saveTabDocument(latestTab.tabId, result.document);
    return !dependencies.workspaceService.getTabSession(tabId).isDirty;
  }

  return {
    closeTab,
    confirmWindowClose
  };
}
