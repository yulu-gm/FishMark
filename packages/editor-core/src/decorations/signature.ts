import type { MarkdownBlock } from "@yulora/markdown-engine";

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
    return `${block.type}:${block.id}:${block.startOffset}:${block.depth}`;
  }

  if (block.type === "paragraph") {
    return `${block.type}:${block.id}:${block.startOffset}`;
  }

  if (block.type === "list") {
    return `${block.type}:${block.id}:${block.startOffset}:${block.ordered}:${block.items
      .map((item) => `${item.id}:${item.indent}:${item.task?.checked ?? "none"}`)
      .join(",")}`;
  }

  if (block.type === "blockquote") {
    return `${block.type}:${block.id}:${block.startOffset}:${block.endOffset}`;
  }

  if (block.type === "codeFence") {
    return `${block.type}:${block.id}:${block.info ?? ""}`;
  }

  return `${block.type}:${block.id}:${block.marker}`;
}
