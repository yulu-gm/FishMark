import type {
  EditorDerivedSnapshot,
  EditorDocumentMetrics
} from "@fishmark/editor-model";

export type DocumentMetrics = EditorDocumentMetrics;

// Metrics belong to the document revision snapshot. The renderer only reads the already-derived
// value after its presentation delay; it never runs a second Markdown parser.
export function getDocumentMetrics(snapshot: EditorDerivedSnapshot): DocumentMetrics {
  return snapshot.documentMetrics;
}
