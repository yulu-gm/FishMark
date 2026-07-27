import {
  sameFileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceState
} from "@fishmark/workspace-domain";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type { FileIdentityResolver } from "./file-identity-resolver";
import type { KeyedOperationCoordinator, KeyedOperationLease } from "./keyed-operation-coordinator";
import { requirePersistedMarkdownDocument } from "./persisted-markdown-document";
import type {
  SaveMarkdownFileToPathInput,
  SaveMarkdownPathDialogResult
} from "./save-markdown-file";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

type SaveInput<TSender> = {
  readonly sender: TSender;
  readonly expectedWindowId: string;
  readonly tabId: string;
  readonly commitGuard?: () => boolean;
};

type WorkspaceFileOperationsDependencies<TSender> = {
  workspace: Pick<WorkspaceState, "getFileOwner" | "getTabSession" | "saveTabDocument">;
  tabOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "acquireExclusive" | "runExclusive"
  >;
  fileIdentityResolver: FileIdentityResolver;
  saveMarkdownFileToPath: (
    input: SaveMarkdownFileToPathInput
  ) => Promise<SaveMarkdownFileResult>;
  showSaveMarkdownPathDialog: (input: {
    readonly currentPath: string | null;
  }) => Promise<SaveMarkdownPathDialogResult>;
  beginInternalWrite: (sender: TSender, targetPath: string) => Promise<void>;
  completeInternalWrite: (sender: TSender, targetPath: string) => Promise<void>;
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

  async function saveWithHeldTabLease(
    input: SaveInput<TSender>
  ): Promise<SaveMarkdownFileResult> {
    const checkpoint = dependencies.workspace.getTabSession(input.tabId);
    requireOwnedCheckpoint(checkpoint, input.expectedWindowId);
    if (checkpoint.path === null || checkpoint.fileIdentity === null) {
      throw new Error(`Workspace tab '${input.tabId}' has no canonical file identity.`);
    }

    let initial;
    try {
      initial = await dependencies.fileIdentityResolver.resolveExisting(checkpoint.path);
    } catch {
      return saveError("file-identity-changed");
    }

    return dependencies.fileLocationOperations.runExclusive(initial.pathKey, async () => {
      let confirmed;
      try {
        confirmed = await dependencies.fileIdentityResolver.resolveExisting(checkpoint.path!);
      } catch {
        return saveError("file-identity-changed");
      }
      if (
        confirmed.pathKey !== initial.pathKey ||
        !sameFileIdentity(confirmed.identity, checkpoint.fileIdentity)
      ) {
        return saveError("file-identity-changed");
      }

      return dependencies.fileObjectOperations.runExclusive(
        confirmed.physicalKey,
        async () => {
          const finalIdentity = await dependencies.fileIdentityResolver.resolveExisting(
            checkpoint.path!
          );
          if (!sameFileIdentity(finalIdentity.identity, confirmed.identity)) {
            return saveError("file-identity-changed");
          }

          let writeStarted = false;
          return runWithCleanup(async () => {
            await dependencies.beginInternalWrite(input.sender, checkpoint.path!);
            writeStarted = true;
            const result = await dependencies.saveMarkdownFileToPath({
              tabId: input.tabId,
              path: checkpoint.path!,
              content: checkpoint.content
            });
            if (result.status !== "success") {
              return result;
            }
            if (input.commitGuard?.() === false) {
              return { status: "cancelled" };
            }
            const savedDocument = requirePersistedMarkdownDocument(
              result.document,
              "Ordinary save adapter"
            );
            if (savedDocument.path !== checkpoint.path) {
              throw new Error(
                "Ordinary save adapter path does not match the canonical save checkpoint."
              );
            }
            if (savedDocument.content !== checkpoint.content) {
              throw new Error(
                "Ordinary save adapter content does not match the captured save content."
              );
            }
            const canonicalDocument = {
              fileIdentity: checkpoint.fileIdentity,
              path: checkpoint.path,
              name: checkpoint.name,
              content: checkpoint.content,
              encoding: checkpoint.encoding
            };
            const commit = dependencies.workspace.saveTabDocument({
              tabId: input.tabId,
              expectedWindowId: input.expectedWindowId,
              capturedRevision: checkpoint.revision,
              document: canonicalDocument,
              diskVersion: null
            });
            if (commit.kind === "file-identity-conflict") {
              throw new Error("The physical file is already open in another tab.");
            }
            requireAppliedWorkspaceMutation(commit, "save");
            await dependencies.recordRecentFilePath(checkpoint.path);
            return { status: "success", document: canonicalDocument };
          }, [
            () => writeStarted
              ? dependencies.completeInternalWrite(input.sender, checkpoint.path!)
              : Promise.resolve(),
            () => dependencies.syncWindowWatch(input.sender, input.expectedWindowId)
          ], "Workspace save cleanup failed.");
        }
      );
    });
  }

  async function saveAsWithHeldTabLease(
    input: SaveInput<TSender>,
    selectedPath?: string
  ): Promise<SaveMarkdownFileResult> {
    const initialTab = dependencies.workspace.getTabSession(input.tabId);
    requireOwnedCheckpoint(initialTab, input.expectedWindowId);
    const selected = selectedPath === undefined
      ? await dependencies.showSaveMarkdownPathDialog({ currentPath: initialTab.path })
      : ({ status: "success", path: selectedPath } as const);
    if (selected.status !== "success") {
      return selected;
    }

    const checkpoint = dependencies.workspace.getTabSession(input.tabId);
    requireOwnedCheckpoint(checkpoint, input.expectedWindowId);
    const target = await dependencies.fileIdentityResolver.resolveProspective(selected.path);
    return dependencies.fileLocationOperations.runExclusive(target.pathKey, async () => {
      const confirmed = await dependencies.fileIdentityResolver.resolveProspective(selected.path);
      if (
        confirmed.pathKey !== target.pathKey ||
        (target.exists && (
          !confirmed.exists ||
          !sameFileIdentity(confirmed.identity, target.identity)
        ))
      ) {
        return saveError("file-identity-changed");
      }

      let objectLease: KeyedOperationLease | null = null;
      try {
        if (confirmed.exists) {
          objectLease = await dependencies.fileObjectOperations.acquireExclusive([
            confirmed.physicalKey
          ]);
          const stable = await dependencies.fileIdentityResolver.resolveProspective(selected.path);
          if (!stable.exists || !sameFileIdentity(stable.identity, confirmed.identity)) {
            return saveError("file-identity-changed");
          }
          const owner = dependencies.workspace.getFileOwner(stable.identity);
          if (owner !== null && owner.tabId !== input.tabId) {
            return saveError("file-identity-conflict");
          }
        }

        let writeStarted = false;
        return await runWithCleanup(async () => {
          await dependencies.beginInternalWrite(input.sender, confirmed.canonicalPath);
          writeStarted = true;
          const result = await dependencies.saveMarkdownFileToPath({
            tabId: input.tabId,
            path: confirmed.canonicalPath,
            content: checkpoint.content
          });
          if (result.status !== "success") {
            return result;
          }
          if (input.commitGuard?.() === false) {
            return { status: "cancelled" };
          }
          const savedDocument = requirePersistedMarkdownDocument(
            result.document,
            "Save As adapter"
          );
          if (savedDocument.path !== confirmed.canonicalPath) {
            throw new Error(
              "Save As adapter path does not match the confirmed canonical path."
            );
          }
          if (savedDocument.content !== checkpoint.content) {
            throw new Error(
              "Save As adapter content does not match the captured save content."
            );
          }

          const persisted = await dependencies.fileIdentityResolver.resolveExisting(
            confirmed.canonicalPath
          );
          if (persisted.pathKey !== confirmed.pathKey) {
            return saveError("file-identity-changed");
          }
          if (confirmed.exists && !sameFileIdentity(persisted.identity, confirmed.identity)) {
            return saveError("file-identity-changed");
          }
          if (objectLease === null) {
            objectLease = await dependencies.fileObjectOperations.acquireExclusive([
              persisted.physicalKey
            ]);
            const stable = await dependencies.fileIdentityResolver.resolveExisting(
              confirmed.canonicalPath
            );
            if (!sameFileIdentity(stable.identity, persisted.identity)) {
              return saveError("file-identity-changed");
            }
          }
          const owner = dependencies.workspace.getFileOwner(persisted.identity);
          if (owner !== null && owner.tabId !== input.tabId) {
            return saveError("file-identity-conflict");
          }

          const commit = dependencies.workspace.saveTabDocument({
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId,
            capturedRevision: checkpoint.revision,
            document: {
              fileIdentity: persisted.identity,
              ...savedDocument
            },
            diskVersion: null
          });
          if (commit.kind === "file-identity-conflict") {
            throw new Error("The physical file is already open in another tab.");
          }
          requireAppliedWorkspaceMutation(commit, "Save As");
          await dependencies.recordRecentFilePath(savedDocument.path);
          return { status: "success", document: savedDocument };
        }, [
          () => writeStarted
            ? dependencies.completeInternalWrite(input.sender, confirmed.canonicalPath)
            : Promise.resolve(),
          () => dependencies.syncWindowWatch(input.sender, input.expectedWindowId)
        ], "Workspace Save As cleanup failed.");
      } finally {
        objectLease?.release();
      }
    });
  }

  return {
    save(input: SaveInput<TSender>): Promise<SaveMarkdownFileResult> {
      return dependencies.tabOperations.runExclusive(input.tabId, () =>
        saveWithHeldTabLease(input)
      );
    },
    saveAs(input: SaveInput<TSender>): Promise<SaveMarkdownFileResult> {
      const checkpoint = dependencies.workspace.getTabSession(input.tabId);
      requireOwnedCheckpoint(checkpoint, input.expectedWindowId);
      return dependencies.showSaveMarkdownPathDialog({ currentPath: checkpoint.path })
        .then((selected) => selected.status === "success"
          ? dependencies.tabOperations.runExclusive(input.tabId, () =>
              saveAsWithHeldTabLease(input, selected.path)
            )
          : selected);
    },
    saveWithHeldTabLease,
    saveAsWithHeldTabLease
  };
}

function requireOwnedCheckpoint(
  checkpoint: { readonly tabId: string; readonly windowId: string },
  expectedWindowId: string
): void {
  if (checkpoint.windowId !== expectedWindowId) {
    throw new Error(
      `Workspace tab '${checkpoint.tabId}' does not belong to window '${expectedWindowId}'.`
    );
  }
}

function saveError(
  code: "file-identity-conflict" | "file-identity-changed"
): SaveMarkdownFileResult {
  const messages = {
    "file-identity-conflict": "That file is already open in another tab.",
    "file-identity-changed": "The selected file changed while preparing to save. Please try again."
  } as const;
  return { status: "error", error: { code, message: messages[code] } };
}
