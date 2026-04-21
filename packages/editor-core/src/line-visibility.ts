import {
  parseInlineAst,
  type BlockquoteBlock,
  type HeadingBlock,
  type InlineASTNode,
  type InlineRoot,
  type ListBlock,
  type ListItemBlock,
  type MarkdownBlock
} from "@yulora/markdown-engine";

import {
  normalizeHiddenInlineSelectionAnchor,
  resolveVisibleInlineStartAnchor
} from "./hidden-markers";

type LineVisibilityParams = {
  source: string;
  block: MarkdownBlock;
  lineStart: number;
  lineEnd: number;
};

type HiddenLineSelectionParams = LineVisibilityParams & {
  anchor: number;
};

type HiddenRange = {
  start: number;
  end: number;
};

function trimTrailingCarriageReturn(source: string, lineStart: number, lineEnd: number): number {
  return lineEnd > lineStart && source[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
}

function findListItemAtLineStart(block: ListBlock, lineStart: number): ListItemBlock | null {
  for (const item of block.items) {
    if (item.startOffset === lineStart) {
      return item;
    }
  }

  return null;
}

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

function parseLineInline(source: string, baseAnchor: number, lineStart: number, lineEnd: number) {
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

export function resolveVisibleLineStartAnchor(params: LineVisibilityParams): number {
  const baseAnchor = resolveLineBaseAnchor(params.block, params.lineStart);
  const inline = parseLineInline(params.source, baseAnchor, params.lineStart, params.lineEnd);

  return resolveVisibleInlineStartAnchor(baseAnchor, inline ?? undefined);
}

export function hasTransformedLinePresentation(params: LineVisibilityParams): boolean {
  const baseAnchor = resolveLineBaseAnchor(params.block, params.lineStart);
  const inline = parseLineInline(params.source, baseAnchor, params.lineStart, params.lineEnd);

  return baseAnchor > params.lineStart || getHiddenRanges(inline).length > 0 || params.block.type === "thematicBreak";
}

export function resolveVisibleLineColumn(
  params: HiddenLineSelectionParams
): number {
  const baseAnchor = resolveVisibleLineStartAnchor(params);
  const inline = parseLineInline(params.source, resolveLineBaseAnchor(params.block, params.lineStart), params.lineStart, params.lineEnd);
  const hiddenRanges = getHiddenRanges(inline);
  const boundedAnchor = Math.max(baseAnchor, Math.min(params.anchor, params.lineEnd));
  let cursor = baseAnchor;
  let visibleColumn = 0;

  while (cursor < boundedAnchor) {
    const hiddenRange = findHiddenRangeContainingOffset(hiddenRanges, cursor);

    if (hiddenRange) {
      cursor = hiddenRange.end;
      continue;
    }

    cursor += 1;
    visibleColumn += 1;
  }

  return visibleColumn;
}

export function resolveAnchorForVisibleLineColumn(
  params: LineVisibilityParams,
  visibleColumn: number
): number {
  const baseAnchor = resolveVisibleLineStartAnchor(params);
  const inline = parseLineInline(params.source, resolveLineBaseAnchor(params.block, params.lineStart), params.lineStart, params.lineEnd);
  const hiddenRanges = getHiddenRanges(inline);
  let cursor = baseAnchor;
  let remainingColumn = Math.max(0, visibleColumn);

  while (cursor < params.lineEnd) {
    const hiddenRange = findHiddenRangeContainingOffset(hiddenRanges, cursor);

    if (hiddenRange) {
      cursor = hiddenRange.end;
      continue;
    }

    if (remainingColumn === 0) {
      break;
    }

    cursor += 1;
    remainingColumn -= 1;
  }

  return normalizeHiddenLineSelectionAnchor({
    ...params,
    anchor: cursor
  }) ?? cursor;
}

export function normalizeHiddenLineSelectionAnchor(
  params: HiddenLineSelectionParams
): number | null {
  const baseAnchor = resolveLineBaseAnchor(params.block, params.lineStart);
  const visibleStartAnchor = resolveVisibleLineStartAnchor(params);

  if (params.anchor >= params.lineStart && params.anchor < baseAnchor) {
    return visibleStartAnchor;
  }

  const inline = parseLineInline(params.source, baseAnchor, params.lineStart, params.lineEnd);

  return normalizeHiddenInlineSelectionAnchor(inline ?? undefined, params.anchor);
}
