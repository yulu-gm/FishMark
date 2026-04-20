import { Decoration, type DecorationSet } from "@codemirror/view";
import { type Range } from "@codemirror/state";

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
  const ranges: Range<Decoration>[] = [];
  const signatures: string[] = [];

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
        signatures.push(`${createBlockDecorationSignature(block)}:content-edit`);
        appendInactiveListDecorations(block, ranges, resolveImagePreviewUrl);
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
      appendInactiveListDecorations(block, ranges, resolveImagePreviewUrl);
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
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  appendInactiveListScopeDecorations(block, ranges, resolveImagePreviewUrl);
}

function appendInactiveListScopeDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  for (const item of block.items) {
    const lineClasses = [
      "cm-inactive-list",
      block.ordered ? "cm-inactive-list-ordered" : "cm-inactive-list-unordered",
      `cm-inactive-list-depth-${Math.floor(item.indent / 2)}`
    ];

    if (item.task) {
      lineClasses.push(
        "cm-inactive-list-task",
        item.task.checked
          ? "cm-inactive-list-task-checked"
          : "cm-inactive-list-task-unchecked"
      );
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: lineClasses.join(" ")
        }
      }).range(item.startOffset)
    );

    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-inactive-list-marker"
        }
      }).range(item.markerStart, item.markerEnd)
    );

    if (item.task) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: [
              "cm-inactive-task-marker",
              item.task.checked
                ? "cm-inactive-task-marker-checked"
                : "cm-inactive-task-marker-unchecked"
            ].join(" "),
            "data-task-state": item.task.checked ? "checked" : "unchecked"
          }
        }).range(item.task.markerStart, item.task.markerEnd)
      );
    }

    ranges.push(...createInactiveInlineDecorations(item.inline, { resolveImagePreviewUrl }));

    for (const child of item.children) {
      appendInactiveListScopeDecorations(child, ranges, resolveImagePreviewUrl);
    }
  }
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
