import type {
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { WorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

type WorkspaceTabReorderApplicationDependencies = {
  workspace: Pick<WorkspaceState, "reorderTab">;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "runExclusive"
  >;
};

export type WorkspaceTabReorderInput = Readonly<{
  tabId: string;
  expectedWindowId: string;
  targetIndex: number;
}>;

export function createWorkspaceTabReorderApplication(
  dependencies: WorkspaceTabReorderApplicationDependencies
) {
  return {
    reorder(
      input: WorkspaceTabReorderInput
    ): Promise<WorkspaceWindowProjection> {
      return dependencies.documentOperations.runExclusive(input.tabId, async () =>
        requireAppliedWorkspaceMutation(
          dependencies.workspace.reorderTab(input),
          "tab reorder"
        )
      );
    }
  };
}
