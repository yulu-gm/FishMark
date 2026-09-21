import type { MarkdownNode } from "@fishmark/markdown-engine";

// Paragraphs and definitions may sit directly against the previous line; every other block gets a
// leading structural separator so the document keeps one editable blank row between blocks.
export function nodeRequiresLeadingStructuralSeparator(node: MarkdownNode): boolean {
  return node.kind !== "paragraph" && node.kind !== "definition";
}
