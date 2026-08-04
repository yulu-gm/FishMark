import type {
  UpdateWorkspaceTabDraftInput,
  WorkspaceMutationResult,
  WorkspaceState
} from "@fishmark/workspace-domain";

export type UpdateDocumentDraftInput = UpdateWorkspaceTabDraftInput;

export function createUpdateDocumentDraft(dependencies: {
  workspace: Pick<WorkspaceState, "updateTabDraft">;
}) {
  return {
    update(input: UpdateDocumentDraftInput): WorkspaceMutationResult {
      return dependencies.workspace.updateTabDraft(input);
    }
  };
}
