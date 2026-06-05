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
import {
  createStructuralLineModel,
  type StructuralLineSeparator
} from "../../structural-line-model";
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

function createPointCaretRange(
  document: Document,
  clientX: number,
  clientY: number
): { node: Node; offset: number } | null {
  const caretPositionFromPoint = (
    document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint;

  if (typeof caretPositionFromPoint === "function") {
    const position = caretPositionFromPoint.call(document, clientX, clientY);

    if (position) {
      return {
        node: position.offsetNode,
        offset: position.offset
      };
    }
  }

  const caretRangeFromPoint = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint;

  if (typeof caretRangeFromPoint !== "function") {
    return null;
  }

  const range = caretRangeFromPoint.call(document, clientX, clientY);

  return range
    ? {
        node: range.startContainer,
        offset: range.startOffset
      }
    : null;
}

function readAnchorAtDomPosition(
  context: PointerInteractionContext,
  node: Node,
  offset: number
): number | null {
  if (!context.lineElement.contains(node)) {
    return null;
  }

  try {
    return context.view.posAtDOM(node, offset);
  } catch {
    return null;
  }
}

function isAnchorInsideContextLine(context: PointerInteractionContext, anchor: number): boolean {
  return anchor >= context.lineStart && anchor <= context.lineEnd;
}

function normalizePointerLineAnchor(context: PointerInteractionContext, anchor: number): number {
  return Math.max(context.lineStart, Math.min(anchor, context.lineEnd));
}

function resolveDomCaretPointerAnchor(context: PointerInteractionContext): number | null {
  const caret = createPointCaretRange(
    context.lineElement.ownerDocument,
    context.event.clientX,
    context.event.clientY
  );

  if (!caret) {
    return null;
  }

  const anchor = readAnchorAtDomPosition(context, caret.node, caret.offset);

  return anchor !== null && isAnchorInsideContextLine(context, anchor)
    ? normalizePointerLineAnchor(context, anchor)
    : null;
}

function isVerticallyNear(rect: DOMRect, clientY: number): boolean {
  return clientY >= rect.top - 2 && clientY <= rect.bottom + 2;
}

function resolveTextRectPointerAnchor(context: PointerInteractionContext): number | null {
  const ownerDocument = context.lineElement.ownerDocument;
  const walker = ownerDocument.createTreeWalker(context.lineElement, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let nearestAnchorBeforePoint: number | null = null;

  while (node) {
    const textNode = node as Text;
    const text = textNode.nodeValue ?? "";

    for (let offset = 0; offset < text.length; offset += 1) {
      const range = ownerDocument.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);

      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0 && isVerticallyNear(rect, context.event.clientY)
      );

      range.detach();

      if (rects.length === 0) {
        continue;
      }

      const anchorBefore = readAnchorAtDomPosition(context, textNode, offset);
      const anchorAfter = readAnchorAtDomPosition(context, textNode, offset + 1);

      if (
        anchorBefore === null ||
        anchorAfter === null ||
        !isAnchorInsideContextLine(context, anchorBefore) ||
        !isAnchorInsideContextLine(context, anchorAfter)
      ) {
        continue;
      }

      for (const rect of rects) {
        if (context.event.clientX < rect.left) {
          return normalizePointerLineAnchor(context, anchorBefore);
        }

        if (context.event.clientX <= rect.right) {
          const midpoint = rect.left + rect.width / 2;
          return normalizePointerLineAnchor(context, context.event.clientX < midpoint ? anchorBefore : anchorAfter);
        }

        nearestAnchorBeforePoint = normalizePointerLineAnchor(context, anchorAfter);
      }
    }

    node = walker.nextNode();
  }

  if (nearestAnchorBeforePoint !== null) {
    return nearestAnchorBeforePoint;
  }

  return null;
}

function resolveVisibleTextPointerAnchor(context: PointerInteractionContext): number | null {
  return resolveDomCaretPointerAnchor(context) ?? resolveTextRectPointerAnchor(context);
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
  return text.length === 0;
}

function isSourceBlankLineOutsideBlock(context: VerticalInteractionContext, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return false;
  }

  const line = context.view.state.doc.line(lineNumber);

  return isBlankLineText(line.text) && !findBlockForLine(context.document.blocks, lineNumber);
}

function createLineModel(context: VerticalInteractionContext) {
  return createStructuralLineModel(context.source, context.document);
}

function findBlockStartingAtOffset(
  blocks: readonly MarkdownBlock[],
  startOffset: number
): MarkdownBlock | null {
  return blocks.find((block) => block.startOffset === startOffset) ?? null;
}

function findBlockEndingAtOffset(
  blocks: readonly MarkdownBlock[],
  endOffset: number
): MarkdownBlock | null {
  return blocks.find((block) => block.endOffset === endOffset) ?? null;
}

function findStructuralSeparatorAtLine(
  context: VerticalInteractionContext,
  lineNumber: number
): StructuralLineSeparator | null {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return null;
  }

  const line = context.view.state.doc.line(lineNumber);

  return createLineModel(context).findSeparatorAt(line.from);
}

function isStructuralSeparatorLine(context: VerticalInteractionContext, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return false;
  }

  return createLineModel(context).getLineRole(lineNumber) === "structural-separator";
}

function findBlockAboveStructuralSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): MarkdownBlock | null {
  const separator = findStructuralSeparatorAtLine(context, lineNumber);

  if (!separator || separator.previousBlockEnd === null) {
    return null;
  }

  return findBlockEndingAtOffset(context.document.blocks, separator.previousBlockEnd);
}

function findBlockBelowStructuralSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): MarkdownBlock | null {
  const separator = findStructuralSeparatorAtLine(context, lineNumber);

  if (!separator || separator.nextBlockStart === null) {
    return null;
  }

  return findBlockStartingAtOffset(context.document.blocks, separator.nextBlockStart);
}

function resolveVisibleLineStartAnchorAtOffset(
  context: VerticalInteractionContext,
  offset: number
): number | null {
  if (offset < 0 || offset > context.view.state.doc.length) {
    return null;
  }

  const line = context.view.state.doc.lineAt(offset);
  const block = findBlockForLine(context.document.blocks, line.number);

  if (!block) {
    return offset;
  }

  if (block.type === "table" || block.type === "thematicBreak" || block.type === "htmlImage") {
    return resolveVisibleBlockEntryAnchor(block, "start");
  }

  return createVisibleLine({
    source: context.source,
    block,
    lineStart: line.from,
    lineEnd: line.to
  }).visibleStartAnchor;
}

function resolveAnchorAboveStructuralSeparator(
  context: VerticalInteractionContext,
  separator: StructuralLineSeparator
): number | null {
  if (separator.previousBlockEnd === null) {
    return null;
  }

  const blockAbove = findBlockEndingAtOffset(context.document.blocks, separator.previousBlockEnd);

  return blockAbove
    ? resolveVisibleBlockEntryAnchor(blockAbove, "end")
    : separator.previousBlockEnd;
}

function resolveAnchorBelowStructuralSeparator(
  context: VerticalInteractionContext,
  separator: StructuralLineSeparator
): number | null {
  if (separator.nextBlockStart === null) {
    return null;
  }

  return resolveVisibleLineStartAnchorAtOffset(context, separator.nextBlockStart);
}

function isVisibleExtraBlankLineImmediatelyAfterSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): boolean {
  return isSourceBlankLineOutsideBlock(context, lineNumber) && isStructuralSeparatorLine(context, lineNumber - 1);
}

function resolveLineAfterStructuralSeparator(context: VerticalInteractionContext, lineNumber: number): number | null {
  const separator = findStructuralSeparatorAtLine(context, lineNumber);

  if (!separator) {
    return null;
  }

  const nextLineNumber = lineNumber + 1;

  if (nextLineNumber > context.view.state.doc.lines) {
    return null;
  }

  if (isSourceBlankLineOutsideBlock(context, nextLineNumber)) {
    return context.view.state.doc.line(nextLineNumber).from;
  }

  return resolveAnchorBelowStructuralSeparator(context, separator);
}

function resolveLineBeforeStructuralSeparator(context: VerticalInteractionContext, lineNumber: number): number | null {
  const previousLineNumber = lineNumber - 1;

  if (
    isSourceBlankLineOutsideBlock(context, previousLineNumber) &&
    !isStructuralSeparatorLine(context, previousLineNumber)
  ) {
    return context.view.state.doc.line(previousLineNumber).from;
  }

  return null;
}

function resolveVisibleExtraBlankBeforeStructuralSeparator(
  context: VerticalInteractionContext,
  lineNumber: number
): number | null {
  const blankLineNumbers: number[] = [];
  let candidateLineNumber = lineNumber - 1;

  while (isSourceBlankLineOutsideBlock(context, candidateLineNumber)) {
    blankLineNumbers.unshift(candidateLineNumber);
    candidateLineNumber -= 1;
  }

  let visibleLineNumber: number | null = null;

  for (const [index, blankLineNumber] of blankLineNumbers.entries()) {
    if ((index + 1) % 2 === 0) {
      visibleLineNumber = blankLineNumber;
    }
  }

  return visibleLineNumber === null ? null : context.view.state.doc.line(visibleLineNumber).from;
}

function findTableAboveVisibleLine(
  context: VerticalInteractionContext,
  lineNumber: number
): TableBlock | null {
  const previousLineNumber = lineNumber - 1;
  const previousBlock = findBlockForLine(context.document.blocks, previousLineNumber);

  if (previousBlock?.type === "table" && previousBlock.endLine === previousLineNumber) {
    return previousBlock as TableBlock;
  }

  const separatorBlock = findBlockAboveStructuralSeparator(context, previousLineNumber);

  return separatorBlock?.type === "table" ? (separatorBlock as TableBlock) : null;
}

function resolveCollapsedSeparatorArrowUp(context: VerticalInteractionContext): number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isStructuralSeparatorLine(context, currentLine.number)) {
    const separator = findStructuralSeparatorAtLine(context, currentLine.number);

    return (
      resolveVisibleExtraBlankBeforeStructuralSeparator(context, currentLine.number) ??
      (separator ? resolveAnchorAboveStructuralSeparator(context, separator) : null)
    );
  }

  if (isVisibleExtraBlankLineImmediatelyAfterSeparator(context, currentLine.number)) {
    const separator = findStructuralSeparatorAtLine(context, currentLine.number - 1);

    return (
      resolveLineBeforeStructuralSeparator(context, currentLine.number - 1) ??
      (separator ? resolveAnchorAboveStructuralSeparator(context, separator) : null)
    );
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);

  if (!currentBlock || currentLine.number !== currentBlock.startLine) {
    return null;
  }

  const previousLineNumber = currentLine.number - 1;
  const previousSeparator = findStructuralSeparatorAtLine(context, previousLineNumber);

  if (previousSeparator) {
    return (
      resolveVisibleExtraBlankBeforeStructuralSeparator(context, previousLineNumber) ??
      resolveAnchorAboveStructuralSeparator(context, previousSeparator)
    );
  }

  if (isSourceBlankLineOutsideBlock(context, previousLineNumber)) {
    return context.view.state.doc.line(previousLineNumber).from;
  }

  return null;
}

function resolveCollapsedSeparatorArrowDown(context: VerticalInteractionContext): VerticalNavigationResult | number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isStructuralSeparatorLine(context, currentLine.number)) {
    return resolveLineAfterStructuralSeparator(context, currentLine.number);
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);

  if (!currentBlock) {
    return null;
  }

  const separatorLineNumber = currentLine.number + 1;
  const separator = findStructuralSeparatorAtLine(context, separatorLineNumber);

  if (!separator) {
    return null;
  }

  const lineAfterSeparatorNumber = separatorLineNumber + 1;

  if (lineAfterSeparatorNumber > context.view.state.doc.lines) {
    return null;
  }

  const lineAfterSeparator = context.view.state.doc.line(lineAfterSeparatorNumber);

  if (isSourceBlankLineOutsideBlock(context, lineAfterSeparator.number)) {
    return lineAfterSeparator.from;
  }

  const blockBelow = findBlockBelowStructuralSeparator(context, separatorLineNumber);

  if (blockBelow?.type === "table" || blockBelow?.type === "thematicBreak" || blockBelow?.type === "htmlImage") {
    return resolveVisibleBlockEntryAnchor(blockBelow, "start");
  }

  const nextAnchor = resolveAnchorBelowStructuralSeparator(context, separator);

  if (nextAnchor === null || separator.nextBlockStart === null) {
    return null;
  }

  const nextLine = context.view.state.doc.lineAt(separator.nextBlockStart);
  const nextBlock = findBlockForLine(context.document.blocks, nextLine.number);

  if (!nextBlock) {
    return nextAnchor;
  }

  const currentVisible = createVisibleLine({
    source: context.source,
    block: currentBlock,
    lineStart: currentLine.from,
    lineEnd: currentLine.to
  });
  const nextVisible = createVisibleLine({
    source: context.source,
    block: nextBlock,
    lineStart: nextLine.from,
    lineEnd: nextLine.to
  });
  const column = context.goalColumn ?? visibleLineColumn(currentVisible, selection.anchor);

  return {
    anchor: anchorForVisibleLineColumn(nextVisible, column),
    goalColumn: column
  };
}

function resolveFirstLineBelowTableArrowDown(
  context: VerticalInteractionContext
): VerticalNavigationResult | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isBlankLineText(currentLine.text)) {
    return null;
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);

  if (!currentBlock) {
    return null;
  }

  if (!findTableAboveVisibleLine(context, currentLine.number)) {
    return null;
  }

  const nextLineNumber = currentLine.number + 1;

  if (nextLineNumber <= context.view.state.doc.lines) {
    const nextLine = context.view.state.doc.line(nextLineNumber);
    const nextBlock = findBlockForLine(context.document.blocks, nextLine.number);

    if (!isBlankLineText(nextLine.text) && nextBlock) {
      const currentVisible = createVisibleLine({
        source: context.source,
        block: currentBlock,
        lineStart: currentLine.from,
        lineEnd: currentLine.to
      });
      const nextVisible = createVisibleLine({
        source: context.source,
        block: nextBlock,
        lineStart: nextLine.from,
        lineEnd: nextLine.to
      });
      const column = context.goalColumn ?? visibleLineColumn(currentVisible, selection.anchor);

      return {
        anchor: anchorForVisibleLineColumn(nextVisible, column),
        goalColumn: column
      };
    }
  }

  return {
    anchor: selection.anchor,
    goalColumn: context.goalColumn
  };
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

  const isInactiveListLine = context.lineElement.classList.contains("cm-inactive-list");
  const isInactiveContinuationLine = context.lineElement.classList.contains("cm-inactive-list-continuation");
  const isActiveListLine = context.lineElement.classList.contains("cm-active-list");
  const isActiveContinuationLine = context.lineElement.classList.contains("cm-active-list-continuation");

  if (!isInactiveListLine && !isInactiveContinuationLine && !isActiveListLine && !isActiveContinuationLine) {
    return null;
  }

  const block = context.lineBlock as ListBlock;
  const item = findListItemAtLineStart(block, context.lineStart);

  if (isInactiveContinuationLine || isActiveContinuationLine) {
    return resolveVisibleTextPointerAnchor(context);
  }

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

  return resolveVisibleTextPointerAnchor(context);
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
      resolveFirstLineBelowTableArrowDown(context) ??
      resolveSourceLineArrowDown(context) ??
      resolveAdjacentBlockArrowDown(context)
    );
  }
};
