export {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision,
  type DocumentRevision
} from "./document-revision";
export type { DiskVersion } from "./disk-version";
export type {
  DocumentSaveState,
  DocumentSessionProjection,
  WorkspaceDocumentData
} from "./document-session";
export { createStringTextBuffer, type TextBuffer, type TextChange } from "./text-buffer";
export {
  createWorkspaceState,
  type CloseWorkspaceTabInput,
  type CommitWorkspaceDocumentInput,
  type DetachWorkspaceTabInput,
  type MoveWorkspaceTabInput,
  type ReplaceWorkspaceDocumentInput,
  type WorkspaceDocumentProjection,
  type WorkspaceMoveProjection,
  type WorkspaceMutationResult,
  type WorkspaceMutationStaleReason,
  type WorkspaceState,
  type WorkspaceTabProjection,
  type WorkspaceWindowProjection
} from "./workspace-state";
