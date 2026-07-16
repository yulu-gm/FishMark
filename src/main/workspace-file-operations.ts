import type { WorkspaceState } from "@fishmark/workspace-domain";

import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";

type WorkspaceFileOperationsDependencies<TSender> = {
  workspace: Pick<
    WorkspaceState,
    "getTabPath" | "getTabSession" | "getWindowProjection" | "saveTabDocument"
  >;
  saveTab: (input: {
    readonly tabId: string;
    readonly expectedWindowId: string;
    readonly path: string;
  }) => Promise<SaveMarkdownFileResult>;
  showSaveMarkdownDialog: (
    input: SaveMarkdownFileAsInput & { readonly content: string }
  ) => Promise<SaveMarkdownFileResult>;
  beginInternalWrite: (sender: TSender, targetPath: string) => void;
  completeInternalWrite: (
    sender: TSender,
    targetPath: string
  ) => Promise<void>;
  syncDocumentPath: (
    sender: TSender,
    targetPath: string | null
  ) => Promise<void>;
  recordRecentFilePath: (targetPath: string | null) => Promise<void>;
};

export function createWorkspaceFileOperations<TSender>(
  dependencies: WorkspaceFileOperationsDependencies<TSender>
) {
  async function syncSenderWindowWatch(
    sender: TSender,
    expectedWindowId: string
  ): Promise<void> {
    const projection = dependencies.workspace.getWindowProjection(
      expectedWindowId
    );
    await dependencies.syncDocumentPath(
      sender,
      dependencies.workspace.getTabPath(projection.activeTabId)
    );
  }

  return {
    async save(input: {
      readonly sender: TSender;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly path: string;
    }): Promise<SaveMarkdownFileResult> {
      dependencies.beginInternalWrite(input.sender, input.path);
      try {
        const result = await dependencies.saveTab({
          tabId: input.tabId,
          expectedWindowId: input.expectedWindowId,
          path: input.path
        });
        if (result.status === "success") {
          await dependencies.recordRecentFilePath(result.document.path);
        }
        return result;
      } finally {
        try {
          await dependencies.completeInternalWrite(input.sender, input.path);
        } finally {
          await syncSenderWindowWatch(input.sender, input.expectedWindowId);
        }
      }
    },

    async saveAs(input: {
      readonly sender: TSender;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly currentPath: string | null;
    }): Promise<SaveMarkdownFileResult> {
      const checkpoint = dependencies.workspace.getTabSession(input.tabId);
      if (checkpoint.windowId !== input.expectedWindowId) {
        throw new Error(
          `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
        );
      }

      try {
        const result = await dependencies.showSaveMarkdownDialog({
          tabId: input.tabId,
          currentPath: input.currentPath,
          content: checkpoint.content
        });
        if (result.status === "success") {
          dependencies.workspace.saveTabDocument({
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId,
            capturedRevision: checkpoint.revision,
            document: result.document,
            diskVersion: null
          });
          await dependencies.recordRecentFilePath(result.document.path);
        }
        return result;
      } finally {
        await syncSenderWindowWatch(input.sender, input.expectedWindowId);
      }
    },

    syncSenderWindowWatch
  };
}
