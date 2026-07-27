export {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision,
  type DocumentRevision
} from "./document-revision";
export type { DiskVersion } from "./disk-version";
export {
  fileIdentity,
  sameFileIdentity,
  type FileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity
} from "./file-identity";
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
  type OpenWorkspaceDocumentResult,
  type ReplaceWorkspaceDocumentInput,
  type ReorderWorkspaceTabInput,
  type UpdateWorkspaceTabDraftInput,
  type WorkspaceDocumentProjection,
  type WorkspaceMoveProjection,
  type WorkspaceMutationResult,
  type WorkspaceSaveMutationResult,
  type WorkspaceFileOwner,
  type WorkspaceMutationStaleReason,
  type WorkspaceState,
  type WorkspaceTabProjection,
  type WorkspaceWindowProjection
} from "./workspace-state";
