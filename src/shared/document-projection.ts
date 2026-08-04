import type { DocumentRevision } from "./document-edit";

export type DocumentProjection = {
  tabId: string;
  revision: DocumentRevision;
  savedRevision: DocumentRevision;
  isDirty: boolean;
};

export type DocumentProjectionEvent = {
  windowId: string;
  projection: DocumentProjection;
};

export const DOCUMENT_PROJECTION_EVENT = "fishmark:document-projection";
