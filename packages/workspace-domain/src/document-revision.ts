export type DocumentRevision = number;

export const INITIAL_DOCUMENT_REVISION: DocumentRevision = 0;

export function nextDocumentRevision(revision: DocumentRevision): DocumentRevision {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("Document revision must be a non-negative safe integer.");
  }
  if (revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Document revision exhausted the safe integer range.");
  }
  return revision + 1;
}
