import type { HeadingBlock, InlineNode, InlineRoot } from "@yulora/markdown-engine";
import { parseMarkdownDocument } from "@yulora/markdown-engine";

export type OutlineItem = {
  id: string;
  label: string;
  depth: number;
  startOffset: number;
  startLine: number;
};

export function deriveOutlineItems(source: string): OutlineItem[] {
  return parseMarkdownDocument(source).blocks
    .filter((block): block is HeadingBlock => block.type === "heading")
    .map((heading) => ({
      id: heading.id,
      label: normalizeOutlineLabel(readInlineText(heading.inline)),
      depth: heading.depth,
      startOffset: heading.startOffset,
      startLine: heading.startLine
    }));
}

function readInlineText(inline: InlineRoot | undefined): string {
  if (!inline) {
    return "";
  }

  return inline.children.map((node) => readInlineNode(node)).join("");
}

function readInlineNode(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "codeSpan":
      return node.text;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.map((child) => readInlineNode(child)).join("");
    default:
      return "";
  }
}

function normalizeOutlineLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : "Untitled heading";
}
