import {
  childrenOf,
  isMarkdownLeafNode,
  parseFullDocumentTree,
  type InlineNode,
  type InlineRoot,
  type MarkdownDocumentTree
} from "@fishmark/markdown-engine";

export type OutlineItem = {
  /** Canonical node id of the root-level heading, shared with the editor's active heading state. */
  id: string;
  label: string;
  depth: number;
  startOffset: number;
  startLine: number;
};

export type DeriveOutlineItemsOptions = {
  parseDocumentTree?: (source: string) => MarkdownDocumentTree;
};

// Root-level headings only, straight from the canonical tree: the id is the canonical node id, so
// the outline panel and the editor's active-heading state compare the same identity.
export function deriveOutlineItems(
  source: string,
  options: DeriveOutlineItemsOptions = {}
): OutlineItem[] {
  const parseDocumentTree = options.parseDocumentTree ?? parseFullDocumentTree;
  const tree = parseDocumentTree(source);
  const items: OutlineItem[] = [];
  let scannedOffset = 0;
  let lineNumber = 1;

  for (const node of childrenOf(tree.root)) {
    if (!isMarkdownLeafNode(node) || node.data.kind !== "heading") {
      continue;
    }

    // Root children are in source order, so one forward scan yields every heading's line number.
    for (let offset = scannedOffset; offset < node.source.startOffset; offset += 1) {
      if (source[offset] === "\n") {
        lineNumber += 1;
      }
    }

    scannedOffset = node.source.startOffset;

    items.push({
      id: node.id,
      label: normalizeOutlineLabel(readInlineText(node.inline)),
      depth: node.data.depth,
      startOffset: node.source.startOffset,
      startLine: lineNumber
    });
  }

  return items;
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
    case "hardBreak":
      return " ";
    case "codeSpan":
      return node.text;
    case "footnoteReference":
      return node.label;
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
