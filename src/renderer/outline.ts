import type {
  EditorDerivedSnapshot,
  EditorOutlineHeading
} from "@fishmark/editor-model";

export type OutlineItem = EditorOutlineHeading;

// Renderer outline is now a presentation projection of the editor-owned revision snapshot.
// It never parses or scans Markdown source independently.
export function deriveOutlineItems(snapshot: EditorDerivedSnapshot): OutlineItem[] {
  return snapshot.outlineHeadings.map((heading) => ({ ...heading }));
}
