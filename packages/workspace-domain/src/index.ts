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
  ApplyDocumentEditBatchError,
  ApplyDocumentEditBatchInput,
  ApplyDocumentEditBatchInvalidCode,
  ApplyDocumentEditBatchResult,
  DocumentSaveState,
  DocumentSessionProjection,
  WorkspaceDocumentData
} from "./document-session";
export { applyDocumentEditBatch } from "./document-session";
export {
  createStringTextBuffer,
  validateTextChanges,
  type TextBuffer,
  type TextBufferFactory,
  type TextChange
} from "./text-buffer";
export {
  createWorkspaceState,
  type CreateWorkspaceStateInput,
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
  type WorkspaceFileOwnerLookup,
  type WorkspaceMutationStaleReason,
  type WorkspaceState,
  type WorkspaceTabProjection,
  type WorkspaceWindowProjection
} from "./workspace-state";
