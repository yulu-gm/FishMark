import type {
  ApplyWorkspaceDocumentEditsInput,
  ApplyWorkspaceDocumentEditsResult,
  WorkspaceState
} from "@fishmark/workspace-domain";
import type { RecoveryUseCase } from "./recovery";

// This boundary sits inside the existing per-document operation lock. A first edit
// establishes a durable baseline; subsequent edits append only their small change set.
// The shared queue also prevents snapshot replacement/truncation racing an append.
export function createRecoverableDocumentEdits(dependencies: {
  workspace: Pick<WorkspaceState, "exportSnapshot" | "applyDocumentEdits" | "getDocumentEditCheckpoint">;
  recovery: Pick<RecoveryUseCase, "compact" | "recordEditBatch">;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  let persistenceError: Error | null = null;
  let closing = false;
  const durableVersions = new Map<string, { revision: number; savedRevision: number }>();
  async function persist(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (cause) {
      persistenceError = new Error("Recovery persistence failed. Changes remain in memory; save your document before restarting.", { cause });
      throw persistenceError;
    }
  }
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }
  return {
    applyDocumentEdits(input: ApplyWorkspaceDocumentEditsInput, authorize: () => void = () => undefined): Promise<ApplyWorkspaceDocumentEditsResult> {
      if (closing) return Promise.reject(new Error("Workspace is shutting down; edit was not accepted."));
      return enqueue(async () => {
        if (persistenceError !== null) throw persistenceError;
        const checkpoint = dependencies.workspace.getDocumentEditCheckpoint(input);
        if (checkpoint.kind === "error") return checkpoint;
        const durable = durableVersions.get(input.tabId);
        if (durable?.revision !== checkpoint.projection.revision ||
            durable.savedRevision !== checkpoint.projection.savedRevision) {
          const snapshot = dependencies.workspace.exportSnapshot();
          await persist(() => dependencies.recovery.compact(snapshot));
          durableVersions.clear();
          snapshot.sessions.forEach((session) => durableVersions.set(session.tabId, {
            revision: session.revision, savedRevision: session.savedRevision
          }));
        }
        authorize();
        const result = dependencies.workspace.applyDocumentEdits(input);
        if (result.kind === "applied") {
          await persist(() => dependencies.recovery.recordEditBatch({
            kind: "edit-batch",
            tabId: input.tabId,
            clientId: input.clientId,
            clientSequence: input.clientSequence,
            baseRevision: input.baseRevision as number,
            changes: input.changes as readonly { from: number; to: number; insert: string }[]
          }));
          durableVersions.set(input.tabId, result.projection);
        }
        return result;
      });
    },
    shutdown(): Promise<void> {
      closing = true;
      return enqueue(() => dependencies.recovery.compact(dependencies.workspace.exportSnapshot()));
    }
  };
}
