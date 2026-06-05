import type {
  BlockquoteBlock,
  InlineLine,
  MarkdownBlock
} from "@fishmark/markdown-engine";

export type BlockquoteStructuralSeparator = {
  blankLineStart: number;
  lineEndOffset: number;
  lineStartOffset: number;
  nextBlockStart: number | null;
  previousBlockEnd: number | null;
};

export function findBlockquoteStructuralSeparatorAt(
  blocks: readonly MarkdownBlock[],
  anchor: number
): BlockquoteStructuralSeparator | null {
  for (const block of blocks) {
    if (block.type !== "blockquote" || !block.lines) {
      continue;
    }

    for (const [index, line] of block.lines.entries()) {
      if (anchor < line.startOffset || anchor > line.contentEndOffset) {
        continue;
      }

      const separator = resolveBlockquoteStructuralSeparator(block, line, index);
      if (separator) {
        return separator;
      }
    }
  }

  return null;
}

export function findPreviousBlockquoteStructuralSeparator(
  blocks: readonly MarkdownBlock[],
  lineStartOffset: number
): BlockquoteStructuralSeparator | null {
  for (const block of blocks) {
    if (block.type !== "blockquote" || !block.lines) {
      continue;
    }

    const lineIndex = block.lines.findIndex((line) => line.startOffset === lineStartOffset);
    if (lineIndex <= 0) {
      continue;
    }

    const previousLine = block.lines[lineIndex - 1]!;
    const separator = resolveBlockquoteStructuralSeparator(block, previousLine, lineIndex - 1);

    if (separator) {
      return separator;
    }
  }

  return null;
}

function resolveBlockquoteStructuralSeparator(
  block: BlockquoteBlock,
  line: InlineLine,
  lineIndex: number
): BlockquoteStructuralSeparator | null {
  const innerBlocks = block.innerBlocks ?? [];

  if (!isEmptyBlockquoteLine(line) || innerBlocks.length < 2) {
    return null;
  }

  const previousBlock = [...innerBlocks]
    .reverse()
    .find((innerBlock) => innerBlock.endOffset <= line.startOffset);
  const nextBlock = innerBlocks.find((innerBlock) => innerBlock.startOffset >= line.endOffset);

  if (!previousBlock || !nextBlock) {
    return null;
  }

  const hasEarlierSeparatorInSameGap = block.lines
    ?.slice(0, lineIndex)
    .some(
      (candidate) =>
        candidate.startOffset > previousBlock.endOffset &&
        candidate.startOffset < line.startOffset &&
        isEmptyBlockquoteLine(candidate)
    ) ?? false;

  if (hasEarlierSeparatorInSameGap) {
    return null;
  }

  return {
    blankLineStart: line.startOffset,
    lineEndOffset: line.endOffset,
    lineStartOffset: line.startOffset,
    nextBlockStart: nextBlock.startOffset,
    previousBlockEnd: previousBlock.endOffset
  };
}

function isEmptyBlockquoteLine(line: InlineLine): boolean {
  return line.quoteDepth > 0 && line.contentEndOffset === line.contentStartOffset;
}
