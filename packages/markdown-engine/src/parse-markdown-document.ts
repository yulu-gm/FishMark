import type {
  BlockquoteBlock,
  HeadingBlock,
  InlineLine,
  ListItemBlock,
  MarkdownBlock
} from "./block-map";
import type { MarkdownDocument } from "./markdown-document";
import { parseBlockMap } from "./parse-block-map";
import { parseInlineAst } from "./parse-inline-ast";

export function parseMarkdownDocument(source: string): MarkdownDocument {
  return {
    blocks: parseBlockMap(source).blocks.map((block) => attachInlineData(block, source))
  };
}

function attachInlineData(block: MarkdownBlock, source: string): MarkdownBlock {
  if (block.type === "heading") {
    const contentRange = getHeadingContentRange(block, source);
    return {
      ...block,
      markerEnd: contentRange.markerEnd,
      inline: parseInlineAst(source, contentRange.contentStartOffset, contentRange.contentEndOffset)
    };
  }

  if (block.type === "paragraph") {
    const contentEndOffset = trimTrailingCarriageReturn(source, block.startOffset, block.endOffset);
    return {
      ...block,
      inline: parseInlineAst(source, block.startOffset, contentEndOffset)
    };
  }

  if (block.type === "list") {
    return {
      ...block,
      items: block.items.map((item) => enrichListItem(item, source))
    };
  }

  if (block.type === "blockquote") {
    return {
      ...block,
      lines: createBlockquoteLines(block, source)
    };
  }

  if (block.type === "table") {
    return block;
  }

  return block;
}

type HeadingContentRange = {
  markerEnd: number;
  contentStartOffset: number;
  contentEndOffset: number;
};

function getHeadingContentRange(heading: HeadingBlock, source: string): HeadingContentRange {
  const lineEndOffset = findLineEndOffset(source, heading.startOffset, heading.endOffset);
  const contentLineEndOffset = trimTrailingCarriageReturn(source, heading.startOffset, lineEndOffset);
  const lineText = source.slice(heading.startOffset, contentLineEndOffset);
  const atxMatch = /^([ \t]{0,3})(#{1,6})(?:([ \t]+)|$)/.exec(lineText);

  if (!atxMatch) {
    return {
      markerEnd: heading.startOffset,
      contentStartOffset: heading.startOffset,
      contentEndOffset: contentLineEndOffset
    };
  }

  const markerEnd = heading.startOffset + atxMatch[0].length;
  let contentEndOffset = contentLineEndOffset;
  const remainder = source.slice(markerEnd, contentLineEndOffset);
  const closingMatch = /(?:[ \t]+#+[ \t]*)$/.exec(remainder);

  if (closingMatch) {
    contentEndOffset = contentLineEndOffset - closingMatch[0].length;
  }

  return {
    markerEnd,
    contentStartOffset: markerEnd,
    contentEndOffset: Math.max(markerEnd, contentEndOffset)
  };
}

function enrichListItem(item: ListItemBlock, source: string): ListItemBlock {
  const contentRange = getListItemContentRange(item, source);
  return {
    ...item,
    contentStartOffset: contentRange.contentStartOffset,
    contentEndOffset: contentRange.contentEndOffset,
    inline: parseInlineAst(source, contentRange.contentStartOffset, contentRange.contentEndOffset)
  };
}

type ListItemContentRange = {
  contentStartOffset: number;
  contentEndOffset: number;
};

function getListItemContentRange(item: ListItemBlock, source: string): ListItemContentRange {
  const firstLineEndOffset = findLineEndOffset(source, item.startOffset, item.endOffset);
  const firstLineContentEndOffset = trimTrailingCarriageReturn(source, item.startOffset, firstLineEndOffset);

  let contentStartOffset = item.markerEnd;
  contentStartOffset = consumeHorizontalSpace(source, contentStartOffset, firstLineContentEndOffset);

  if (item.task && item.task.markerStart === contentStartOffset) {
    contentStartOffset = item.task.markerEnd;
    contentStartOffset = consumeHorizontalSpace(source, contentStartOffset, firstLineContentEndOffset);
  }

  const boundedContentStartOffset = Math.min(contentStartOffset, item.endOffset);
  const contentEndOffset = trimTrailingCarriageReturn(source, boundedContentStartOffset, item.endOffset);

  return {
    contentStartOffset: boundedContentStartOffset,
    contentEndOffset
  };
}

function createBlockquoteLines(blockquote: BlockquoteBlock, source: string): InlineLine[] {
  const lines = createLineInfos(
    source.slice(blockquote.startOffset, blockquote.endOffset),
    blockquote.startOffset,
    blockquote.startLine
  );

  return lines.map((line) => {
    const contentLineEndOffset = trimTrailingCarriageReturn(source, line.startOffset, line.endOffset);
    const markerInfo = parseBlockquoteMarker(source, line.startOffset, contentLineEndOffset);
    return {
      text: source.slice(line.startOffset, contentLineEndOffset),
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      lineNumber: line.lineNumber,
      markerEnd: markerInfo.markerEnd,
      contentStartOffset: markerInfo.contentStartOffset,
      contentEndOffset: contentLineEndOffset,
      inline: parseInlineAst(source, markerInfo.contentStartOffset, contentLineEndOffset)
    };
  });
}

type BlockquoteMarkerInfo = {
  markerEnd: number;
  contentStartOffset: number;
};

function parseBlockquoteMarker(
  source: string,
  lineStartOffset: number,
  lineEndOffset: number
): BlockquoteMarkerInfo {
  const lineText = source.slice(lineStartOffset, lineEndOffset);
  const markerMatch = /^([ \t]{0,3})>/.exec(lineText);
  if (!markerMatch) {
    return {
      markerEnd: lineStartOffset,
      contentStartOffset: lineStartOffset
    };
  }

  const markerEnd = lineStartOffset + markerMatch[0].length;
  let contentStartOffset = markerEnd;

  if (contentStartOffset < lineEndOffset) {
    const markerPadding = source[contentStartOffset];
    if (markerPadding === " " || markerPadding === "\t") {
      contentStartOffset += 1;
    }
  }

  return {
    markerEnd,
    contentStartOffset
  };
}

function consumeHorizontalSpace(source: string, offset: number, endOffset: number): number {
  let cursor = offset;
  while (cursor < endOffset) {
    const character = source[cursor];
    if (character !== " " && character !== "\t") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function findLineEndOffset(source: string, lineStartOffset: number, upperBound: number): number {
  const lineBreakOffset = source.indexOf("\n", lineStartOffset);
  if (lineBreakOffset === -1 || lineBreakOffset > upperBound) {
    return upperBound;
  }
  return lineBreakOffset;
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  if (endOffset > startOffset && source[endOffset - 1] === "\r") {
    return endOffset - 1;
  }
  return endOffset;
}

type LineInfo = {
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
};

function createLineInfos(sourceSlice: string, baseOffset: number, baseLine: number): LineInfo[] {
  if (sourceSlice.length === 0) {
    return [];
  }

  const lines: LineInfo[] = [];
  let cursor = 0;
  let lineNumber = baseLine;

  while (cursor < sourceSlice.length) {
    const lineEndIndex = sourceSlice.indexOf("\n", cursor);
    const endIndex = lineEndIndex === -1 ? sourceSlice.length : lineEndIndex;

    lines.push({
      text: sourceSlice.slice(cursor, endIndex),
      startOffset: baseOffset + cursor,
      endOffset: baseOffset + endIndex,
      lineNumber
    });

    if (lineEndIndex === -1) {
      break;
    }

    cursor = lineEndIndex + 1;
    lineNumber += 1;
  }

  return lines;
}
