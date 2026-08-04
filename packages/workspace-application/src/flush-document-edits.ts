import type {
  GetWorkspaceDocumentEditCheckpointResult,
  WorkspaceDocumentEditError,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./ports";
import type { DocumentEditAuthorization } from "./apply-document-edits";

export interface FlushDocumentEditsInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly clientId: string;
  readonly throughSequence: number;
}

export type FlushDocumentEditsResult =
  | {
      readonly kind: "flushed";
      readonly acknowledgedSequence: number;
      readonly revision: number;
      readonly savedRevision: number;
      readonly isDirty: boolean;
    }
  | {
      readonly kind: "sequence-gap";
      readonly expectedSequence: number;
      readonly canonicalRevision: number;
    }
  | { readonly kind: "error"; readonly error: WorkspaceDocumentEditError };

export function createFlushDocumentEdits(dependencies: {
  workspace: Pick<WorkspaceState, "getDocumentEditCheckpoint">;
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
}) {
  return {
    flush(
      input: FlushDocumentEditsInput,
      authorize: DocumentEditAuthorization
    ): Promise<FlushDocumentEditsResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        authorize();
        const checkpoint: GetWorkspaceDocumentEditCheckpointResult =
          dependencies.workspace.getDocumentEditCheckpoint(input);
        if (checkpoint.kind === "error") {
          return checkpoint;
        }
        if (checkpoint.acknowledgedSequence < input.throughSequence) {
          return Object.freeze({
            kind: "sequence-gap" as const,
            expectedSequence: checkpoint.acknowledgedSequence + 1,
            canonicalRevision: checkpoint.projection.revision
          });
        }
        return Object.freeze({
          kind: "flushed" as const,
          acknowledgedSequence: checkpoint.acknowledgedSequence,
          revision: checkpoint.projection.revision,
          savedRevision: checkpoint.projection.savedRevision,
          isDirty: checkpoint.projection.isDirty
        });
      });
    }
  };
}
