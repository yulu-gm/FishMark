import type { MarkdownBlock } from "@fishmark/markdown-engine";

export function blockRequiresLeadingStructuralSeparator(block: MarkdownBlock): boolean {
  return block.type !== "paragraph" && block.type !== "definition";
}
