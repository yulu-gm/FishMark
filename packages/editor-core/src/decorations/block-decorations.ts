import { Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { type Range } from "@codemirror/state";

import {
  collectFootnoteDefinitions,
  collectReferenceDefinitions,
  parseInlineAst,
  type FootnoteDefinition,
  type DefinitionBlock,
  type ListItemBlock,
  type InlineReferenceDefinition,
  type BlockquoteMarker
} from "@fishmark/markdown-engine";

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
import { createInactiveBlockMathPreviewDecoration } from "./math-widgets";
import { createInactiveMermaidPreviewDecoration, isMermaidCodeFence } from "./mermaid-widgets";
import {
  createLineInfosInRange,
  resolveLineStartOffset,
  trimTrailingCarriageReturn
} from "../source-utils";
import { blockRequiresLeadingStructuralSeparator } from "../structural-blank-lines";
import {
  createPhysicalEditingDocument,
  type EditingLine,
  type PhysicalEditingDocument,
  type SemanticLineRole
} from "../physical-editing-document";
import type { EditorViewMode } from "../editor-view-mode";

export type CreateBlockDecorationsOptions = {
  activeBlockState: ActiveBlockState;
  activeLine?: EditingLine;
  editingDocument?: PhysicalEditingDocument;
  hasEditorFocus: boolean;
  source: string;
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
  collectReferenceDefinitionsWhenMissing?: boolean;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  viewMode?: EditorViewMode;
};

export type BlockDecorationsResult = {
  decorationSet: DecorationSet;
  signature: string;
};

export type SelectionScopedBlockDecorationsResult = BlockDecorationsResult & {
  didUpdateDecorations: boolean;
};

export type CreateSelectionScopedBlockDecorationsOptions = CreateBlockDecorationsOptions & {
  baseDecorationSet: DecorationSet;
  previousActiveBlockState: ActiveBlockState;
  previousActiveLine?: EditingLine;
};

type DecoratableBlock = ActiveBlockState["blockMap"]["blocks"][number];

type BlockDecorationContext = {
  activeBlockState: ActiveBlockState;
  activeLine: EditingLine;
  editingDocument: PhysicalEditingDocument;
  activeBlockId: string | null;
  activeTableCursor: ActiveBlockState["tableCursor"];
  activeBlockquoteInContentEdit: boolean;
  activeCodeFenceInContentEdit: boolean;
  activeListLineStart: number | null;
  activeSelectionLineStart: number | null;
  hasEditorFocus: boolean;
  source: string;
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  viewMode: EditorViewMode;
};

export function createBlockDecorations(
  options: CreateBlockDecorationsOptions
): BlockDecorationsResult {
  const context = createBlockDecorationContext(options);
  const ranges: Range<Decoration>[] = [];
  const signatures: string[] = [
    createActiveDecorationSignature(context)
  ];

  appendPhysicalLineDecorations(context, ranges);

  if (context.viewMode === "source") {
    return {
      decorationSet: Decoration.set(ranges, true),
      signature: signatures.join("|")
    };
  }

  appendInactiveBlankLineDecorations(
    context.source,
    context.activeBlockState.blockMap.blocks,
    context.activeSelectionLineStart,
    ranges
  );

  for (const block of context.activeBlockState.blockMap.blocks) {
    appendDecorationsForBlock(block, context, ranges, signatures);
  }

  return {
    decorationSet: Decoration.set(ranges, true),
    signature: signatures.join("|")
  };
}

export function createSelectionScopedBlockDecorations(
  options: CreateSelectionScopedBlockDecorationsOptions
): SelectionScopedBlockDecorationsResult {
  if (!options.hasEditorFocus) {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(createBlockDecorationContext(options)),
      didUpdateDecorations: false
    };
  }

  const context = createBlockDecorationContext({
    ...options,
    collectReferenceDefinitionsWhenMissing: false
  });
  const shouldRefreshPhysicalLineDecorations =
    options.previousActiveLine?.number !== context.activeLine.number ||
    options.previousActiveLine?.from !== context.activeLine.from;
  const shouldRefreshWhitespaceOnlyActiveLine = shouldRefreshWhitespaceOnlyLineDecorations(
    context.source,
    options.previousActiveBlockState.selection.head,
    options.activeBlockState.selection.head,
    context.hasEditorFocus
  );

  if (shouldRefreshPhysicalLineDecorations || shouldRefreshWhitespaceOnlyActiveLine) {
    const refreshed = createBlockDecorations({
      activeBlockState: options.activeBlockState,
      activeLine: context.activeLine,
      editingDocument: context.editingDocument,
      hasEditorFocus: options.hasEditorFocus,
      source: options.source,
      referenceDefinitions: options.referenceDefinitions,
      footnoteDefinitions: options.footnoteDefinitions,
      collectReferenceDefinitionsWhenMissing: false,
      resolveImagePreviewUrl: options.resolveImagePreviewUrl,
      tableWidgetCallbacks: options.tableWidgetCallbacks,
      viewMode: options.viewMode
    });

    return {
      ...refreshed,
      didUpdateDecorations: true
    };
  }

  const affectedBlocks = collectSelectionAffectedBlocks(
    options.previousActiveBlockState,
    options.activeBlockState
  );

  if (context.viewMode === "source") {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(context),
      didUpdateDecorations: false
    };
  }

  if (affectedBlocks.length === 0) {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(context),
      didUpdateDecorations: false
    };
  }

  let decorationSet = options.baseDecorationSet;

  for (const block of affectedBlocks) {
    const blockRanges: Range<Decoration>[] = [];
    const span = createBlockDecorationSpan(block, context.source);

    appendDecorationsForBlock(block, context, blockRanges);
    decorationSet = decorationSet.update({
      filterFrom: span.from,
      filterTo: span.to,
      filter: (from, to) => !rangeTouchesSpan(from, to, span),
      add: blockRanges,
      sort: true
    });
  }

  return {
    decorationSet,
    signature: createScopedSelectionSignature(context),
    didUpdateDecorations: true
  };
}

function createBlockDecorationContext(
  options: CreateBlockDecorationsOptions
): BlockDecorationContext {
  const {
    activeBlockState,
    hasEditorFocus,
    source,
    referenceDefinitions: providedReferenceDefinitions,
    footnoteDefinitions: providedFootnoteDefinitions,
    resolveImagePreviewUrl,
    tableWidgetCallbacks
  } = options;
  const editingDocument = options.editingDocument ??
    createPhysicalEditingDocument(source, activeBlockState.blockMap);
  const activeLine = options.activeLine ??
    editingDocument.getLineAtOffset(activeBlockState.selection.head) ??
    editingDocument.lines[0]!;
  const activeBlockId = hasEditorFocus ? activeBlockState.activeBlock?.id ?? null : null;
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
  const shouldCollectReferenceDefinitions = options.collectReferenceDefinitionsWhenMissing !== false;
  const referenceDefinitions = providedReferenceDefinitions ??
    activeBlockState.blockMap.referenceDefinitions ??
    (shouldCollectReferenceDefinitions ? collectReferenceDefinitions(source) : undefined);
  const footnoteDefinitions = providedFootnoteDefinitions ??
    activeBlockState.blockMap.footnoteDefinitions ??
    (shouldCollectReferenceDefinitions ? collectFootnoteDefinitions(source) : undefined);
  return {
    activeBlockState,
    activeLine,
    editingDocument,
    activeBlockId,
    activeTableCursor: activeBlockState.tableCursor,
    activeBlockquoteInContentEdit,
    activeCodeFenceInContentEdit,
    activeListLineStart,
    activeSelectionLineStart,
    hasEditorFocus,
    source,
    referenceDefinitions,
    footnoteDefinitions,
    resolveImagePreviewUrl,
    tableWidgetCallbacks,
    viewMode: options.viewMode ?? "wysiwym"
  };
}

function appendDecorationsForBlock(
  block: DecoratableBlock,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[]
): void {
  if (block.type === "table") {
    const cursorForBlock =
      context.activeTableCursor?.mode === "inside" &&
      context.activeTableCursor.tableStartOffset === block.startOffset
        ? context.activeTableCursor
        : null;

    signatures?.push(
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
        context.tableWidgetCallbacks ?? null,
        context.footnoteDefinitions
      )
    );
    return;
  }

  if (block.id === context.activeBlockId) {
    if (context.activeBlockquoteInContentEdit && block.type === "blockquote") {
      signatures?.push(`${createBlockDecorationSignature(block)}:content-edit`);
      appendBlockquoteDecorations(
        block,
        context,
        ranges,
        context.activeSelectionLineStart
      );
      return;
    }

    if (context.activeCodeFenceInContentEdit && block.type === "codeFence") {
      signatures?.push(`${createBlockDecorationSignature(block)}:content-edit`);
      appendCodeFenceDecorations(block.startOffset, block.endOffset, context.source, ranges, block.info, block.kind);
      return;
    }

    if (block.type === "list") {
      signatures?.push(`${createBlockDecorationSignature(block)}:line-edit:${context.activeListLineStart ?? "none"}`);
      appendActiveListDecorations(
        block,
        context.source,
        context.activeListLineStart,
        ranges,
        context.resolveImagePreviewUrl,
        context.referenceDefinitions,
        context.footnoteDefinitions
      );
      return;
    }

    appendActiveDecorationsForBlock(block, context.source, ranges, context.resolveImagePreviewUrl);
    return;
  }

  signatures?.push(createBlockDecorationSignature(block));

  appendInactiveDecorationsForBlock(block, context, ranges);
}

function appendInactiveDecorationsForBlock(
  block: DecoratableBlock,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[]
): void {
  if (block.type === "htmlImage") {
    ranges.push(createInactiveHtmlImagePreviewDecoration(block, context.resolveImagePreviewUrl));
    return;
  }

  if (block.type === "heading") {
    const markerEnd = getInactiveHeadingMarkerEnd(block.startOffset, block.depth, context.source);
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
    ranges.push(...createInactiveInlineDecorations(block.inline, {
      resolveImagePreviewUrl: context.resolveImagePreviewUrl
    }));
    return;
  }

  if (block.type === "paragraph") {
    ranges.push(
      Decoration.line({
        attributes: {
          class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
        }
      }).range(block.startOffset)
    );
    ranges.push(...createInactiveInlineDecorations(block.inline, {
      resolveImagePreviewUrl: context.resolveImagePreviewUrl
    }));
    return;
  }

  if (block.type === "list") {
      appendInactiveListDecorations(
        block,
        context.source,
        ranges,
        context.resolveImagePreviewUrl,
        context.referenceDefinitions,
        context.footnoteDefinitions
      );
    return;
  }

  if (block.type === "blockquote") {
    appendBlockquoteDecorations(
      block,
      context,
      ranges
    );
    return;
  }

  if (block.type === "codeFence") {
    if (isMermaidCodeFence(block, context.source)) {
      ranges.push(createInactiveMermaidPreviewDecoration(block, context.source).range(block.startOffset, block.endOffset));
      return;
    }

    appendCodeFenceDecorations(block.startOffset, block.endOffset, context.source, ranges, block.info, block.kind);
    return;
  }

  if (block.type === "blockMath") {
    if (block.closed) {
      ranges.push(createInactiveBlockMathPreviewDecoration(block).range(block.startOffset, block.endOffset));
    }
    return;
  }

  if (block.type === "definition") {
    if (block.footnoteDefinition?.status === "valid") {
      appendInactiveFootnoteDefinitionDecorations(
        block,
        ranges,
        context.resolveImagePreviewUrl
      );
      return;
    }

    if (block.footnoteDefinition) {
      return;
    }

    ranges.push(Decoration.replace({ block: true }).range(block.startOffset, block.endOffset));
    return;
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

function collectSelectionAffectedBlocks(
  previousActiveBlockState: ActiveBlockState,
  nextActiveBlockState: ActiveBlockState
): DecoratableBlock[] {
  const blocks: DecoratableBlock[] = [];

  appendUniqueBlock(blocks, previousActiveBlockState.activeBlock);
  appendUniqueBlock(blocks, nextActiveBlockState.activeBlock);

  return blocks;
}

function appendUniqueBlock(blocks: DecoratableBlock[], block: DecoratableBlock | null): void {
  if (!block || blocks.some((entry) => entry.id === block.id)) {
    return;
  }

  blocks.push(block);
}

function shouldRefreshWhitespaceOnlyLineDecorations(
  source: string,
  previousSelectionHead: number,
  nextSelectionHead: number,
  hasEditorFocus: boolean
): boolean {
  if (!hasEditorFocus) {
    return false;
  }

  return (
    isSelectionOnWhitespaceOnlySourceLine(source, previousSelectionHead) ||
    isSelectionOnWhitespaceOnlySourceLine(source, nextSelectionHead)
  );
}

function isSelectionOnWhitespaceOnlySourceLine(source: string, selectionHead: number): boolean {
  const lineStart = resolveLineStartOffset(source, selectionHead);
  let lineEnd = source.indexOf("\n", lineStart);

  if (lineEnd < 0) {
    lineEnd = source.length;
  }

  const trimmedLineEnd = trimTrailingCarriageReturn(source, lineStart, lineEnd);
  const lineText = source.slice(lineStart, trimmedLineEnd);

  return lineText.length > 0 && lineText.trim().length === 0;
}

function createBlockDecorationSpan(
  block: DecoratableBlock,
  source: string
): { from: number; to: number } {
  return {
    from: block.startOffset,
    to: Math.min(source.length, Math.max(block.endOffset, block.startOffset + 1))
  };
}

function rangeTouchesSpan(
  from: number,
  to: number,
  span: { from: number; to: number }
): boolean {
  if (from === to) {
    return from >= span.from && from <= span.to;
  }

  return from < span.to && to > span.from;
}

function createActiveDecorationSignature(context: BlockDecorationContext): string {
  return [
    `view-mode:${context.viewMode}`,
    `active:${context.activeBlockId ?? "none"}`,
    `blank-line:${context.activeSelectionLineStart ?? "none"}`,
    `physical-line:${context.hasEditorFocus ? context.activeLine.number : "none"}:${context.activeLine.from}:${context.activeLine.to}:${context.activeLine.kind}`
  ].join(":");
}

function createScopedSelectionSignature(context: BlockDecorationContext): string {
  return [
    "scoped-selection",
    createActiveDecorationSignature(context),
    context.activeBlockState.tableCursor?.mode ?? "none",
    context.activeBlockState.tableCursor?.mode === "inside"
      ? `${context.activeBlockState.tableCursor.tableStartOffset}:${context.activeBlockState.tableCursor.row}:${context.activeBlockState.tableCursor.column}`
      : ""
  ].join(":");
}

function appendPhysicalLineDecorations(
  context: BlockDecorationContext,
  ranges: Range<Decoration>[]
): void {
  for (const line of context.editingDocument.lines) {
    const semanticLine = context.editingDocument.semanticLineMap.byLineNumber.get(line.number);
    const classNames = createPhysicalLineClassNames(
      line,
      semanticLine?.role ?? null,
      context.hasEditorFocus && line.number === context.activeLine.number
    );

    ranges.push(
      Decoration.line({
        attributes: {
          class: classNames.join(" ")
        }
      }).range(line.from)
    );
  }
}

function createPhysicalLineClassNames(
  line: EditingLine,
  role: SemanticLineRole | null,
  isActiveLine: boolean
): string[] {
  const classNames = [
    "cm-fm-line",
    `cm-fm-line-${line.kind}`
  ];

  if (isActiveLine) {
    classNames.push("cm-fm-line-active");
  }

  if (role === "structural-separator") {
    classNames.push("cm-fm-line-structural-separator");
  }

  if (role === "extra-blank") {
    classNames.push("cm-fm-line-extra-blank");
  }

  return classNames;
}

function appendCodeFenceDecorations(
  startOffset: number,
  endOffset: number,
  source: string,
  ranges: Range<Decoration>[],
  info: string | null = null,
  blockKind: "fenced" | "indented" = "fenced"
): void {
  let contentStart: number | null = null;
  let contentEnd: number | null = null;
  const languageLabel = formatLanguageLabel(info);

  for (const line of getInactiveCodeFenceLines(startOffset, endOffset, source, blockKind)) {
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

    if (line.contentStart > line.lineStart) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-code-block-indent-marker"
          }
        }).range(line.lineStart, line.contentStart)
      );
    }

    if (contentStart === null) {
      contentStart = line.contentStart;
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
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  activeLineStart: number | null = null
): void {
  const source = context.source;
  const resolveImagePreviewUrl = context.resolveImagePreviewUrl;

  if (block.lines) {
    const renderableLines = getRenderableBlockquoteLines(block.lines);
    const lineCount = renderableLines.length;
    const shouldRenderInnerBlocks = Boolean(block.innerBlocks && block.innerBlocks.length > 0);
    const activeLineInnerBlock =
      activeLineStart !== null && block.innerBlocks
        ? findInnerBlockTouchingLine(block.innerBlocks, activeLineStart, source)
        : null;

    renderableLines.forEach((line, index) => {
      if (lineCount === 0) {
        return;
      }

      const draftMarker = activeLineStart === line.startOffset
        ? resolveActiveDraftBlockquoteMarker({
            lineStartOffset: line.startOffset,
            markerEndOffset: line.markerEnd,
            contentStartOffset: line.contentStartOffset,
            contentEndOffset: line.contentEndOffset,
            markers: line.markers
          }, context.activeBlockState.selection)
        : null;

      if (draftMarker?.quoteDepth === 0) {
        return;
      }

      const quoteDepth = draftMarker?.quoteDepth ?? line.quoteDepth;
      const isSeparatorLine = draftMarker === null && isBareBlockquoteSeparatorLine(line, line.contentEndOffset);
      const lineClasses = [
        "cm-inactive-blockquote",
        createInactiveBlockquoteDepthClass(quoteDepth)
      ];

      if (isSeparatorLine) {
        lineClasses.push("cm-inactive-blockquote-separator");
      }

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

      if (activeLineStart === line.startOffset) {
        if (draftMarker) {
          appendActiveDraftBlockquoteSourcePrefixDecorations(
            line.startOffset,
            draftMarker,
            ranges
          );
        } else {
          appendActiveBlockquoteSourcePrefixDecorations(
            line.startOffset,
            line.markerEnd,
            line.contentStartOffset,
            ranges
          );
        }
      } else if (line.contentStartOffset > line.startOffset) {
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-blockquote-marker"
            }
          }).range(line.startOffset, line.contentStartOffset)
        );
      }

      if (shouldRenderInnerBlocks) {
        if (activeLineStart === line.startOffset && activeLineInnerBlock?.type !== "list") {
          ranges.push(...createActiveInlineImageDecorations(line.inline, source, resolveImagePreviewUrl));
          ranges.push(...createActiveInlineDecorations(line.inline));
        }
        return;
      }

      if (activeLineStart !== null) {
        ranges.push(...createActiveInlineImageDecorations(line.inline, source, resolveImagePreviewUrl));
        ranges.push(...createActiveInlineDecorations(line.inline));
      } else {
        ranges.push(...createInactiveInlineDecorations(line.inline, {
          resolveImagePreviewUrl
        }));
      }
    });

    if (block.innerBlocks && block.innerBlocks.length > 0) {
      appendBlockquoteInnerBlockDecorations(block.innerBlocks, context, ranges, activeLineStart);
    }

    return;
  }

  const renderableLines = getRenderableBlockquoteLines(
    getInactiveBlockquoteLines(block.startOffset, block.endOffset, source)
  );
  const lineCount = renderableLines.length;

  for (const [index, line] of renderableLines.entries()) {
    if (lineCount === 0) {
      continue;
    }

    const contentEndOffset = trimTrailingCarriageReturn(source, line.lineStart, line.lineEnd);
    const draftMarker = activeLineStart === line.lineStart
      ? resolveActiveDraftBlockquoteMarker({
          lineStartOffset: line.lineStart,
          markerEndOffset: line.markerEnd,
          contentStartOffset: line.contentStartOffset,
          contentEndOffset,
          markers: line.markers
        }, context.activeBlockState.selection)
      : null;

    if (draftMarker?.quoteDepth === 0) {
      continue;
    }

    const quoteDepth = draftMarker?.quoteDepth ?? line.quoteDepth;
    const isSeparatorLine = draftMarker === null && isBareBlockquoteSeparatorLine(
      line,
      contentEndOffset
    );
    const lineClasses = [
      "cm-inactive-blockquote",
      createInactiveBlockquoteDepthClass(quoteDepth)
    ];

    if (isSeparatorLine) {
      lineClasses.push("cm-inactive-blockquote-separator");
    }

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

    if (activeLineStart === line.lineStart) {
      if (draftMarker) {
        appendActiveDraftBlockquoteSourcePrefixDecorations(
          line.lineStart,
          draftMarker,
          ranges
        );
      } else {
        appendActiveBlockquoteSourcePrefixDecorations(
          line.lineStart,
          line.markerEnd,
          line.contentStartOffset,
          ranges
        );
      }
    } else if (line.contentStartOffset > line.lineStart) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-blockquote-marker"
          }
        }).range(line.lineStart, line.contentStartOffset)
      );
    }
  }
}

function appendActiveBlockquoteSourcePrefixDecorations(
  lineStartOffset: number,
  markerEndOffset: number,
  contentStartOffset: number,
  ranges: Range<Decoration>[]
): void {
  if (markerEndOffset > lineStartOffset) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-blockquote-marker"
        }
      }).range(lineStartOffset, markerEndOffset)
    );
  }

  if (contentStartOffset > markerEndOffset) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-blockquote-padding-anchor"
        }
      }).range(markerEndOffset, contentStartOffset)
    );
  }
}

type DraftBlockquoteMarker = {
  hiddenPrefixEndOffset: number;
  quoteDepth: number;
};

function resolveActiveDraftBlockquoteMarker(
  line: {
    lineStartOffset: number;
    markerEndOffset: number;
    contentStartOffset: number;
    contentEndOffset: number;
    markers: readonly BlockquoteMarker[];
  },
  selection: ActiveBlockState["selection"]
): DraftBlockquoteMarker | null {
  if (
    selection.anchor !== selection.head ||
    selection.head !== line.contentEndOffset ||
    line.markerEndOffset !== line.contentStartOffset ||
    line.contentEndOffset !== line.contentStartOffset
  ) {
    return null;
  }

  const lastMarker = line.markers.at(-1);
  if (!lastMarker || lastMarker.markerEnd !== line.markerEndOffset) {
    return null;
  }

  return {
    hiddenPrefixEndOffset: lastMarker.markerStart,
    quoteDepth: Math.max(0, line.markers.length - 1)
  };
}

function appendActiveDraftBlockquoteSourcePrefixDecorations(
  lineStartOffset: number,
  draftMarker: DraftBlockquoteMarker,
  ranges: Range<Decoration>[]
): void {
  if (draftMarker.hiddenPrefixEndOffset <= lineStartOffset) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        class: "cm-active-blockquote-marker"
      }
    }).range(lineStartOffset, draftMarker.hiddenPrefixEndOffset)
  );
}

function appendBlockquoteInnerBlockDecorations(
  innerBlocks: readonly DecoratableBlock[],
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  activeLineStart: number | null
): void {
  for (const innerBlock of innerBlocks) {
    if (activeLineStart !== null && blockTouchesLine(innerBlock, activeLineStart, context.source)) {
      if (innerBlock.type === "list") {
        appendActiveListDecorations(
          innerBlock,
          context.source,
          activeLineStart,
          ranges,
          context.resolveImagePreviewUrl,
          context.referenceDefinitions,
          context.footnoteDefinitions
        );
      }

      continue;
    }

    if (innerBlock.type === "blockMath") {
      if (innerBlock.closed) {
        ranges.push(
          createInactiveBlockMathPreviewDecoration(innerBlock, {
            className: "cm-math-preview-blockquote"
          }).range(innerBlock.startOffset, innerBlock.endOffset)
        );
      }
      continue;
    }

    appendInactiveDecorationsForBlock(innerBlock, context, ranges);
  }
}

function findInnerBlockTouchingLine(
  innerBlocks: readonly DecoratableBlock[],
  lineStart: number,
  source: string
): DecoratableBlock | null {
  return innerBlocks.find((innerBlock) => blockTouchesLine(innerBlock, lineStart, source)) ?? null;
}

function blockTouchesLine(block: DecoratableBlock, lineStart: number, source: string): boolean {
  const lineEnd = findLineEndOffset(source, lineStart, source.length);
  return block.startOffset <= lineEnd && block.endOffset >= lineStart;
}

function createInactiveBlockquoteDepthClass(depth: number): string {
  return `cm-inactive-blockquote-depth-${Math.max(1, Math.min(depth, 4))}`;
}

function hasRenderableBlockquotePresentation(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "blockquote" }>,
  source: string
): boolean {
  if (block.lines) {
    return hasCommittedRichBlockquoteLine(block.lines);
  }

  return hasCommittedRichBlockquoteLine(getInactiveBlockquoteLines(block.startOffset, block.endOffset, source));
}

function getRenderableBlockquoteLines<T extends {
  contentStartOffset: number;
  markerEnd: number;
  quoteDepth: number;
}>(lines: readonly T[]): T[] {
  if (!hasCommittedRichBlockquoteLine(lines)) {
    return [];
  }

  return lines.filter((line) => line.quoteDepth > 0);
}

function hasCommittedRichBlockquoteLine<T extends {
  contentStartOffset: number;
  markerEnd: number;
  quoteDepth: number;
}>(lines: readonly T[]): boolean {
  return lines.some((line) => line.quoteDepth > 0);
}

function isBareBlockquoteSeparatorLine(
  line: {
    contentStartOffset: number;
    markerEnd: number;
    quoteDepth: number;
  },
  contentEndOffset: number
): boolean {
  return (
    line.quoteDepth > 0 &&
    line.contentStartOffset === line.markerEnd &&
    contentEndOffset === line.contentStartOffset
  );
}

function isCodeFenceContentSelection(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "codeFence" }>,
  selectionHead: number,
  source: string
): boolean {
  const line = getInactiveCodeFenceLines(block.startOffset, block.endOffset, source, block.kind).find(
    (entry) => selectionHead >= entry.lineStart && selectionHead <= entry.lineEnd
  );

  return line?.kind === "content";
}

function appendInactiveFootnoteDefinitionDecorations(
  block: DefinitionBlock,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  const definition = block.footnoteDefinition;

  if (!definition || definition.status !== "valid") {
    return;
  }

  const lines = definition.lines;

  for (const [index, line] of lines.entries()) {
    const lineClasses = ["cm-inactive-footnote-definition"];

    if (index === 0) {
      lineClasses.push("cm-inactive-footnote-definition-start");
    }

    if (index === lines.length - 1) {
      lineClasses.push("cm-inactive-footnote-definition-end");
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: lineClasses.join(" ")
        }
      }).range(line.startOffset)
    );

    if (line.contentStartOffset > line.startOffset) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-footnote-definition-marker"
          }
        }).range(line.startOffset, line.contentStartOffset)
      );
    }

    ranges.push(...createInactiveInlineDecorations(line.inline, {
      resolveImagePreviewUrl
    }));
  }
}

function appendInactiveListDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  appendInactiveListScopeDecorations(
    block,
    source,
    ranges,
    resolveImagePreviewUrl,
    referenceDefinitions,
    footnoteDefinitions
  );
}

function appendInactiveListScopeDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  for (const item of block.items) {
    appendListItemDecorations(
      item,
      source,
      null,
      block.ordered,
      ranges,
      resolveImagePreviewUrl,
      referenceDefinitions,
      footnoteDefinitions
    );

    for (const child of item.children) {
      appendInactiveListScopeDecorations(
        child,
        source,
        ranges,
        resolveImagePreviewUrl,
        referenceDefinitions,
        footnoteDefinitions
      );
    }
  }
}

function appendActiveListDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  activeLineStart: number | null,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  appendActiveListScopeDecorations(
    block,
    source,
    activeLineStart,
    ranges,
    resolveImagePreviewUrl,
    referenceDefinitions,
    footnoteDefinitions
  );
}

function appendActiveListScopeDecorations(
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "list" }>,
  source: string,
  activeLineStart: number | null,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  for (const item of block.items) {
    appendListItemDecorations(
      item,
      source,
      activeLineStart,
      block.ordered,
      ranges,
      resolveImagePreviewUrl,
      referenceDefinitions,
      footnoteDefinitions
    );

    for (const child of item.children) {
      appendActiveListScopeDecorations(
        child,
        source,
        activeLineStart,
        ranges,
        resolveImagePreviewUrl,
        referenceDefinitions,
        footnoteDefinitions
      );
    }
  }
}

function appendListItemDecorations(
  item: ListItemBlock,
  source: string,
  activeLineStart: number | null,
  ordered: boolean,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  const contentEndOffset = item.children[0]?.startOffset ?? item.endOffset;
  const lines = createLineInfosInRange(source, item.startOffset, contentEndOffset);

  for (const line of lines) {
    const isFirstLine = line.startOffset === item.startOffset;
    const isActiveLine = activeLineStart === line.startOffset;

    if (isFirstLine) {
      if (isActiveLine) {
        appendActiveListItemFirstLineDecorations(item, source, ordered, ranges);
        appendInlineDecorationsForLine(
          source,
          resolveListItemContentStartOffset(item, source),
          line.endOffset,
          true,
          ranges,
          resolveImagePreviewUrl,
          referenceDefinitions,
          footnoteDefinitions
        );
        continue;
      }

      appendInactiveListItemFirstLineDecorations(item, source, ordered, ranges);
      appendInlineDecorationsForLine(
        source,
        resolveListItemContentStartOffset(item, source),
        line.endOffset,
        false,
        ranges,
        resolveImagePreviewUrl,
        referenceDefinitions,
        footnoteDefinitions
      );

      continue;
    }

    if (isActiveLine) {
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
        "active",
        ranges
      );
      appendInlineDecorationsForLine(
        source,
        continuationContentStartOffset,
        line.endOffset,
        true,
        ranges,
        resolveImagePreviewUrl,
        referenceDefinitions,
        footnoteDefinitions
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
      resolveImagePreviewUrl,
      referenceDefinitions,
      footnoteDefinitions
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

class ActiveListMarkerWidget extends WidgetType {
  constructor(private readonly marker: string) {
    super();
  }

  override eq(other: ActiveListMarkerWidget): boolean {
    return other.marker === this.marker;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "cm-active-list-marker";
    marker.dataset.fishmarkListMarker = this.marker;
    marker.textContent = this.marker;

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
  const activeMarkerText = source.slice(item.markerStart, activeMarkerEnd);

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
      Decoration.replace({
        widget: new ActiveListMarkerWidget(activeMarkerText)
      }).range(item.markerStart, activeMarkerEnd)
    );
  }

  if (contentStartOffset > activeMarkerEnd) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-active-list-padding-anchor"
        }
      }).range(activeMarkerEnd, contentStartOffset)
    );
  }
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
  const hiddenLineStarts = new Set<number>();

  for (const block of blocks) {
    appendInactiveBlankLineDecorationsInRange(
      source,
      cursor,
      block.startOffset,
      cursor > 0,
      activeSelectionLineStart,
      hiddenLineStarts,
      ranges
    );
    appendLeadingBlockSeparatorDecoration(
      source,
      block,
      activeSelectionLineStart,
      hiddenLineStarts,
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
    hiddenLineStarts,
    ranges
  );
}

function appendInactiveBlankLineDecorationsInRange(
  source: string,
  startOffset: number,
  endOffset: number,
  skipLeadingLineBreak: boolean,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  const contentStartOffset = skipLeadingLineBreak
    ? skipSingleLeadingLineBreak(source, startOffset, endOffset)
    : startOffset;
  let emptyLineRunIndex = 0;

  for (const line of createLineInfosInRange(source, contentStartOffset, endOffset)) {
    const lineEndOffset = trimTrailingCarriageReturn(source, line.startOffset, line.endOffset);
    const lineText = source.slice(line.startOffset, lineEndOffset);

    if (lineText.length > 0) {
      emptyLineRunIndex = 0;
      continue;
    }

    emptyLineRunIndex += 1;

    if (line.startOffset === activeSelectionLineStart) {
      continue;
    }

    if (emptyLineRunIndex % 2 === 0) {
      continue;
    }

    appendInactiveBlankLineDecoration(line.startOffset, activeSelectionLineStart, hiddenLineStarts, ranges);
  }
}

function appendLeadingBlockSeparatorDecoration(
  source: string,
  block: DecoratableBlock,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  if (!blockRequiresLeadingStructuralSeparator(block) || block.startOffset <= 0) {
    return;
  }

  const previousLineEnd = source[block.startOffset - 1] === "\n" ? block.startOffset - 1 : block.startOffset;
  const previousLineStart = resolveLineStartOffset(source, previousLineEnd);
  const contentEnd = trimTrailingCarriageReturn(source, previousLineStart, previousLineEnd);

  if (source.slice(previousLineStart, contentEnd).length !== 0) {
    return;
  }

  appendInactiveBlankLineDecoration(previousLineStart, activeSelectionLineStart, hiddenLineStarts, ranges);
}

function appendInactiveBlankLineDecoration(
  lineStart: number,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  if (lineStart === activeSelectionLineStart || hiddenLineStarts.has(lineStart)) {
    return;
  }

  hiddenLineStarts.add(lineStart);
  ranges.push(
    Decoration.line({
      attributes: {
        class: "cm-inactive-blank-line"
      }
    }).range(lineStart)
  );
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
  resolveImagePreviewUrl?: (href: string | null) => string | null,
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>
): void {
  const contentEndOffset = trimTrailingCarriageReturn(source, contentStartOffset, lineEndOffset);

  if (contentEndOffset <= contentStartOffset) {
    return;
  }

  const inline = parseInlineAst(source, contentStartOffset, contentEndOffset, {
    referenceDefinitions,
    footnoteDefinitions
  });
  if (active) {
    ranges.push(...createActiveInlineImageDecorations(inline, source, resolveImagePreviewUrl));
    ranges.push(...createActiveInlineDecorations(inline));
  } else {
    ranges.push(...createInactiveInlineDecorations(inline, {
      resolveImagePreviewUrl
    }));
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
