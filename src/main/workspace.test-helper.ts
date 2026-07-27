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
  if (result.kind === "owned-by-other-window") {
    throw new Error(`Test document is owned by '${result.ownerWindowId}'.`);
  }
  return result.projection;
}
