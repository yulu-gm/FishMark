import type {
  WorkspaceMutationResult,
  WorkspaceState,
} from "@fishmark/workspace-domain";

type WorkspaceApplicationDependencies = {
  workspace: Pick<WorkspaceState, "updateTabDraft">;
};

export function createWorkspaceApplication(dependencies: WorkspaceApplicationDependencies) {
  return {
    updateDraft(input: {
      tabId: string;
      expectedWindowId: string;
      content: string;
    }): WorkspaceMutationResult {
      return dependencies.workspace.updateTabDraft(input);
    }
  };
}
