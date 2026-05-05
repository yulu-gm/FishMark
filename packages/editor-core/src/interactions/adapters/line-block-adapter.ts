import type {
  BlockquoteBlock,
  MarkdownBlock,
  HeadingBlock,
  ListBlock,
  ListItemBlock,
  TableBlock,
  ThematicBreakBlock
} from "@fishmark/markdown-engine";

import {
  anchorForVisibleLineColumn,
  createVisibleLine,
  visibleLineColumn
} from "../../line-visibility";
import { findListItemAtLineStart } from "../../list-utils";
import type {
  BlockInteractionAdapter,
  PointerInteractionContext,
  VerticalInteractionContext,
  VerticalNavigationResult
} from "../types";

function isPointerWithinLeftPadding(context: PointerInteractionContext): boolean {
  return (
    context.event.clientX >= context.rect.left &&
    context.event.clientX <= context.rect.left + context.paddingLeft
  );
}

function findLastListItem(block: ListBlock): ListItemBlock | null {
  const lastItem = block.items.at(-1) ?? null;

  if (!lastItem) {
    return null;
  }

  const lastChild = lastItem.children.at(-1);

  return lastChild ? (findLastListItem(lastChild) ?? lastItem) : lastItem;
}

function findBlockForLine(
  blocks: readonly MarkdownBlock[],
  lineNumber: number
): MarkdownBlock | null {
  for (const block of blocks) {
    if (lineNumber >= block.startLine && lineNumber <= block.endLine) {
      return block;
    }
  }

  return null;
}

function resolveVisibleListItemStartAnchor(item: ListItemBlock): number {
  return item.contentStartOffset ?? item.markerEnd;
}

function resolveVisibleBlockEntryAnchor(block: MarkdownBlock, direction: "start" | "end"): number | null {
  switch (block.type) {
    case "heading":
      return direction === "start"
        ? ((block as HeadingBlock).markerEnd ?? block.startOffset)
        : block.endOffset;
    case "paragraph":
      return direction === "start"
        ? block.startOffset
        : block.endOffset;
    case "thematicBreak":
      return block.startOffset;
    case "blockquote": {
      const lines = (block as BlockquoteBlock).lines;
      const line = direction === "start" ? lines?.[0] : lines?.at(-1);

      return line?.contentStartOffset ?? block.startOffset;
    }
    case "list": {
      const listBlock = block as ListBlock;
      const item =
        direction === "start"
          ? (listBlock.items[0] ?? null)
          : findLastListItem(listBlock);

      if (!item) {
        return block.startOffset;
      }

      return resolveVisibleListItemStartAnchor(item);
    }
    case "table": {
      const tableBlock = block as TableBlock;
      const lastRow = tableBlock.rows.at(-1) ?? null;
      const cell =
        direction === "start"
          ? (tableBlock.header[0] ?? tableBlock.rows[0]?.[0] ?? null)
          : (lastRow?.at(-1) ?? tableBlock.header.at(-1) ?? null);

      return direction === "start"
        ? cell?.contentStartOffset ?? block.startOffset
        : cell?.contentEndOffset ?? block.endOffset;
    }
    case "htmlImage":
      return direction === "start" ? block.startOffset : block.endOffset;
    default:
      return null;
  }
}

function isBlankLineText(text: string): boolean {
  return text.trim().length === 0;
}

function isSourceBlankLineOutsideBlock(context: VerticalInteractionContext, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return false;
  }

  const line = context.view.state.doc.line(lineNumber);

  return isBlankLineText(line.text) && !findBlockForLine(context.document.blocks, lineNumber);
}

function isStructuralSeparatorLine(context: VerticalInteractionContext, lineNumber: number): boolean {
  if (!isSourceBlankLineOutsideBlock(context, lineNumber) || lineNumber <= 1) {
    return false;
  }

  const previousLine = context.view.state.doc.line(lineNumber - 1);

  return !isBlankLineText(previousLine.text) && findBlockForLine(context.document.blocks, previousLine.number) !== null;
}

function findBlockAboveStructuralSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): MarkdownBlock | null {
  if (!isStructuralSeparatorLine(context, lineNumber)) {
    return null;
  }

  return findBlockForLine(context.document.blocks, lineNumber - 1);
}

function findBlockBelowStructuralSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): MarkdownBlock | null {
  if (!isStructuralSeparatorLine(context, lineNumber)) {
    return null;
  }

  let candidateLineNumber = lineNumber + 1;

  while (isSourceBlankLineOutsideBlock(context, candidateLineNumber)) {
    candidateLineNumber += 1;
  }

  if (candidateLineNumber > context.view.state.doc.lines) {
    return null;
  }

  return findBlockForLine(context.document.blocks, candidateLineNumber);
}

function isVisibleExtraBlankLineImmediatelyAfterSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): boolean {
  return isSourceBlankLineOutsideBlock(context, lineNumber) && isStructuralSeparatorLine(context, lineNumber - 1);
}

function resolveLineAfterStructuralSeparator(context: VerticalInteractionContext, lineNumber: number): number | null {
  if (!isStructuralSeparatorLine(context, lineNumber)) {
    return null;
  }

  const nextLineNumber = lineNumber + 1;

  if (nextLineNumber > context.view.state.doc.lines) {
    return null;
  }

  if (isSourceBlankLineOutsideBlock(context, nextLineNumber)) {
    return context.view.state.doc.line(nextLineNumber).from;
  }

  const blockBelow = findBlockBelowStructuralSeparator(context, lineNumber);

  return blockBelow ? resolveVisibleBlockEntryAnchor(blockBelow, "start") : null;
}

function resolveCollapsedSeparatorArrowUp(context: VerticalInteractionContext): number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isStructuralSeparatorLine(context, currentLine.number)) {
    const blockAbove = findBlockAboveStructuralSeparator(context, currentLine.number);

    return blockAbove ? resolveVisibleBlockEntryAnchor(blockAbove, "end") : null;
  }

  if (isVisibleExtraBlankLineImmediatelyAfterSeparator(context, currentLine.number)) {
    const blockAbove = findBlockAboveStructuralSeparator(context, currentLine.number - 1);

    return blockAbove ? resolveVisibleBlockEntryAnchor(blockAbove, "end") : null;
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);

  if (!currentBlock || currentLine.number !== currentBlock.startLine) {
    return null;
  }

  const previousLineNumber = currentLine.number - 1;

  if (isSourceBlankLineOutsideBlock(context, previousLineNumber)) {
    if (!isStructuralSeparatorLine(context, previousLineNumber)) {
      return context.view.state.doc.line(previousLineNumber).from;
    }

    const blockAbove = findBlockAboveStructuralSeparator(context, previousLineNumber);

    return blockAbove ? resolveVisibleBlockEntryAnchor(blockAbove, "end") : null;
  }

  return null;
}

function resolveCollapsedSeparatorArrowDown(context: VerticalInteractionContext): number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isStructuralSeparatorLine(context, currentLine.number)) {
    return resolveLineAfterStructuralSeparator(context, currentLine.number);
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);

  if (!currentBlock || currentLine.number !== currentBlock.endLine) {
    return null;
  }

  return resolveLineAfterStructuralSeparator(context, currentLine.number + 1);
}

function resolveSourceLineArrowUp(context: VerticalInteractionContext): VerticalNavigationResult | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (currentLine.number <= 1 || currentLine.text.trim().length === 0) {
    return null;
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);
  const previousLine = context.view.state.doc.line(currentLine.number - 1);

  if (isBlankLineText(previousLine.text) || !currentBlock) {
    return null;
  }

  const previousBlock = findBlockForLine(context.document.blocks, previousLine.number);

  if (!previousBlock) {
    return null;
  }

  const currentVisible = createVisibleLine({
    source: context.source, block: currentBlock,
    lineStart: currentLine.from, lineEnd: currentLine.to
  });
  const previousVisible = createVisibleLine({
    source: context.source, block: previousBlock,
    lineStart: previousLine.from, lineEnd: previousLine.to
  });

  if (!currentVisible.hasTransformedPresentation && !previousVisible.hasTransformedPresentation) {
    return null;
  }

  const column = context.goalColumn ?? visibleLineColumn(currentVisible, selection.anchor);

  return {
    anchor: anchorForVisibleLineColumn(previousVisible, column),
    goalColumn: column
  };
}

function resolveSourceLineArrowDown(context: VerticalInteractionContext): VerticalNavigationResult | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (currentLine.number >= context.view.state.doc.lines || isBlankLineText(currentLine.text)) {
    return null;
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);
  const nextLine = context.view.state.doc.line(currentLine.number + 1);

  if (isBlankLineText(nextLine.text) || !currentBlock) {
    return null;
  }

  const nextBlock = findBlockForLine(context.document.blocks, nextLine.number);

  if (!nextBlock) {
    return null;
  }

  const currentVisible = createVisibleLine({
    source: context.source, block: currentBlock,
    lineStart: currentLine.from, lineEnd: currentLine.to
  });
  const nextVisible = createVisibleLine({
    source: context.source, block: nextBlock,
    lineStart: nextLine.from, lineEnd: nextLine.to
  });

  if (!currentVisible.hasTransformedPresentation && !nextVisible.hasTransformedPresentation) {
    return null;
  }

  const column = context.goalColumn ?? visibleLineColumn(currentVisible, selection.anchor);

  return {
    anchor: anchorForVisibleLineColumn(nextVisible, column),
    goalColumn: column
  };
}

function resolveAdjacentBlockArrowUp(context: VerticalInteractionContext): number | null {
  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (!isBlankLineText(currentLine.text)) {
    return null;
  }

  const blockAbove =
    [...context.document.blocks].reverse().find((block) => block.endLine === currentLine.number - 1) ?? null;

  if (!blockAbove) {
    return null;
  }

  return resolveVisibleBlockEntryAnchor(blockAbove, "end");
}

function resolveAdjacentBlockArrowDown(context: VerticalInteractionContext): number | null {
  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (!isBlankLineText(currentLine.text)) {
    return null;
  }

  const blockBelow = context.document.blocks.find((block) => block.startLine === currentLine.number + 1) ?? null;

  if (!blockBelow) {
    return null;
  }

  return resolveVisibleBlockEntryAnchor(blockBelow, "start");
}

function resolveHeadingPointer(context: PointerInteractionContext): number | null {
  if (context.lineBlock?.type !== "heading") {
    return null;
  }

  const block = context.lineBlock as HeadingBlock;
  const markerTarget = context.target.closest(".cm-inactive-heading-marker");

  if (markerTarget) {
    return block.startOffset;
  }

  return null;
}

function resolveListPointer(context: PointerInteractionContext): number | null {
  if (context.lineBlock?.type !== "list") {
    return null;
  }

  if (!context.lineElement.classList.contains("cm-inactive-list")) {
    return null;
  }

  const block = context.lineBlock as ListBlock;
  const item = findListItemAtLineStart(block, context.lineStart);

  if (!item) {
    return null;
  }

  if (
    context.target.closest(".cm-inactive-list-marker") ||
    context.target.closest(".cm-inactive-task-marker") ||
    (context.paddingLeft > 0 && isPointerWithinLeftPadding(context))
  ) {
    return item.startOffset;
  }

  return null;
}

function resolveBlockquotePointer(context: PointerInteractionContext): number | null {
  if (context.lineBlock?.type !== "blockquote") {
    return null;
  }

  if (!context.lineElement.classList.contains("cm-inactive-blockquote")) {
    return null;
  }

  const block = context.lineBlock as BlockquoteBlock;
  const clickedLine = block.lines?.find((line) => line.startOffset === context.lineStart);

  if (!clickedLine) {
    return null;
  }

  if (
    context.target.closest(".cm-inactive-blockquote-marker") ||
    (context.paddingLeft > 0 && isPointerWithinLeftPadding(context))
  ) {
    return clickedLine.startOffset;
  }

  return null;
}

function resolveThematicBreakPointer(context: PointerInteractionContext): number | null {
  if (context.lineBlock?.type !== "thematicBreak") {
    return null;
  }

  if (!context.lineElement.classList.contains("cm-inactive-thematic-break")) {
    return null;
  }

  return (context.lineBlock as ThematicBreakBlock).startOffset;
}

export const lineBlockAdapter: BlockInteractionAdapter = {
  resolvePointerSelection(context) {
    return (
      resolveHeadingPointer(context) ??
      resolveListPointer(context) ??
      resolveBlockquotePointer(context) ??
      resolveThematicBreakPointer(context)
    );
  },
  resolveArrowUp(context) {
    return (
      resolveCollapsedSeparatorArrowUp(context) ??
      resolveSourceLineArrowUp(context) ??
      resolveAdjacentBlockArrowUp(context)
    );
  },
  resolveArrowDown(context) {
    return (
      resolveCollapsedSeparatorArrowDown(context) ??
      resolveSourceLineArrowDown(context) ??
      resolveAdjacentBlockArrowDown(context)
    );
  }
};
