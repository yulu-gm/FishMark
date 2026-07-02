import type {
  BlockquoteBlock,
  MarkdownBlock,
  MarkdownDocument
} from "@fishmark/markdown-engine";

export type BlockPathEntry = {
  block: MarkdownBlock;
  /**
   * Container depth in the derived editor context. A parser-owned blockquote can
   * appear more than once when nested quote depth is exposed on blockquote lines
   * instead of a normalized nested BlockquoteBlock.
   */
  depth: number;
};

export function isBlockquoteBlock(block: MarkdownBlock): block is BlockquoteBlock {
  return block.type === "blockquote";
}

export function findTopLevelBlockAt(
  markdownDocument: MarkdownDocument,
  selectionOffset: number
): MarkdownBlock | null {
  return findBlockInList(markdownDocument.blocks, selectionOffset);
}

export function findBlockPathAt(
  markdownDocument: MarkdownDocument,
  selectionOffset: number
): readonly BlockPathEntry[] {
  const topLevelBlock = findTopLevelBlockAt(markdownDocument, selectionOffset);

  if (!topLevelBlock) {
    return [];
  }

  return findNestedBlockPath(topLevelBlock, selectionOffset, 0);
}

export function findLeafBlockAt(
  markdownDocument: MarkdownDocument,
  selectionOffset: number
): MarkdownBlock | null {
  const path = findBlockPathAt(markdownDocument, selectionOffset);
  return path[path.length - 1]?.block ?? null;
}

function findNestedBlockPath(
  block: MarkdownBlock,
  selectionOffset: number,
  depth: number
): BlockPathEntry[] {
  const path: BlockPathEntry[] = [{ block, depth }];

  if (!isBlockquoteBlock(block) || !block.innerBlocks) {
    return path;
  }

  const innerBlock = findBlockInList(block.innerBlocks, selectionOffset);
  const lineQuoteDepth = findBlockquoteLineDepthAt(block, selectionOffset);
  let innerDepth = depth + 1;

  if (lineQuoteDepth > depth + 1 && innerBlock?.type !== "blockquote") {
    for (let implicitDepth = depth + 1; implicitDepth < lineQuoteDepth; implicitDepth += 1) {
      path.push({ block, depth: implicitDepth });
    }

    innerDepth = lineQuoteDepth;
  }

  if (!innerBlock) {
    return path;
  }

  return [...path, ...findNestedBlockPath(innerBlock, selectionOffset, innerDepth)];
}

function findBlockInList(
  blocks: readonly MarkdownBlock[],
  selectionOffset: number
): MarkdownBlock | null {
  for (const block of blocks) {
    if (selectionOffset >= block.startOffset && selectionOffset < block.endOffset) {
      return block;
    }
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;

    if (selectionOffset === block.endOffset) {
      return block;
    }
  }

  return null;
}

function findBlockquoteLineDepthAt(
  block: BlockquoteBlock,
  selectionOffset: number
): number {
  const line = block.lines?.find(
    (entry) => selectionOffset >= entry.startOffset && selectionOffset <= entry.endOffset
  );

  return line?.quoteDepth ?? 1;
}
