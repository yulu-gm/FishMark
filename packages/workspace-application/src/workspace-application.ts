import type {
  WorkspaceMoveProjection,
  WorkspaceMutationResult,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator, SaveDocumentResult } from "./ports";
import type {
  CloseWorkspaceTabResult,
  CloseWorkspaceTabRequest,
  ConfirmWorkspaceWindowCloseRequest,
  ConfirmWorkspaceWindowCloseResult
} from "./close-workspace";
import type { ApplyDocumentDraftInput } from "./apply-document-edits";
import type { SaveDocumentInput } from "./save-document";
import type { WorkspaceOpenPathResult, WorkspaceOpenResult } from "./open-workspace";
import type { WorkspaceReloadResult } from "./reload-document";
import type { WorkspaceTabReorderInput } from "./tab-reorder";
import type { WorkspaceTabTransferInput } from "./tab-transfer";

export type WorkspaceProjectionCommandResult =
  | {
      readonly kind: "success";
      readonly projection: WorkspaceWindowProjection;
    }
  | {
      readonly kind: "watch-error";
      readonly committed: boolean;
      readonly projection: WorkspaceWindowProjection;
      readonly error: {
        readonly code: "watch-sync-failed";
        readonly message: string;
      };
    };

export type WorkspaceProjectionMutationResult =
  | WorkspaceProjectionCommandResult
  | WorkspaceMutationResult;

export type WorkspaceMoveCommandResult =
  | { readonly kind: "success"; readonly projection: WorkspaceMoveProjection }
  | {
      readonly kind: "watch-error";
      readonly committed: true;
      readonly projection: WorkspaceMoveProjection;
      readonly error: {
        readonly code: "watch-sync-failed";
        readonly message: string;
      };
    };

export type WorkspaceSaveCommandResult =
  | SaveDocumentResult
  | Extract<WorkspaceProjectionCommandResult, { readonly kind: "watch-error" }>;

export function createWorkspaceApplication<TContext>(dependencies: {
  workspace: Pick<
    WorkspaceState,
    "activateTab" | "createUntitledTab" | "getTabSession" | "getWindowProjection" |
      "getWindowProjectionOrNull"
  >;
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  watcher: {
    syncDocumentPath(context: TContext, targetPath: string | null): Promise<void>;
  };
  open: {
    open(input: { readonly windowId: string }): Promise<WorkspaceOpenResult>;
    openPath(input: {
      readonly windowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceOpenPathResult>;
  };
  reload: {
    reloadTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): Promise<WorkspaceReloadResult>;
  };
  reorder: {
    reorder(input: WorkspaceTabReorderInput): Promise<WorkspaceMutationResult>;
  };
  transfer: {
    move(input: WorkspaceTabTransferInput): Promise<WorkspaceMoveProjection>;
  };
  detach: {
    detachTab(input: Omit<WorkspaceTabTransferInput, "targetWindowId">): Promise<WorkspaceMoveProjection>;
    markWindowReady(windowId: string): Promise<void>;
  };
  edits: {
    apply(input: ApplyDocumentDraftInput): WorkspaceMutationResult;
  };
  save: {
    save(input: SaveDocumentInput<TContext>): Promise<SaveDocumentResult>;
    saveAs(input: SaveDocumentInput<TContext>): Promise<SaveDocumentResult>;
  };
  close: {
    closeTab(input: CloseWorkspaceTabRequest & {
      readonly context: TContext;
    }): Promise<CloseWorkspaceTabResult>;
    closeOwnedTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
      readonly context: TContext;
    }): Promise<CloseWorkspaceTabResult>;
    confirmWindowClose(
      input: ConfirmWorkspaceWindowCloseRequest,
      tabLease?: import("./ports").KeyedOperationLease<string>
    ): Promise<ConfirmWorkspaceWindowCloseResult>;
  };
}) {
  async function syncWindow(
    context: TContext,
    projection: WorkspaceWindowProjection,
    committed: boolean
  ): Promise<WorkspaceProjectionCommandResult> {
    try {
      await dependencies.watcher.syncDocumentPath(
        context,
        projection.activeDocument?.path ?? null
      );
      return { kind: "success", projection };
    } catch (error) {
      return {
        kind: "watch-error",
        committed,
        projection,
        error: {
          code: "watch-sync-failed",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  async function syncMove(
    context: TContext,
    projection: WorkspaceMoveProjection
  ): Promise<WorkspaceMoveCommandResult> {
    try {
      await dependencies.watcher.syncDocumentPath(
        context,
        projection.sourceWindowSnapshot.activeDocument?.path ?? null
      );
      return { kind: "success", projection };
    } catch (error) {
      return {
        kind: "watch-error",
        committed: true,
        projection,
        error: {
          code: "watch-sync-failed",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  return {
    getSnapshot(input: { readonly context: TContext; readonly windowId: string }) {
      return syncWindow(
        input.context,
        dependencies.workspace.getWindowProjection(input.windowId),
        false
      );
    },
    createTab(input: {
      readonly context: TContext;
      readonly windowId: string;
      readonly kind: string;
    }) {
      if (input.kind !== "untitled") {
        throw new Error(`Unsupported workspace tab kind: ${input.kind}`);
      }
      return syncWindow(
        input.context,
        dependencies.workspace.createUntitledTab(input.windowId),
        true
      );
    },
    activateTab(input: {
      readonly context: TContext;
      readonly windowId: string;
      readonly tabId: string;
    }): Promise<WorkspaceProjectionMutationResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () => {
        let checkpoint;
        try {
          checkpoint = dependencies.workspace.getTabSession(input.tabId);
        } catch {
          return {
            kind: "stale" as const,
            reason: "tab-missing" as const,
            projection: dependencies.workspace.getWindowProjectionOrNull(input.windowId)
          };
        }
        if (checkpoint.windowId !== input.windowId) {
          return {
            kind: "stale" as const,
            reason: "window-changed" as const,
            projection: dependencies.workspace.getWindowProjectionOrNull(input.windowId)
          };
        }
        return syncWindow(
          input.context,
          dependencies.workspace.activateTab(input.windowId, input.tabId),
          true
        );
      });
    },
    async open(input: {
      readonly context: TContext;
      readonly windowId: string;
    }): Promise<WorkspaceOpenResult | Extract<WorkspaceProjectionCommandResult, { kind: "watch-error" }>> {
      const result = await dependencies.open.open(input);
      return result.kind === "success"
        ? syncWindow(input.context, result.projection, true)
        : result;
    },
    async openPath(input: {
      readonly context: TContext;
      readonly windowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceOpenPathResult | Extract<WorkspaceProjectionCommandResult, { kind: "watch-error" }>> {
      const result = await dependencies.open.openPath(input);
      return result.kind === "success"
        ? syncWindow(input.context, result.projection, true)
        : result;
    },
    async reloadTab(input: {
      readonly context: TContext;
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): Promise<WorkspaceReloadResult | Extract<WorkspaceProjectionCommandResult, { kind: "watch-error" }>> {
      const result = await dependencies.reload.reloadTab(input);
      return result.kind === "success"
        ? syncWindow(input.context, result.projection, true)
        : result;
    },
    async reorderTab(input: WorkspaceTabReorderInput & {
      readonly context: TContext;
    }): Promise<WorkspaceProjectionMutationResult> {
      const result = await dependencies.reorder.reorder(input);
      return result.kind === "applied"
        ? syncWindow(input.context, result.projection, true)
        : result;
    },
    async moveTab(input: WorkspaceTabTransferInput & {
      readonly context: TContext;
    }): Promise<WorkspaceMoveCommandResult> {
      return syncMove(
        input.context,
        await dependencies.transfer.move(input)
      );
    },
    async detachTab(input: Omit<WorkspaceTabTransferInput, "targetWindowId"> & {
      readonly context: TContext;
    }): Promise<WorkspaceMoveCommandResult> {
      return syncMove(
        input.context,
        await dependencies.detach.detachTab(input)
      );
    },
    applyDocumentEdits(input: ApplyDocumentDraftInput): WorkspaceMutationResult {
      return dependencies.edits.apply(input);
    },
    async saveDocument(input: SaveDocumentInput<TContext>): Promise<WorkspaceSaveCommandResult> {
      const result = await dependencies.save.save(input);
      if (result.status !== "success") return result;
      const synchronized = await syncWindow(
        input.context,
        dependencies.workspace.getWindowProjection(input.expectedWindowId),
        true
      );
      return synchronized.kind === "success" ? result : synchronized;
    },
    async saveDocumentAs(input: SaveDocumentInput<TContext>): Promise<WorkspaceSaveCommandResult> {
      const result = await dependencies.save.saveAs(input);
      if (result.status !== "success") return result;
      const synchronized = await syncWindow(
        input.context,
        dependencies.workspace.getWindowProjection(input.expectedWindowId),
        true
      );
      return synchronized.kind === "success" ? result : synchronized;
    },
    async closeTab(input: {
      readonly context: TContext;
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): Promise<CloseWorkspaceTabResult | Extract<WorkspaceProjectionCommandResult, { kind: "watch-error" }>> {
      const result = await dependencies.close.closeOwnedTab(input);
      if (result.status === "error") return result;
      const synchronized = await syncWindow(
        input.context,
        result.snapshot,
        result.status === "closed"
      );
      return synchronized.kind === "success" ? result : synchronized;
    },
    confirmWindowClose(
      input: ConfirmWorkspaceWindowCloseRequest,
      tabLease?: import("./ports").KeyedOperationLease<string>
    ) {
      return dependencies.close.confirmWindowClose(input, tabLease);
    },
    markWindowReady(windowId: string) {
      return dependencies.detach.markWindowReady(windowId);
    },
    syncWindow(input: { readonly context: TContext; readonly windowId: string }) {
      const projection = dependencies.workspace.getWindowProjectionOrNull(input.windowId);
      return dependencies.watcher.syncDocumentPath(
        input.context,
        projection?.activeDocument?.path ?? null
      );
    }
  };
}
