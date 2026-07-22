import type { WorkspaceState } from "@fishmark/workspace-domain";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type {
  SaveMarkdownFileToPathInput,
  ShowSaveMarkdownDialogInput
} from "./save-markdown-file";
import type { WorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

type WorkspaceFileOperationsDependencies<TSender> = {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "saveTabDocument"
  >;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "runExclusive"
  >;
  saveMarkdownFileToPath: (
    input: SaveMarkdownFileToPathInput
  ) => Promise<SaveMarkdownFileResult>;
  showSaveMarkdownDialog: (
    input: ShowSaveMarkdownDialogInput
  ) => Promise<SaveMarkdownFileResult>;
  beginInternalWrite: (sender: TSender, targetPath: string) => void;
  completeInternalWrite: (
    sender: TSender,
    targetPath: string
  ) => Promise<void>;
  syncWindowWatch: (sender: TSender, windowId: string) => Promise<void>;
  recordRecentFilePath: (targetPath: string | null) => Promise<void>;
  reportCleanupError: (error: unknown) => void;
};

export function createWorkspaceFileOperations<TSender>(
  dependencies: WorkspaceFileOperationsDependencies<TSender>
) {
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
    }): Promise<SaveMarkdownFileResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        let targetPath: string | null = null;
        let writeStarted = false;
        return runWithCleanup(
          async () => {
            const checkpoint = dependencies.workspace.getTabSession(input.tabId);
            if (checkpoint.windowId !== input.expectedWindowId) {
              throw new Error(
                `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
              );
            }
            if (checkpoint.path === null) {
              throw new Error(
                `Workspace tab '${input.tabId}' has no canonical file path.`
              );
            }
            targetPath = checkpoint.path;
            dependencies.beginInternalWrite(input.sender, targetPath);
            writeStarted = true;

            const result = await dependencies.saveMarkdownFileToPath({
              tabId: input.tabId,
              path: targetPath,
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
              requireAppliedWorkspaceMutation(commit, "save");
              await dependencies.recordRecentFilePath(result.document.path);
            }
            return result;
          },
          [
            () =>
              writeStarted && targetPath !== null
                ? dependencies.completeInternalWrite(input.sender, targetPath)
                : Promise.resolve(),
            () => dependencies.syncWindowWatch(input.sender, input.expectedWindowId)
          ],
          "Workspace save cleanup failed."
        );
      });
    },

    async saveAs(input: {
      readonly sender: TSender;
      readonly expectedWindowId: string;
      readonly tabId: string;
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
              currentPath: checkpoint.path,
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
              requireAppliedWorkspaceMutation(commit, "Save As");
              await dependencies.recordRecentFilePath(result.document.path);
            }
            return result;
          },
          [() => dependencies.syncWindowWatch(input.sender, input.expectedWindowId)],
          "Workspace Save As cleanup failed."
        )
      );
    }
  };
}
