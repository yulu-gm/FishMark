import {
  parseInlineAst,
  type BlockquoteBlock,
  type HeadingBlock,
  type InlineASTNode,
  type InlineRoot,
  type ListBlock,
  type MarkdownBlock,
  type MarkdownDocument
} from "@fishmark/markdown-engine";

import {
  normalizeHiddenInlineSelectionAnchor,
  resolveVisibleInlineStartAnchor
} from "./hidden-markers";
import { findListItemAtLineStart } from "./list-utils";
import { trimTrailingCarriageReturn } from "./source-utils";

export type LineVisibilityParams = {
  source: string;
  block: MarkdownBlock;
  lineStart: number;
  lineEnd: number;
};

type HiddenLineSelectionParams = LineVisibilityParams & {
  anchor: number;
  /** -1 = moving left, 0 = unknown/jump, 1 = moving right */
  direction?: number;
};

type HiddenRange = {
  start: number;
  end: number;
};

export type VisibleLine = {
  lineStart: number;
  lineEnd: number;
  baseAnchor: number;
  visibleStartAnchor: number;
  inline: InlineRoot | null;
  hiddenRanges: readonly HiddenRange[];
  hasTransformedPresentation: boolean;
};

// --- Low-level helpers ---

export function resolveLineBaseAnchor(block: MarkdownBlock, lineStart: number): number {
  switch (block.type) {
    case "heading":
      return lineStart === block.startOffset
        ? ((block as HeadingBlock).markerEnd ?? block.startOffset)
        : lineStart;
    case "blockquote": {
      const line = (block as BlockquoteBlock).lines?.find((entry) => entry.startOffset === lineStart);
      return line?.contentStartOffset ?? lineStart;
    }
    case "list": {
      const item = findListItemAtLineStart(block as ListBlock, lineStart);
      return item?.contentStartOffset ?? item?.markerEnd ?? lineStart;
    }
    default:
      return lineStart;
  }
}

function parseLineInline(source: string, baseAnchor: number, lineStart: number, lineEnd: number): InlineRoot | null {
  const contentEnd = trimTrailingCarriageReturn(source, lineStart, lineEnd);

  if (contentEnd <= baseAnchor) {
    return null;
  }

  return parseInlineAst(source, baseAnchor, contentEnd);
}

function collectHiddenRanges(node: InlineASTNode, ranges: HiddenRange[]): void {
  switch (node.type) {
    case "root":
      for (const child of node.children) {
        collectHiddenRanges(child, ranges);
      }
      return;
    case "text":
    case "hardBreak":
      return;
    case "codeSpan":
      ranges.push(
        { start: node.openMarker.startOffset, end: node.openMarker.endOffset },
        { start: node.closeMarker.startOffset, end: node.closeMarker.endOffset }
      );
      return;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      ranges.push(
        { start: node.openMarker.startOffset, end: node.openMarker.endOffset },
        { start: node.closeMarker.startOffset, end: node.closeMarker.endOffset }
      );

      for (const child of node.children) {
        collectHiddenRanges(child, ranges);
      }
      return;
  }
}

function getHiddenRanges(inline: InlineRoot | null): HiddenRange[] {
  if (!inline) {
    return [];
  }

  const ranges: HiddenRange[] = [];
  collectHiddenRanges(inline, ranges);
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  return ranges;
}

function findHiddenRangeContainingOffset(hiddenRanges: readonly HiddenRange[], offset: number): HiddenRange | null {
  for (const range of hiddenRanges) {
    if (offset >= range.start && offset < range.end) {
      return range;
    }
  }

  return null;
}

// --- VisibleLine: pre-computed line visibility data ---

export function createVisibleLine(params: LineVisibilityParams): VisibleLine {
  const baseAnchor = resolveLineBaseAnchor(params.block, params.lineStart);
  const inline = parseLineInline(params.source, baseAnchor, params.lineStart, params.lineEnd);
  const hiddenRanges = getHiddenRanges(inline);
  const visibleStartAnchor = resolveVisibleInlineStartAnchor(baseAnchor, inline ?? undefined);

  return {
    lineStart: params.lineStart,
    lineEnd: params.lineEnd,
    baseAnchor,
    visibleStartAnchor,
    inline,
    hiddenRanges,
    hasTransformedPresentation:
      baseAnchor > params.lineStart || hiddenRanges.length > 0 || params.block.type === "thematicBreak"
  };
}

export function visibleLineColumn(line: VisibleLine, anchor: number): number {
  const boundedAnchor = Math.max(line.visibleStartAnchor, Math.min(anchor, line.lineEnd));
  let cursor = line.visibleStartAnchor;
  let column = 0;

  while (cursor < boundedAnchor) {
    const hiddenRange = findHiddenRangeContainingOffset(line.hiddenRanges, cursor);

    if (hiddenRange) {
      cursor = hiddenRange.end;
      continue;
    }

    cursor += 1;
    column += 1;
  }

  return column;
}

export function anchorForVisibleLineColumn(line: VisibleLine, column: number): number {
  let cursor = line.visibleStartAnchor;
  let remaining = Math.max(0, column);

  while (cursor < line.lineEnd) {
    const hiddenRange = findHiddenRangeContainingOffset(line.hiddenRanges, cursor);

    if (hiddenRange) {
      cursor = hiddenRange.end;
      continue;
    }

    if (remaining === 0) {
      break;
    }

    cursor += 1;
    remaining -= 1;
  }

  // Normalize in case cursor landed inside a hidden range
  return normalizeHiddenInlineSelectionAnchor(line.inline ?? undefined, cursor) ?? cursor;
}

// --- Legacy public API (delegates to VisibleLine) ---

export function resolveVisibleLineStartAnchor(params: LineVisibilityParams): number {
  return createVisibleLine(params).visibleStartAnchor;
}

export function hasTransformedLinePresentation(params: LineVisibilityParams): boolean {
  return createVisibleLine(params).hasTransformedPresentation;
}

export function resolveVisibleLineColumn(params: HiddenLineSelectionParams): number {
  return visibleLineColumn(createVisibleLine(params), params.anchor);
}

export function resolveAnchorForVisibleLineColumn(params: LineVisibilityParams, column: number): number {
  return anchorForVisibleLineColumn(createVisibleLine(params), column);
}

// --- Block-level normalization ---

export function normalizeHiddenSelectionAnchor(
  source: string,
  activeBlock: MarkdownBlock | null,
  anchor: number,
  direction = 0
): number | null {
  if (!activeBlock) {
    return null;
  }

  switch (activeBlock.type) {
    case "paragraph":
    case "heading":
    case "list":
    case "blockquote": {
      const line = resolveSourceLineAt(source, anchor);
      return normalizeHiddenLineSelectionAnchor({
        source,
        block: activeBlock,
        lineStart: line.from,
        lineEnd: line.to,
        anchor,
        direction
      });
    }
    default:
      return null;
  }
}

export function normalizeStructuralBlankSelectionAnchor(
  source: string,
  markdownDocument: MarkdownDocument,
  anchor: number,
  direction = 0
): number | null {
  const separator = findStructuralBlankLineAt(source, markdownDocument.blocks, anchor);

  if (!separator) {
    return null;
  }

  if (direction > 0 && separator.nextBlockStart !== null) {
    return separator.nextBlockStart;
  }

  if (separator.previousBlockEnd !== null) {
    return separator.previousBlockEnd;
  }

  return separator.nextBlockStart;
}

type StructuralBlankLine = {
  previousBlockEnd: number | null;
  nextBlockStart: number | null;
};

function findStructuralBlankLineAt(
  source: string,
  blocks: readonly MarkdownBlock[],
  anchor: number
): StructuralBlankLine | null {
  let cursor = 0;

  for (const block of blocks) {
    if (isStructuralBlankLineAnchor(source, cursor, block.startOffset, cursor > 0, anchor)) {
      return {
        previousBlockEnd: cursor > 0 ? cursor : null,
        nextBlockStart: block.startOffset
      };
    }

    cursor = Math.max(cursor, block.endOffset);
  }

  if (isStructuralBlankLineAnchor(source, cursor, source.length, cursor > 0, anchor)) {
    return {
      previousBlockEnd: cursor > 0 ? cursor : null,
      nextBlockStart: null
    };
  }

  return null;
}

function isStructuralBlankLineAnchor(
  source: string,
  startOffset: number,
  endOffset: number,
  skipLeadingLineBreak: boolean,
  anchor: number
): boolean {
  const contentStartOffset = skipLeadingLineBreak
    ? skipSingleLeadingLineBreak(source, startOffset, endOffset)
    : startOffset;
  let hasConsumedStructuralBlankLine = false;
  let cursor = contentStartOffset;

  while (cursor < endOffset) {
    const nextBreakOffset = source.indexOf("\n", cursor);
    const lineEndOffset = nextBreakOffset === -1 || nextBreakOffset > endOffset ? endOffset : nextBreakOffset;
    const contentEndOffset = trimTrailingCarriageReturn(source, cursor, lineEndOffset);
    const lineText = source.slice(cursor, contentEndOffset);

    if (lineText.trim().length > 0) {
      if (nextBreakOffset === -1 || nextBreakOffset >= endOffset) {
        break;
      }

      cursor = nextBreakOffset + 1;
      continue;
    }

    if (hasConsumedStructuralBlankLine) {
      return false;
    }

    hasConsumedStructuralBlankLine = true;

    return anchor >= cursor && anchor <= contentEndOffset;
  }

  return false;
}

function skipSingleLeadingLineBreak(source: string, startOffset: number, endOffset: number): number {
  if (startOffset >= endOffset) {
    return startOffset;
  }

  if (
    source[startOffset] === "\r" &&
    startOffset + 1 < endOffset &&
    source[startOffset + 1] === "\n"
  ) {
    return startOffset + 2;
  }

  if (source[startOffset] !== "\n") {
    return startOffset;
  }

  return startOffset + 1;
}

function resolveSourceLineAt(source: string, offset: number): { from: number; to: number } {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const lineStartOffset = source.lastIndexOf("\n", Math.max(0, boundedOffset - 1));
  const from = lineStartOffset === -1 ? 0 : lineStartOffset + 1;
  const lineBreakOffset = source.indexOf("\n", boundedOffset);
  const to = lineBreakOffset === -1 ? source.length : lineBreakOffset;

  return { from, to };
}

export function normalizeHiddenLineSelectionAnchor(
  params: HiddenLineSelectionParams
): number | null {
  const line = createVisibleLine(params);

  if (params.anchor >= params.lineStart && params.anchor < line.baseAnchor) {
    return line.visibleStartAnchor;
  }

  return normalizeHiddenInlineSelectionAnchor(line.inline ?? undefined, params.anchor, params.direction ?? 0);
}
