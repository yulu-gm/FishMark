import {
  isMarkdownLeafNode,
  resolveIndentedCodeContentStartOffset,
  type InlineASTNode,
  type InlineRoot
} from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";

import {
  normalizeHiddenInlineSelectionAnchor,
  resolveVisibleInlineStartAnchor
} from "./hidden-markers";
import { trimTrailingCarriageReturn } from "./source-utils";
import { createStructuralLineModel } from "./structural-line-model";

export type LineVisibilityParams = {
  snapshot: EditorDerivedSnapshot;
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
    case "inlineMath":
    case "footnoteReference":
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

const hiddenRangesByInline = new WeakMap<InlineRoot, readonly HiddenRange[]>();

function getHiddenRanges(inline: InlineRoot | null): readonly HiddenRange[] {
  if (!inline) {
    return [];
  }
  const cached = hiddenRangesByInline.get(inline);
  if (cached) return cached;

  const ranges: HiddenRange[] = [];
  collectHiddenRanges(inline, ranges);
  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  hiddenRangesByInline.set(inline, ranges);
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
  const physical = params.snapshot.lineAt(params.lineStart);
  const node = physical?.nodeId === null || physical?.nodeId === undefined
    ? null : params.snapshot.nodeById(physical.nodeId);
  const lineEnd = Math.min(params.lineEnd, physical?.contentEndOffset ?? params.lineEnd);
  let baseAnchor = physical?.contentStartOffset ?? params.lineStart;
  if (node?.kind === "heading" && node.content.startOffset >= params.lineStart && node.content.startOffset <= lineEnd)
    baseAnchor = Math.max(baseAnchor, node.content.startOffset);
  if (node?.kind === "code-fence" && node.data.kind === "code-fence" && node.data.fence === "indented")
    baseAnchor = resolveIndentedCodeContentStartOffset(params.snapshot.source, baseAnchor, lineEnd);
  baseAnchor = Math.min(lineEnd, baseAnchor);
  const inline = node !== null && isMarkdownLeafNode(node) ? node.inline ?? null : null;
  const hiddenRanges = getHiddenRanges(inline)
    .filter((range) => range.end > baseAnchor && range.start < lineEnd)
    .map((range) => ({ start: Math.max(baseAnchor, range.start), end: Math.min(lineEnd, range.end) }));
  const visibleStartAnchor = Math.min(lineEnd, resolveVisibleInlineStartAnchor(baseAnchor, inline ?? undefined));

  return {
    lineStart: params.lineStart,
    lineEnd,
    baseAnchor,
    visibleStartAnchor,
    inline,
    hiddenRanges,
    hasTransformedPresentation:
      baseAnchor > params.lineStart || hiddenRanges.length > 0 || node?.kind === "thematic-break"
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

// --- Block-level normalization ---

export function normalizeHiddenSelectionAnchor(
  snapshot: EditorDerivedSnapshot,
  anchor: number,
  direction = 0
): number | null {
  const line = snapshot.lineAt(anchor);
  if (!line) return null;
  const node = line.nodeId === null ? null : snapshot.nodeById(line.nodeId);
  if (node?.kind === "table" || node?.kind === "thematic-break" || node?.kind === "html-image" ||
      node?.kind === "block-math" || node?.kind === "definition") return null;
  return normalizeHiddenLineSelectionAnchor({ snapshot, lineStart: line.range.startOffset,
    lineEnd: line.contentEndOffset, anchor, direction });
}

export function normalizeStructuralBlankSelectionAnchor(
  snapshot: EditorDerivedSnapshot,
  anchor: number,
  direction = 0
): number | null {
  const separator = createStructuralLineModel(snapshot).findSeparatorAt(anchor);

  if (!separator) {
    return null;
  }

  if (isSelectableBodyLeadingSeparator(snapshot.source, separator.lineStartOffset, separator.lineEndOffset)) {
    return null;
  }

  if (separator.nextBlockStart === null) {
    return separator.lineStartOffset;
  }

  if (direction > 0 && separator.nextBlockStart !== null) {
    return separator.nextBlockStart;
  }

  if (separator.previousBlockEnd !== null) {
    return separator.previousBlockEnd;
  }

  return separator.nextBlockStart;
}

function isSelectableBodyLeadingSeparator(
  source: string,
  lineStartOffset: number,
  lineEndOffset: number
): boolean {
  const contentEndOffset = trimTrailingCarriageReturn(source, lineStartOffset, lineEndOffset);

  if (source.slice(lineStartOffset, contentEndOffset).length !== 0) {
    return false;
  }

  const previousLine = resolveSourceLineBefore(source, lineStartOffset);

  if (!previousLine) {
    return false;
  }

  const previousContentEndOffset = trimTrailingCarriageReturn(source, previousLine.from, previousLine.to);

  return source.slice(previousLine.from, previousContentEndOffset).length === 0;
}

function resolveSourceLineBefore(
  source: string,
  lineStartOffset: number
): { from: number; to: number } | null {
  if (lineStartOffset <= 0) {
    return null;
  }

  const previousLineEnd = source[lineStartOffset - 1] === "\n" ? lineStartOffset - 1 : lineStartOffset;
  const previousLineBreakOffset = source.lastIndexOf("\n", Math.max(0, previousLineEnd - 1));
  const from = previousLineBreakOffset === -1 ? 0 : previousLineBreakOffset + 1;

  return { from, to: previousLineEnd };
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
