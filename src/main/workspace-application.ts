import type {
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

type WorkspaceApplicationDependencies = {
  workspace: Pick<WorkspaceState, "updateTabDraft">;
};

export function createWorkspaceApplication(dependencies: WorkspaceApplicationDependencies) {
  return {
    updateDraft(input: {
      tabId: string;
      content: string;
    }): WorkspaceWindowProjection {
      return dependencies.workspace.updateTabDraft(input.tabId, input.content);
    }
  };
}
