import { Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { type Range } from "@codemirror/state";

import { parseInlineAst, type ListItemBlock } from "@fishmark/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import { getInactiveBlockquoteLines, getInactiveCodeFenceLines } from "./block-lines";
import { appendCodeHighlightRanges } from "./code-highlight";
import {
  createCjkTextDecorations,
  createActiveInlineDecorations,
  createInactiveInlineDecorations
} from "./inline-decorations";
import {
  createActiveHtmlImagePreviewDecoration,
  createActiveInlineImageDecorations,
  createInactiveHtmlImagePreviewDecoration
} from "./image-widgets";
import {
  createBlockDecorationSignature,
  getInactiveHeadingMarkerEnd
} from "./signature";
import { createTableWidgetDecoration, type TableWidgetCallbacks } from "./table-widget";
import {
  createLineInfosInRange,
  resolveLineStartOffset,
  trimTrailingCarriageReturn
} from "../source-utils";

export type CreateBlockDecorationsOptions = {
  activeBlockState: ActiveBlockState;
  hasEditorFocus: boolean;
  source: string;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
};

export type BlockDecorationsResult = {
  decorationSet: DecorationSet;
  signature: string;
};

export function createBlockDecorations(
  options: CreateBlockDecorationsOptions
): BlockDecorationsResult {
  const { activeBlockState, hasEditorFocus, source, resolveImagePreviewUrl, tableWidgetCallbacks } = options;
  const activeBlockId = hasEditorFocus ? activeBlockState.activeBlock?.id ?? null : null;
  const activeTableCursor = activeBlockState.tableCursor;
  const activeBlockquoteInContentEdit =
    hasEditorFocus &&
    activeBlockState.activeBlock?.type === "blockquote" &&
    hasRenderableBlockquotePresentation(activeBlockState.activeBlock, source);
  const activeCodeFenceInContentEdit =
    hasEditorFocus &&
    activeBlockState.activeBlock?.type === "codeFence" &&
    isCodeFenceContentSelection(activeBlockState.activeBlock, activeBlockState.selection.head, source);
  const activeListLineStart =
    hasEditorFocus && activeBlockState.activeBlock?.type === "list"
      ? resolveLineStartOffset(source, activeBlockState.selection.head)
      : null;
  const activeSelectionLineStart = hasEditorFocus
    ? resolveLineStartOffset(source, activeBlockState.selection.head)
    : null;
  const ranges: Range<Decoration>[] = [];
  const signatures: string[] = [
    `active:${activeBlockId ?? "none"}:blank-line:${activeSelectionLineStart ?? "none"}`
  ];

  appendInactiveBlankLineDecorations(
    source,
    activeBlockState.blockMap.blocks,
    activeSelectionLineStart,
    ranges
  );

  for (const block of activeBlockState.blockMap.blocks) {
    if (block.type === "table") {
      const cursorForBlock =
        activeTableCursor?.mode === "inside" &&
        activeTableCursor.tableStartOffset === block.startOffset
          ? activeTableCursor
          : null;

      signatures.push(
        cursorForBlock
          ? `${createBlockDecorationSignature(block)}:table-cursor:${cursorForBlock.mode}:${cursorForBlock.row}:${cursorForBlock.column}`
          : createBlockDecorationSignature(block)
      );
      ranges.push(
        createTableWidgetDecoration(
          block,
          cursorForBlock
            ? {
                row: cursorForBlock.row,
                column: cursorForBlock.column,
                tableStartOffset: cursorForBlock.tableStartOffset,
                offsetInCell: cursorForBlock.offsetInCell
              }
            : null,
          tableWidgetCallbacks ?? null
        )
      );
      continue;
    }

    if (block.id === activeBlockId) {
      if (activeBlockquoteInContentEdit && block.type === "blockquote") {
        signatures.push(`${createBlockDecorationSignature(block)}:content-edit`);
        appendBlockquoteDecorations(block, source, ranges, resolveImagePreviewUrl);
        continue;
      }

      if (activeCodeFenceInContentEdit && block.type === "codeFence") {
        signatures.push(`${createBlockDecorationSignature(block)}:content-edit`);
        appendCodeFenceDecorations(block.startOffset, block.endOffset, source, ranges, block.info);
        continue;
      }

      if (block.type === "list") {
        signatures.push(`${createBlockDecorationSignature(block)}:line-edit:${activeListLineStart ?? "none"}`);
        appendActiveListDecorations(block, source, activeListLineStart, ranges, resolveImagePreviewUrl);
        continue;
      }

      appendActiveDecorationsForBlock(block, source, ranges, resolveImagePreviewUrl);
      continue;
    }

    signatures.push(createBlockDecorationSignature(block));

    if (block.type === "htmlImage") {
      ranges.push(createInactiveHtmlImagePreviewDecoration(block, resolveImagePreviewUrl));
      continue;
    }

    if (block.type === "heading") {
      const markerEnd = getInactiveHeadingMarkerEnd(block.startOffset, block.depth, source);
      ranges.push(
        Decoration.line({
          attributes: {
            class: `cm-inactive-heading cm-inactive-heading-depth-${block.depth}`
          }
        }).range(block.startOffset)
      );
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-heading-marker"
          }
        }).range(block.startOffset, markerEnd)
      );
      ranges.push(...createInactiveInlineDecorations(block.inline, { resolveImagePreviewUrl }));
      continue;
    }

    if (block.type === "paragraph") {
      ranges.push(
        Decoration.line({
          attributes: {
            class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
          }
        }).range(block.startOffset)
      );
      ranges.push(...createInactiveInlineDecorations(block.inline, { resolveImagePreviewUrl }));
      continue;
    }

    if (block.type === "list") {
      appendInactiveListDecorations(block, source, ranges, resolveImagePreviewUrl);
      continue;
    }

    if (block.type === "blockquote") {
      appendBlockquoteDecorations(block, source, ranges, resolveImagePreviewUrl);

      continue;
    }

    if (block.type === "codeFence") {
      appendCodeFenceDecorations(block.startOffset, block.endOffset, source, ranges, block.info);
      continue;
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: "cm-inactive-thematic-break"
        }
      }).range(block.startOffset)
    );

    if (block.endOffset > block.startOffset) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-thematic-break-marker"
          }
        }).range(block.startOffset, block.endOffset)
      );
    }
  }

  return {
    decorationSet: Decoration.set(ranges, true),
    signature: signatures.join("|")
  };
}

function appendCodeFenceDecorations(
  startOffset: number,
  endOffset: number,
  source: string,
  ranges: Range<Decoration>[],
  info: string | null = null
): void {
  let contentStart: number | null = null;
  let contentEnd: number | null = null;
  const languageLabel = formatLanguageLabel(info);

  for (const line of getInactiveCodeFenceLines(startOffset, endOffset, source)) {
    if (line.kind === "fence") {
      ranges.push(
        Decoration.line({
          attributes: {
            class: "cm-inactive-code-block-fence"
          }
        }).range(line.lineStart)
      );
      if (line.lineEnd > line.lineStart) {
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-code-block-fence-marker"
            }
          }).range(line.lineStart, line.lineEnd)
        );
      }
      continue;
    }

    const lineClasses = ["cm-inactive-code-block"];

    if (line.isFirstContentLine) {
      lineClasses.push("cm-inactive-code-block-start");
    }

    if (line.isLastContentLine) {
      lineClasses.push("cm-inactive-code-block-end");
    }

    const attributes: Record<string, string> = {
      class: lineClasses.join(" ")
    };
    if (line.isLastContentLine && languageLabel) {
      attributes["data-language"] = languageLabel;
    }

    ranges.push(
      Decoration.line({
        attributes
      }).range(line.lineStart)
    );

    if (contentStart === null) {
      contentStart = line.lineStart;
    }
    contentEnd = line.lineEnd;
  }

  if (contentStart !== null && contentEnd !== null && contentEnd > contentStart) {
    appendCodeHighlightRanges(source, contentStart, contentEnd, info, ranges);
  }
}

function formatLanguageLabel(info: string | null): string {
  if (!info) return "";
  const token = info.trim().split(/\s+/)[0];
  if (!token) return "";
  return token.length > 16 ? token.slice(0, 16) : token;
}

function appendBlockquoteDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "blockquote" }>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  if (block.lines) {
    const renderableLines = block.lines.filter((line) =>
      hasCommittedRichBlockquoteMarker(line.markerEnd, line.contentStartOffset)
    );
    const lineCount = renderableLines.length;

    renderableLines.forEach((line, index) => {
      if (lineCount === 0) {
        return;
      }

      const lineClasses = ["cm-inactive-blockquote"];

      if (index === 0) {
        lineClasses.push("cm-inactive-blockquote-start");
      }

      if (index === lineCount - 1) {
        lineClasses.push("cm-inactive-blockquote-end");
      }

      ranges.push(
        Decoration.line({
          attributes: {
            class: lineClasses.join(" ")
          }
        }).range(line.startOffset)
      );

      if (line.markerEnd > line.startOffset) {
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-blockquote-marker"
            }
          }).range(line.startOffset, line.markerEnd)
        );
      }

      ranges.push(...createInactiveInlineDecorations(line.inline, { resolveImagePreviewUrl }));
    });
    return;
  }

  const renderableLines = getInactiveBlockquoteLines(block.startOffset, block.endOffset, source).filter((line) =>
    hasCommittedLeanBlockquoteMarker(line.lineStart, line.markerEnd, source)
  );
  const lineCount = renderableLines.length;

  for (const [index, line] of renderableLines.entries()) {
    if (lineCount === 0) {
      continue;
    }

    const lineClasses = ["cm-inactive-blockquote"];

    if (index === 0) {
      lineClasses.push("cm-inactive-blockquote-start");
    }

    if (index === lineCount - 1) {
      lineClasses.push("cm-inactive-blockquote-end");
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: lineClasses.join(" ")
        }
      }).range(line.lineStart)
    );

    if (line.markerEnd > line.lineStart) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-blockquote-marker"
          }
        }).range(line.lineStart, line.markerEnd)
      );
    }
  }
}

function hasRenderableBlockquotePresentation(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "blockquote" }>,
  source: string
): boolean {
  if (block.lines) {
    return block.lines.some((line) =>
      hasCommittedRichBlockquoteMarker(line.markerEnd, line.contentStartOffset)
    );
  }

  return getInactiveBlockquoteLines(block.startOffset, block.endOffset, source).some((line) =>
    hasCommittedLeanBlockquoteMarker(line.lineStart, line.markerEnd, source)
  );
}

function hasCommittedRichBlockquoteMarker(
  markerEnd: number,
  contentStartOffset: number
): boolean {
  return contentStartOffset > markerEnd;
}

function hasCommittedLeanBlockquoteMarker(
  lineStart: number,
  markerEnd: number,
  source: string
): boolean {
  if (markerEnd <= lineStart || markerEnd > source.length) {
    return false;
  }

  const markerPadding = source[markerEnd - 1];
  return markerPadding === " " || markerPadding === "\t";
}

function isCodeFenceContentSelection(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "codeFence" }>,
  selectionHead: number,
  source: string
): boolean {
  const line = getInactiveCodeFenceLines(block.startOffset, block.endOffset, source).find(
    (entry) => selectionHead >= entry.lineStart && selectionHead <= entry.lineEnd
  );

  return line?.kind === "content";
}

function appendInactiveListDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  appendInactiveListScopeDecorations(block, source, ranges, resolveImagePreviewUrl);
}

function appendInactiveListScopeDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  for (const item of block.items) {
    appendListItemDecorations(item, source, null, block.ordered, ranges, resolveImagePreviewUrl);

    for (const child of item.children) {
      appendInactiveListScopeDecorations(child, source, ranges, resolveImagePreviewUrl);
    }
  }
}

function appendActiveListDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  activeLineStart: number | null,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  appendActiveListScopeDecorations(block, source, activeLineStart, ranges, resolveImagePreviewUrl);
}

function appendActiveListScopeDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  activeLineStart: number | null,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  for (const item of block.items) {
    appendListItemDecorations(item, source, activeLineStart, block.ordered, ranges, resolveImagePreviewUrl);

    for (const child of item.children) {
      appendActiveListScopeDecorations(child, source, activeLineStart, ranges, resolveImagePreviewUrl);
    }
  }
}

function appendListItemDecorations(
  item: ListItemBlock,
  source: string,
  activeLineStart: number | null,
  ordered: boolean,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  const contentEndOffset = item.children[0]?.startOffset ?? item.endOffset;
  const lines = createLineInfosInRange(source, item.startOffset, contentEndOffset);

  for (const line of lines) {
    const isFirstLine = line.startOffset === item.startOffset;
    const isActiveLine = activeLineStart === line.startOffset;

    if (isFirstLine) {
      if (isActiveLine) {
        appendActiveListItemFirstLineDecorations(item, source, ordered, ranges);
        continue;
      }

      appendInactiveListItemFirstLineDecorations(item, source, ordered, ranges);
      appendInlineDecorationsForLine(
        source,
        resolveListItemContentStartOffset(item, source),
        line.endOffset,
        false,
        ranges,
        resolveImagePreviewUrl
      );

      continue;
    }

    if (isActiveLine) {
      appendListItemContinuationLineDecorations(
        line.startOffset,
        line.endOffset,
        item,
        source,
        ordered,
        "active",
        ranges
      );
      continue;
    }

    if (isExplicitThematicBreakLine(line.text)) {
      appendThematicBreakLineDecorations(line.startOffset, line.endOffset, ranges);
      continue;
    }

    const continuationContentStartOffset = resolveListItemContinuationContentStartOffset(
      line.startOffset,
      line.endOffset,
      source
    );

    appendListItemContinuationLineDecorations(
      line.startOffset,
      line.endOffset,
      item,
      source,
      ordered,
      "inactive",
      ranges
    );
    appendInactiveListItemHiddenPrefixDecoration(line.startOffset, continuationContentStartOffset, ranges);
    appendInlineDecorationsForLine(
      source,
      continuationContentStartOffset,
      line.endOffset,
      false,
      ranges,
      resolveImagePreviewUrl
    );
  }
}

function appendActiveListItemFirstLineDecorations(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  ranges: Range<Decoration>[]
): void {
  const lineAttributes = createListItemLineAttributes("active", item, source, ordered);

  ranges.push(
    Decoration.line({
      attributes: lineAttributes
    }).range(item.startOffset)
  );

  appendActiveListItemSourcePrefixDecorations(item, source, ranges);
}

function appendInactiveListItemFirstLineDecorations(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  ranges: Range<Decoration>[]
): void {
  const lineAttributes = createListItemLineAttributes("inactive", item, source, ordered);
  const contentStartOffset = resolveListItemContentStartOffset(item, source);

  ranges.push(
    Decoration.line({
      attributes: lineAttributes
    }).range(item.startOffset)
  );

  appendInactiveListItemSourcePrefixDecorations(item, ranges);

  ranges.push(
    Decoration.mark({
      attributes: {
        class: "cm-inactive-list-marker"
      }
    }).range(item.markerStart, item.markerEnd)
  );

  if (!item.task) {
    appendInactiveListItemHiddenPrefixDecoration(item.markerEnd, contentStartOffset, ranges);
    return;
  }

  appendInactiveListItemHiddenPrefixDecoration(item.markerEnd, item.task.markerStart, ranges);

  ranges.push(
    Decoration.replace({
      widget: new TaskMarkerWidget(item.task.checked)
    }).range(item.task.markerStart, item.task.markerEnd)
  );

  appendInactiveListItemHiddenPrefixDecoration(item.task.markerEnd, contentStartOffset, ranges);
}

class TaskMarkerWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  override eq(other: TaskMarkerWidget): boolean {
    return other.checked === this.checked;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement("span");
    const box = document.createElement("span");
    const check = document.createElement("span");

    marker.className = [
      "cm-inactive-task-marker",
      this.checked ? "cm-inactive-task-marker-checked" : "cm-inactive-task-marker-unchecked"
    ].join(" ");
    marker.dataset.taskState = this.checked ? "checked" : "unchecked";
    marker.setAttribute("aria-hidden", "true");
    box.className = "cm-inactive-task-marker-box";
    check.className = "cm-inactive-task-marker-check";
    marker.append(box, check);

    return marker;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function appendInactiveListItemSourcePrefixDecorations(item: ListItemBlock, ranges: Range<Decoration>[]): void {
  appendInactiveListItemHiddenPrefixDecoration(item.startOffset, item.markerStart, ranges);
}

function appendActiveListItemSourcePrefixDecorations(
  item: ListItemBlock,
  source: string,
  ranges: Range<Decoration>[]
): void {
  const contentStartOffset = resolveListItemContentStartOffset(item, source);
  const activeMarkerEnd = item.task?.markerEnd ?? item.markerEnd;

  if (item.markerStart > item.startOffset) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-list-source-prefix"
        }
      }).range(item.startOffset, item.markerStart)
    );
  }

  if (activeMarkerEnd > item.markerStart) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-list-marker"
        }
      }).range(item.markerStart, activeMarkerEnd)
    );
  }

  appendActiveListItemHiddenPrefixDecoration(activeMarkerEnd, contentStartOffset, ranges);
}

function appendInactiveListItemHiddenPrefixDecoration(
  from: number,
  to: number,
  ranges: Range<Decoration>[]
): void {
  if (to <= from) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        class: "cm-inactive-list-source-prefix"
      }
    }).range(from, to)
  );
}

function appendActiveListItemHiddenPrefixDecoration(
  from: number,
  to: number,
  ranges: Range<Decoration>[]
): void {
  if (to <= from) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        class: "cm-active-list-source-prefix"
      }
    }).range(from, to)
  );
}

function appendListItemContinuationLineDecorations(
  lineStartOffset: number,
  lineEndOffset: number,
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  mode: "active" | "inactive",
  ranges: Range<Decoration>[]
): void {
  const sourcePrefixLength = getListContinuationSourcePrefixLength(lineStartOffset, lineEndOffset, source);
  const lineAttributes = createListItemLineAttributes(
    mode,
    item,
    source,
    ordered,
    "continuation",
    sourcePrefixLength
  );

  ranges.push(
    Decoration.line({
      attributes: lineAttributes
    }).range(lineStartOffset)
  );

  if (mode === "active" && sourcePrefixLength > 0) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-list-source-prefix"
        }
      }).range(lineStartOffset, lineStartOffset + sourcePrefixLength)
    );
  }
}

function createListItemLineAttributes(
  mode: "active" | "inactive",
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  lineKind: "first" | "continuation" = "first",
  sourcePrefixLength: number | null = null
): Record<string, string> {
  const lineClasses = [
    lineKind === "continuation" ? `cm-${mode}-list-continuation` : `cm-${mode}-list`,
    ordered ? `cm-${mode}-list-ordered` : `cm-${mode}-list-unordered`,
    `cm-${mode}-list-depth-${Math.floor(item.indent / 2)}`
  ];

  if (item.task) {
    lineClasses.push(
      `cm-${mode}-list-task`,
      item.task.checked ? `cm-${mode}-list-task-checked` : `cm-${mode}-list-task-unchecked`
    );
  }

  return {
    class: lineClasses.join(" "),
    style: `--fishmark-list-source-prefix-offset: ${getListSourcePrefixOffsetStyle(
      mode,
      sourcePrefixLength ?? getListItemSourcePrefixLength(item, source)
    )};`
  };
}

function appendInactiveBlankLineDecorations(
  source: string,
  blocks: ActiveBlockState["blockMap"]["blocks"],
  activeSelectionLineStart: number | null,
  ranges: Range<Decoration>[]
): void {
  let cursor = 0;

  for (const block of blocks) {
    appendInactiveBlankLineDecorationsInRange(
      source,
      cursor,
      block.startOffset,
      cursor > 0,
      activeSelectionLineStart,
      ranges
    );
    cursor = Math.max(cursor, block.endOffset);
  }

  appendInactiveBlankLineDecorationsInRange(
    source,
    cursor,
    source.length,
    cursor > 0,
    activeSelectionLineStart,
    ranges
  );
}

function appendInactiveBlankLineDecorationsInRange(
  source: string,
  startOffset: number,
  endOffset: number,
  skipLeadingLineBreak: boolean,
  activeSelectionLineStart: number | null,
  ranges: Range<Decoration>[]
): void {
  const contentStartOffset = skipLeadingLineBreak
    ? skipSingleLeadingLineBreak(source, startOffset, endOffset)
    : startOffset;

  for (const line of createLineInfosInRange(source, contentStartOffset, endOffset)) {
    const lineEndOffset = trimTrailingCarriageReturn(source, line.startOffset, line.endOffset);
    const lineText = source.slice(line.startOffset, lineEndOffset);

    if (lineText.trim().length > 0 || line.startOffset === activeSelectionLineStart) {
      continue;
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: "cm-inactive-blank-line"
        }
      }).range(line.startOffset)
    );
  }
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

function getListSourcePrefixOffsetStyle(
  mode: "active" | "inactive",
  sourcePrefixLength: number
): string {
  if (mode === "active") {
    return "0em";
  }

  return `${sourcePrefixLength}ch`;
}

function getListItemSourcePrefixLength(item: ListItemBlock, source: string): number {
  const contentStartOffset = resolveListItemContentStartOffset(item, source);
  return Math.max(contentStartOffset - item.startOffset, 0);
}

function getListContinuationSourcePrefixLength(
  lineStartOffset: number,
  lineEndOffset: number,
  source: string
): number {
  return Math.max(
    resolveListItemContinuationContentStartOffset(lineStartOffset, lineEndOffset, source) - lineStartOffset,
    0
  );
}

function resolveListItemContinuationContentStartOffset(
  lineStartOffset: number,
  lineEndOffset: number,
  source: string
): number {
  return consumeHorizontalSpace(
    source,
    lineStartOffset,
    trimTrailingCarriageReturn(source, lineStartOffset, lineEndOffset)
  );
}

function resolveListItemContentStartOffset(item: ListItemBlock, source: string): number {
  if (typeof item.contentStartOffset === "number") {
    return item.contentStartOffset;
  }

  const lineEndOffset = findLineEndOffset(source, item.startOffset, item.endOffset);
  let cursor = consumeHorizontalSpace(source, item.markerEnd, lineEndOffset);

  if (item.task && item.task.markerStart === cursor) {
    cursor = consumeHorizontalSpace(source, item.task.markerEnd, lineEndOffset);
  }

  return Math.min(cursor, lineEndOffset);
}

function findLineEndOffset(source: string, startOffset: number, upperBound: number): number {
  const newlineOffset = source.indexOf("\n", startOffset);
  return newlineOffset === -1 ? upperBound : Math.min(newlineOffset, upperBound);
}

function consumeHorizontalSpace(source: string, startOffset: number, endOffset: number): number {
  let cursor = startOffset;

  while (cursor < endOffset) {
    const character = source[cursor];

    if (character !== " " && character !== "\t") {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function appendInlineDecorationsForLine(
  source: string,
  contentStartOffset: number,
  lineEndOffset: number,
  active: boolean,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  const contentEndOffset = trimTrailingCarriageReturn(source, contentStartOffset, lineEndOffset);

  if (contentEndOffset <= contentStartOffset) {
    return;
  }

  const inline = parseInlineAst(source, contentStartOffset, contentEndOffset);
  if (active) {
    ranges.push(...createActiveInlineImageDecorations(inline, source, resolveImagePreviewUrl));
    ranges.push(...createActiveInlineDecorations(inline));
  } else {
    ranges.push(...createInactiveInlineDecorations(inline, { resolveImagePreviewUrl }));
  }
  ranges.push(...createCjkTextDecorations(inline));
}

function appendThematicBreakLineDecorations(
  startOffset: number,
  endOffset: number,
  ranges: Range<Decoration>[]
): void {
  ranges.push(
    Decoration.line({
      attributes: {
        class: "cm-inactive-thematic-break"
      }
    }).range(startOffset)
  );

  if (endOffset > startOffset) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-inactive-thematic-break-marker"
        }
      }).range(startOffset, endOffset)
    );
  }
}

function isExplicitThematicBreakLine(text: string): boolean {
  return /^\s{0,3}(?:\+(?:[ \t]*\+){2,}|-(?:[ \t]*-){2,})[ \t]*$/u.test(text);
}

function appendActiveDecorationsForBlock(
  block: NonNullable<ActiveBlockState["activeBlock"]>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  if (block.type === "heading") {
    ranges.push(
      Decoration.line({
        attributes: {
          class: `cm-active-heading cm-active-heading-depth-${block.depth}`
        }
      }).range(block.startOffset)
    );
    ranges.push(...createActiveInlineImageDecorations(block.inline, source, resolveImagePreviewUrl));
    ranges.push(...createActiveInlineDecorations(block.inline));
    ranges.push(...createCjkTextDecorations(block.inline));
    return;
  }

  if (block.type === "paragraph") {
    ranges.push(
      Decoration.line({
        attributes: {
          class: "cm-active-paragraph cm-active-paragraph-leading"
        }
      }).range(block.startOffset)
    );
    ranges.push(...createActiveInlineImageDecorations(block.inline, source, resolveImagePreviewUrl));
    ranges.push(...createActiveInlineDecorations(block.inline));
    ranges.push(...createCjkTextDecorations(block.inline));
    return;
  }

  if (block.type === "htmlImage") {
    ranges.push(createActiveHtmlImagePreviewDecoration(block, source, resolveImagePreviewUrl));
    return;
  }

  if (block.type === "blockquote" && block.lines) {
    for (const line of block.lines) {
      ranges.push(...createActiveInlineImageDecorations(line.inline, source, resolveImagePreviewUrl));
      ranges.push(...createActiveInlineDecorations(line.inline));
      ranges.push(...createCjkTextDecorations(line.inline));
    }
  }
}
