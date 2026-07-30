import type {
  WorkspaceMutationResult,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./ports";

export type WorkspaceTabReorderInput = Readonly<{
  tabId: string;
  expectedWindowId: string;
  targetIndex: number;
}>;

export function createWorkspaceTabReorder(dependencies: {
  workspace: Pick<WorkspaceState, "reorderTab">;
  documentOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
}) {
  return {
    reorder(input: WorkspaceTabReorderInput): Promise<WorkspaceMutationResult> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () =>
        dependencies.workspace.reorderTab(input)
      );
    }
  };
}
