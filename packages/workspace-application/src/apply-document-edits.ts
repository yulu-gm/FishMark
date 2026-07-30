import type {
  UpdateWorkspaceTabDraftInput,
  WorkspaceMutationResult,
  WorkspaceState
} from "@fishmark/workspace-domain";

export type ApplyDocumentDraftInput = UpdateWorkspaceTabDraftInput;

export function createApplyDocumentEdits(dependencies: {
  workspace: Pick<WorkspaceState, "updateTabDraft">;
}) {
  return {
    apply(input: ApplyDocumentDraftInput): WorkspaceMutationResult {
      return dependencies.workspace.updateTabDraft(input);
    }
  };
}
