import type {
  WorkspaceDocumentData,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

export function openTestDocument(
  workspace: Pick<WorkspaceState, "openDocument">,
  windowId: string,
  document: WorkspaceDocumentData
): WorkspaceWindowProjection {
  const result = workspace.openDocument(windowId, document);
  if (result.kind !== "opened" && result.kind !== "activated-existing") {
    throw new Error(`Unexpected test document open result '${result.kind}'.`);
  }
  return result.projection;
}
