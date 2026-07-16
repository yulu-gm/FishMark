import type { WorkspaceState } from "@fishmark/workspace-domain";

import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import type { WorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";

type WorkspaceFileOperationsDependencies<TSender> = {
  workspace: Pick<
    WorkspaceState,
    | "getTabPath"
    | "getTabSession"
    | "getWindowProjectionOrNull"
    | "saveTabDocument"
  >;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "runExclusive"
  >;
  saveMarkdownFileToPath: (
    input: SaveMarkdownFileInput & { readonly content: string }
  ) => Promise<SaveMarkdownFileResult>;
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
  reportCleanupError: (error: unknown) => void;
};

export function createWorkspaceFileOperations<TSender>(
  dependencies: WorkspaceFileOperationsDependencies<TSender>
) {
  async function syncSenderWindowWatch(
    sender: TSender,
    expectedWindowId: string
  ): Promise<void> {
    const projection = dependencies.workspace.getWindowProjectionOrNull(
      expectedWindowId
    );
    await dependencies.syncDocumentPath(
      sender,
      projection === null
        ? null
        : dependencies.workspace.getTabPath(projection.activeTabId)
    );
  }

  async function runWithCleanup<TResult>(
    operation: () => Promise<TResult>,
    cleanupOperations: readonly (() => Promise<void>)[],
    aggregateMessage: string
  ): Promise<TResult> {
    let outcome:
      | { readonly kind: "success"; readonly result: TResult }
      | { readonly kind: "failure"; readonly error: unknown };
    try {
      outcome = { kind: "success", result: await operation() };
    } catch (error) {
      outcome = { kind: "failure", error };
    }

    const cleanupErrors: unknown[] = [];
    for (const cleanup of cleanupOperations) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
        try {
          dependencies.reportCleanupError(error);
        } catch {
          // Reporting cleanup failures must not replace operation/cleanup errors.
        }
      }
    }

    if (outcome.kind === "failure") {
      throw outcome.error;
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, aggregateMessage);
    }
    return outcome.result;
  }

  return {
    async save(input: {
      readonly sender: TSender;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly path: string;
    }): Promise<SaveMarkdownFileResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, () =>
        runWithCleanup(
          async () => {
            dependencies.beginInternalWrite(input.sender, input.path);
            const checkpoint = dependencies.workspace.getTabSession(input.tabId);
            if (checkpoint.windowId !== input.expectedWindowId) {
              throw new Error(
                `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
              );
            }

            const result = await dependencies.saveMarkdownFileToPath({
              tabId: input.tabId,
              path: input.path,
              content: checkpoint.content
            });
            if (result.status === "success") {
              const commit = dependencies.workspace.saveTabDocument({
                tabId: input.tabId,
                expectedWindowId: input.expectedWindowId,
                capturedRevision: checkpoint.revision,
                document: result.document,
                diskVersion: null
              });
              if (commit.projection === null) {
                throw new Error(
                  `Workspace window '${input.expectedWindowId}' no longer exists.`
                );
              }
              await dependencies.recordRecentFilePath(result.document.path);
            }
            return result;
          },
          [
            () => dependencies.completeInternalWrite(input.sender, input.path),
            () => syncSenderWindowWatch(input.sender, input.expectedWindowId)
          ],
          "Workspace save cleanup failed."
        )
      );
    },

    async saveAs(input: {
      readonly sender: TSender;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly currentPath: string | null;
    }): Promise<SaveMarkdownFileResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, () =>
        runWithCleanup(
          async () => {
            const checkpoint = dependencies.workspace.getTabSession(input.tabId);
            if (checkpoint.windowId !== input.expectedWindowId) {
              throw new Error(
                `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
              );
            }

            const result = await dependencies.showSaveMarkdownDialog({
              tabId: input.tabId,
              currentPath: input.currentPath,
              content: checkpoint.content
            });
            if (result.status === "success") {
              const commit = dependencies.workspace.saveTabDocument({
                tabId: input.tabId,
                expectedWindowId: input.expectedWindowId,
                capturedRevision: checkpoint.revision,
                document: result.document,
                diskVersion: null
              });
              if (commit.projection === null) {
                throw new Error(
                  `Workspace window '${input.expectedWindowId}' no longer exists.`
                );
              }
              await dependencies.recordRecentFilePath(result.document.path);
            }
            return result;
          },
          [() => syncSenderWindowWatch(input.sender, input.expectedWindowId)],
          "Workspace Save As cleanup failed."
        )
      );
    },

    syncSenderWindowWatch
  };
}
