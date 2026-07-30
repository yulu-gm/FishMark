import type {
  WorkspaceMoveProjection,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./ports";

export type WorkspaceTabTransferInput = Readonly<{
  tabId: string;
  expectedWindowId: string;
  targetWindowId: string;
  targetIndex?: number;
  isActive?: () => boolean;
}>;

export type WorkspaceTabTransfer = ReturnType<typeof createWorkspaceTabTransfer>;

export function createWorkspaceTabTransfer(dependencies: {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "moveTabToWindow" | "detachTabToWindow"
  >;
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
}) {
  function runTransfer(
    input: WorkspaceTabTransferInput,
    transfer: () => WorkspaceMoveProjection
  ): Promise<WorkspaceMoveProjection> {
    return dependencies.documentOperations.runExclusive(input.tabId, async () => {
      if (input.isActive?.() === false) {
        throw new Error("Workspace tab transfer is no longer active.");
      }
      const checkpoint = dependencies.workspace.getTabSession(input.tabId);
      if (checkpoint.windowId !== input.expectedWindowId) {
        throw new Error(
          `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
        );
      }
      if (input.isActive?.() === false) {
        throw new Error("Workspace tab transfer is no longer active.");
      }
      return transfer();
    });
  }

  return {
    move(input: WorkspaceTabTransferInput): Promise<WorkspaceMoveProjection> {
      return runTransfer(input, () => dependencies.workspace.moveTabToWindow({
        tabId: input.tabId,
        targetWindowId: input.targetWindowId,
        targetIndex: input.targetIndex
      }));
    },
    detach(input: WorkspaceTabTransferInput): Promise<WorkspaceMoveProjection> {
      return runTransfer(input, () => dependencies.workspace.detachTabToWindow({
        tabId: input.tabId,
        targetWindowId: input.targetWindowId,
        targetIndex: input.targetIndex
      }));
    }
  };
}
