import type {
  DiskVersion,
  WorkspaceMutationStaleReason,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { SaveDocumentInput } from "./save-document";
import type { SaveDocumentResult } from "./ports";

// Typed command surface for resolving a detected external change. The renderer no longer owns
// conflict state; it sends one of these decisions and main applies it against the canonical
// session, so keep-memory/reload/save-as/cancel share one authority.
export type ResolveExternalChangeCommand =
  | { readonly kind: "keep-memory"; readonly diskVersion: DiskVersion | null }
  | { readonly kind: "reload" }
  | { readonly kind: "save-as" }
  | { readonly kind: "cancel" };

export type ResolveExternalChangeResult =
  | { readonly kind: "resolved" }
  | { readonly kind: "cancelled" }
  | {
      readonly kind: "stale";
      readonly reason: WorkspaceMutationStaleReason;
    }
  | { readonly kind: "reloaded"; readonly outcome: unknown }
  | { readonly kind: "saved-as"; readonly outcome: SaveDocumentResult };

export function createResolveExternalChange<TContext>(dependencies: {
  workspace: Pick<WorkspaceState, "acceptExternalDiskVersion">;
  reload: (input: {
    readonly context: TContext;
    readonly tabId: string;
    readonly expectedWindowId: string;
  }) => Promise<unknown>;
  saveAs: (input: SaveDocumentInput<TContext>) => Promise<SaveDocumentResult>;
}) {
  return {
    resolve(
      input: {
        readonly context: TContext;
        readonly tabId: string;
        readonly expectedWindowId: string;
      },
      command: ResolveExternalChangeCommand
    ): Promise<ResolveExternalChangeResult> {
      switch (command.kind) {
        case "cancel":
          return Promise.resolve({ kind: "cancelled" });
        case "keep-memory": {
          const result = dependencies.workspace.acceptExternalDiskVersion({
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId,
            diskVersion: command.diskVersion
          });
          if (result.kind !== "applied") {
            return Promise.resolve({
              kind: "stale",
              reason: result.reason
            });
          }
          return Promise.resolve({ kind: "resolved" });
        }
        case "reload":
          return dependencies.reload({
            context: input.context,
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId
          }).then((outcome) => ({ kind: "reloaded", outcome }));
        case "save-as":
          return dependencies.saveAs({
            context: input.context,
            tabId: input.tabId,
            expectedWindowId: input.expectedWindowId
          }).then((outcome) => ({ kind: "saved-as", outcome }));
      }
    }
  };
}
