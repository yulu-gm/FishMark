import {
  sameFileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceState
} from "@fishmark/workspace-domain";

import type {
  CleanupReporterPort,
  DocumentFilePort,
  FileIdentityPort,
  KeyedOperationCoordinator,
  KeyedOperationLease,
  RecentFilesPort,
  SaveDocumentResult,
  WorkspaceDialogPort,
  WorkspaceWatcherPort
} from "./ports";
import {
  requirePersistedMarkdownDocument,
  saveError,
  workspaceMutationSaveError
} from "./document-results";

export type SaveDocumentInput<TContext> = {
  readonly context: TContext;
  readonly expectedWindowId: string;
  readonly tabId: string;
  readonly commitGuard?: () => boolean;
};

export type SaveDocumentDependencies<TContext> = {
  workspace: Pick<
    WorkspaceState,
    "getFileOwner" | "getTabSession" | "saveTabDocument"
  >;
  tabOperations: Pick<
    KeyedOperationCoordinator<string>,
    "runExclusiveWithLease" | "isLeaseHeld"
  >;
  fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "acquireExclusive" | "runExclusive"
  >;
  fileIdentity: FileIdentityPort;
  file: Pick<DocumentFilePort, "write">;
  dialog: Pick<WorkspaceDialogPort, "chooseSavePath">;
  watcher: WorkspaceWatcherPort<TContext>;
  recentFiles: RecentFilesPort;
  cleanupReporter: CleanupReporterPort;
};

export function createSaveDocument<TContext>(
  dependencies: SaveDocumentDependencies<TContext>
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
          dependencies.cleanupReporter.report(error);
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
    input: SaveDocumentInput<TContext>,
    tabLease: KeyedOperationLease<string>
  ): Promise<SaveDocumentResult> {
    requireHeldTabLease(tabLease, input.tabId);
    let checkpoint;
    try {
      checkpoint = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return saveError("tab-missing");
    }
    const ownerError = ownedCheckpointError(checkpoint, input.expectedWindowId);
    if (ownerError !== null) return ownerError;
    if (checkpoint.path === null || checkpoint.fileIdentity === null) {
      return saveError("file-identity-missing");
    }

    let initial;
    try {
      initial = await dependencies.fileIdentity.resolveExisting(checkpoint.path);
    } catch {
      return saveError("file-identity-changed");
    }

    return dependencies.fileLocationOperations.runExclusive(initial.pathKey, async () => {
      let confirmed;
      try {
        confirmed = await dependencies.fileIdentity.resolveExisting(checkpoint.path!);
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
          let finalIdentity;
          try {
            finalIdentity = await dependencies.fileIdentity.resolveExisting(
              checkpoint.path!
            );
          } catch {
            return saveError("file-identity-changed");
          }
          if (!sameFileIdentity(finalIdentity.identity, confirmed.identity)) {
            return saveError("file-identity-changed");
          }

          let writeStarted = false;
          return runWithCleanup(async () => {
            await dependencies.watcher.beginInternalWrite(input.context, checkpoint.path!);
            writeStarted = true;
            const result = await dependencies.file.write({
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
            const commitError = workspaceMutationSaveError(commit);
            if (commitError !== null) return commitError;
            await dependencies.recentFiles.record(checkpoint.path);
            return { status: "success", document: canonicalDocument };
          }, [
            () => writeStarted
              ? dependencies.watcher.completeInternalWrite(input.context, checkpoint.path!)
              : Promise.resolve()
          ], "Workspace save cleanup failed.");
        }
      );
    });
  }

  async function saveAsWithHeldTabLease(
    input: SaveDocumentInput<TContext>,
    tabLease: KeyedOperationLease<string>,
    selectedPath?: string
  ): Promise<SaveDocumentResult> {
    requireHeldTabLease(tabLease, input.tabId);
    let initialTab;
    try {
      initialTab = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return saveError("tab-missing");
    }
    const initialOwnerError = ownedCheckpointError(initialTab, input.expectedWindowId);
    if (initialOwnerError !== null) return initialOwnerError;
    const selected = selectedPath === undefined
      ? await dependencies.dialog.chooseSavePath({ currentPath: initialTab.path })
      : ({ status: "success", path: selectedPath } as const);
    if (selected.status !== "success") {
      return selected;
    }

    let checkpoint;
    try {
      checkpoint = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return saveError("tab-missing");
    }
    const ownerError = ownedCheckpointError(checkpoint, input.expectedWindowId);
    if (ownerError !== null) return ownerError;
    let target;
    try {
      target = await dependencies.fileIdentity.resolveProspective(selected.path);
    } catch {
      return saveError("file-identity-changed");
    }
    return dependencies.fileLocationOperations.runExclusive(target.pathKey, async () => {
      let confirmed;
      try {
        confirmed = await dependencies.fileIdentity.resolveProspective(selected.path);
      } catch {
        return saveError("file-identity-changed");
      }
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
          const stable = await dependencies.fileIdentity.resolveProspective(selected.path);
          if (!stable.exists || !sameFileIdentity(stable.identity, confirmed.identity)) {
            return saveError("file-identity-changed");
          }
          const owner = dependencies.workspace.getFileOwner(stable.identity);
          if (
            owner.kind === "ambiguous" ||
            (owner.kind === "owned" && owner.owner.tabId !== input.tabId)
          ) {
            return saveError("file-identity-conflict");
          }
        }

        let writeStarted = false;
        return await runWithCleanup(async () => {
          await dependencies.watcher.beginInternalWrite(
            input.context,
            confirmed.canonicalPath
          );
          writeStarted = true;
          const result = await dependencies.file.write({
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

          let persisted;
          try {
            persisted = await dependencies.fileIdentity.resolveExisting(
              confirmed.canonicalPath
            );
          } catch {
            return saveError("file-identity-changed");
          }
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
            let stable;
            try {
              stable = await dependencies.fileIdentity.resolveExisting(
                confirmed.canonicalPath
              );
            } catch {
              return saveError("file-identity-changed");
            }
            if (!sameFileIdentity(stable.identity, persisted.identity)) {
              return saveError("file-identity-changed");
            }
          }
          const owner = dependencies.workspace.getFileOwner(persisted.identity);
          if (
            owner.kind === "ambiguous" ||
            (owner.kind === "owned" && owner.owner.tabId !== input.tabId)
          ) {
            return saveError("file-identity-conflict");
          }

          const commit = dependencies.workspace.saveTabDocument({
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId,
            capturedRevision: checkpoint.revision,
            document: { fileIdentity: persisted.identity, ...savedDocument },
            diskVersion: null
          });
          const commitError = workspaceMutationSaveError(commit);
          if (commitError !== null) return commitError;
          await dependencies.recentFiles.record(savedDocument.path);
          return { status: "success", document: savedDocument };
        }, [
          () => writeStarted
            ? dependencies.watcher.completeInternalWrite(
                input.context,
                confirmed.canonicalPath
              )
            : Promise.resolve()
        ], "Workspace Save As cleanup failed.");
      } finally {
        objectLease?.release();
      }
    });
  }

  function requireHeldTabLease(
    lease: KeyedOperationLease<string>,
    tabId: string
  ): void {
    if (!dependencies.tabOperations.isLeaseHeld(lease, tabId)) {
      throw new Error(`Workspace tab '${tabId}' requires an active operation lease.`);
    }
  }

  return {
    save(input: SaveDocumentInput<TContext>): Promise<SaveDocumentResult> {
      return dependencies.tabOperations.runExclusiveWithLease(input.tabId, (lease) =>
        saveWithHeldTabLease(input, lease)
      );
    },
    saveAs(input: SaveDocumentInput<TContext>): Promise<SaveDocumentResult> {
      let checkpoint;
      try {
        checkpoint = dependencies.workspace.getTabSession(input.tabId);
      } catch {
        return Promise.resolve(saveError("tab-missing"));
      }
      const ownerError = ownedCheckpointError(checkpoint, input.expectedWindowId);
      if (ownerError !== null) return Promise.resolve(ownerError);
      return dependencies.dialog.chooseSavePath({ currentPath: checkpoint.path })
        .then((selected) => selected.status === "success"
          ? dependencies.tabOperations.runExclusiveWithLease(input.tabId, (lease) =>
              saveAsWithHeldTabLease(input, lease, selected.path)
            )
          : selected);
    },
    saveWithHeldTabLease,
    saveAsWithHeldTabLease
  };
}

function ownedCheckpointError(
  checkpoint: { readonly tabId: string; readonly windowId: string },
  expectedWindowId: string
): Extract<SaveDocumentResult, { readonly status: "error" }> | null {
  if (checkpoint.windowId !== expectedWindowId) {
    return saveError("window-changed");
  }
  return null;
}
