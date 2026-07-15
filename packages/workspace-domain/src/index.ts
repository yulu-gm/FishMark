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
