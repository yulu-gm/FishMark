import type {
  BlockquoteBlock,
  InlineASTNode,
  InlineCodeSpan,
  InlineRoot,
  ListItemBlock,
  MarkdownBlock
} from "@yulora/markdown-engine";

type InlineCapable = {
  inline?: InlineRoot;
};

type BlockquoteLine = NonNullable<BlockquoteBlock["lines"]>[number];

export function getInactiveHeadingMarkerEnd(
  startOffset: number,
  depth: number,
  source: string
): number {
  let endOffset = startOffset + depth;

  while (endOffset < source.length) {
    const character = source[endOffset];
    if (character !== " " && character !== "\t") {
      break;
    }
    endOffset += 1;
  }

  return endOffset;
}

export function createBlockDecorationSignature(block: MarkdownBlock): string {
  if (block.type === "heading") {
    return `${block.type}:${block.id}:${block.startOffset}:${block.depth}${getInlineSignature(
      block as InlineCapable
    )}`;
  }

  if (block.type === "paragraph") {
    return `${block.type}:${block.id}:${block.startOffset}${getInlineSignature(
      block as InlineCapable
    )}`;
  }

  if (block.type === "list") {
    return `${block.type}:${block.id}:${block.startOffset}:${block.ordered}:${block.items
      .map((item) => `${createListItemSignature(item)}`)
      .join(",")}`;
  }

  if (block.type === "blockquote") {
    const lineSignature = block.lines?.map((line) => createBlockquoteLineSignature(line)).join("|") ?? "";

    return `${block.type}:${block.id}:${block.startOffset}:${block.endOffset}${lineSignature ? `:${lineSignature}` : ""}`;
  }

  if (block.type === "codeFence") {
    return `${block.type}:${block.id}:${block.info ?? ""}`;
  }

  if (block.type === "htmlImage") {
    return `${block.type}:${block.id}:${JSON.stringify(block.src)}:${JSON.stringify(block.alt)}:${JSON.stringify(
      block.width
    )}:${JSON.stringify(block.height)}:${JSON.stringify(block.zoom)}:${JSON.stringify(block.align)}`;
  }

  if (block.type === "table") {
    return `${block.type}:${block.id}:${block.columnCount}:${block.hasHeader}:${block.rowSeparator}:${block.alignments.join(",")}:${block.header
      .map((cell) => cell.text)
      .join("|")}:${block.rows
      .map((row) => row.map((cell) => cell.text).join("|"))
      .join("||")}`;
  }

  return `${block.type}:${block.id}:${block.marker}`;
}

function createListItemSignature(item: ListItemBlock): string {
  return `${item.id}:${item.indent}:${item.task?.checked ?? "none"}${getInlineSignature(item)}`;
}

function createBlockquoteLineSignature(line: BlockquoteLine): string {
  return `${line.lineNumber}:${line.markerEnd}:${line.contentStartOffset}:${line.contentEndOffset}${getInlineSignature(
    line
  )}`;
}

function getInlineSignature(node: InlineCapable): string {
  return node.inline ? `|inline:${createInlineFingerprint(node.inline)}` : "";
}

function createInlineFingerprint(node: InlineASTNode): string {
  switch (node.type) {
    case "root":
      return `root(${node.startOffset}-${node.endOffset}:${node.children
        .map((child) => createInlineFingerprint(child))
        .join(",")})`;
    case "text":
      return `text(${node.startOffset}-${node.endOffset}:${JSON.stringify(node.value)})`;
    case "codeSpan":
      return `codeSpan(${node.startOffset}-${node.endOffset}:${formatMarker(node.openMarker)}:${formatMarker(
        node.closeMarker
      )}:${JSON.stringify(node.text)})`;
    case "strong":
    case "emphasis":
    case "strikethrough":
      return `${node.type}(${node.startOffset}-${node.endOffset}:${formatMarker(node.openMarker)}:${formatMarker(
        node.closeMarker
      )}:${node.children.map((child) => createInlineFingerprint(child)).join(",")})`;
    case "link":
    case "image":
      return `${node.type}(${node.startOffset}-${node.endOffset}:${formatMarker(node.openMarker)}:${formatMarker(
        node.closeMarker
      )}:${JSON.stringify(node.href)}:${JSON.stringify(node.title)}:${offsetRange(
        node.destinationStartOffset,
        node.destinationEndOffset
      )}:${node.children.map((child) => createInlineFingerprint(child)).join(",")})`;
  }
}

function formatMarker(marker: InlineCodeSpan["openMarker"] | InlineCodeSpan["closeMarker"]): string {
  return `${marker.startOffset}-${marker.endOffset}`;
}

function offsetRange(startOffset: number | null, endOffset: number | null): string {
  return `${startOffset ?? ""}-${endOffset ?? ""}`;
}
