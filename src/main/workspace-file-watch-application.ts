import type { WorkspaceState } from "@fishmark/workspace-domain";

type WorkspaceFileWatchApplicationDependencies<TSender> = {
  workspace: Pick<WorkspaceState, "getWindowProjectionOrNull">;
  syncDocumentPath: (
    sender: TSender,
    targetPath: string | null
  ) => Promise<void>;
};

export function createWorkspaceFileWatchApplication<TSender>(
  dependencies: WorkspaceFileWatchApplicationDependencies<TSender>
) {
  const windowQueues = new Map<string, Promise<void>>();

  return {
    syncWindow(input: {
      readonly sender: TSender;
      readonly windowId: string;
    }): Promise<void> {
      const previous = windowQueues.get(input.windowId) ?? Promise.resolve();
      const operation = previous.catch(() => undefined).then(async () => {
        const projection = dependencies.workspace.getWindowProjectionOrNull(
          input.windowId
        );
        await dependencies.syncDocumentPath(
          input.sender,
          projection?.activeDocument?.path ?? null
        );
      });
      windowQueues.set(input.windowId, operation);
      const cleanup = () => {
        if (windowQueues.get(input.windowId) === operation) {
          windowQueues.delete(input.windowId);
        }
      };
      void operation.then(cleanup, cleanup);
      return operation;
    }
  };
}
