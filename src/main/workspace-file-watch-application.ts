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
  return {
    syncWindow(input: {
      readonly sender: TSender;
      readonly windowId: string;
    }): Promise<void> {
      const projection = dependencies.workspace.getWindowProjectionOrNull(
        input.windowId
      );
      return dependencies.syncDocumentPath(
        input.sender,
        projection?.activeDocument?.path ?? null
      );
    }
  };
}
