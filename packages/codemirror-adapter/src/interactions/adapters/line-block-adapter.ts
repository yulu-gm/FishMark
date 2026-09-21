import { readEditorStructureCache } from "../../transaction-adapter";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";

import {
  anchorForVisibleLineColumn,
  createStructuralLineModel,
  createVisibleLine,
  visibleLineColumn,
  type EditorDerivedSnapshot,
  type StructuralLineSeparator
} from "@fishmark/editor-model";
import {
  findBlockEndingAtOffset,
  findBlockEndingOnLine,
  findBlockForLine,
  findBlockStartingAtOffset,
  findBlockStartingOnLine,
  getCanonicalBlockquoteLineInfos,
  isTableBlockNode,
  resolveBlockEndLine,
  resolveBlockStartLine,
  resolveVisibleBlockEntryAnchor
} from "../canonical-blocks";
import type {
  BlockInteractionAdapter,
  PointerInteractionContext,
  VerticalInteractionContext,
  VerticalNavigationResult
} from "../types";

type StructuralNavigationContext = VerticalInteractionContext & {
  getLineModel: () => ReturnType<typeof createStructuralLineModel>;
};

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

function isBlankLineText(text: string): boolean {
  return text.length === 0;
}

function isSourceBlankLineOutsideBlock(context: VerticalInteractionContext, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return false;
  }

  const line = context.view.state.doc.line(lineNumber);

  return isBlankLineText(line.text) && !findBlockForLine(context.snapshot, lineNumber);
}

function createStructuralNavigationContext(context: VerticalInteractionContext): StructuralNavigationContext {
  let lineModel: ReturnType<typeof createStructuralLineModel> | null = null;

  return {
    ...context,
    getLineModel: () => {
      lineModel ??= createStructuralLineModel(
        createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state))
      );
      return lineModel;
    }
  };
}

function findStructuralSeparatorAtLine(
  context: StructuralNavigationContext,
  lineNumber: number
): StructuralLineSeparator | null {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return null;
  }

  const line = context.view.state.doc.line(lineNumber);

  return context.getLineModel().findSeparatorAt(line.from);
}

function isStructuralSeparatorLine(context: StructuralNavigationContext, lineNumber: number): boolean {
  if (lineNumber < 1 || lineNumber > context.view.state.doc.lines) {
    return false;
  }

  return context.getLineModel().getLineRole(lineNumber) === "structural-separator";
}

function findBlockAboveStructuralSeparator(
  context: StructuralNavigationContext,
  lineNumber: number
): MarkdownNode | null {
  const separator = findStructuralSeparatorAtLine(context, lineNumber);

  if (!separator || separator.previousBlockEnd === null) {
    return null;
  }

  return findBlockEndingAtOffset(context.snapshot, separator.previousBlockEnd);
}

function findBlockBelowStructuralSeparator(
  context: StructuralNavigationContext,
  lineNumber: number
): MarkdownNode | null {
  const separator = findStructuralSeparatorAtLine(context, lineNumber);

  if (!separator || separator.nextBlockStart === null) {
    return null;
  }

  return findBlockStartingAtOffset(context.snapshot, separator.nextBlockStart);
}

function resolveVisibleLineStartAnchorAtOffset(
  context: VerticalInteractionContext,
  offset: number
): number | null {
  if (offset < 0 || offset > context.view.state.doc.length) {
    return null;
  }

  const line = context.view.state.doc.lineAt(offset);
  const block = findBlockForLine(context.snapshot, line.number);

  if (!block) {
    return offset;
  }

  if (block.kind === "table" || block.kind === "thematic-break" || block.kind === "html-image") {
    return resolveVisibleBlockEntryAnchor(context.snapshot, block, "start");
  }

  return createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
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

  const blockAbove = findBlockEndingAtOffset(context.snapshot, separator.previousBlockEnd);

  return blockAbove
    ? resolveVisibleBlockEntryAnchor(context.snapshot, blockAbove, "end")
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
  context: StructuralNavigationContext,
  lineNumber: number
): boolean {
  return isSourceBlankLineOutsideBlock(context, lineNumber) && isStructuralSeparatorLine(context, lineNumber - 1);
}

function resolveLineAfterStructuralSeparator(context: StructuralNavigationContext, lineNumber: number): number | null {
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

function resolveLineBeforeStructuralSeparator(context: StructuralNavigationContext, lineNumber: number): number | null {
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
  context: StructuralNavigationContext,
  lineNumber: number
): MarkdownNode | null {
  const previousLineNumber = lineNumber - 1;
  const previousBlock = findBlockForLine(context.snapshot, previousLineNumber);

  if (isTableBlockNode(previousBlock) && previousBlock !== null &&
      resolveBlockEndLine(context.snapshot, previousBlock) === previousLineNumber) {
    return previousBlock;
  }

  const separatorBlock = findBlockAboveStructuralSeparator(context, previousLineNumber);

  return isTableBlockNode(separatorBlock) ? separatorBlock : null;
}

function resolveCollapsedSeparatorArrowUp(context: StructuralNavigationContext): number | null {
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

  const currentBlock = findBlockForLine(context.snapshot, currentLine.number);

  if (!currentBlock || currentLine.number !== resolveBlockStartLine(context.snapshot, currentBlock)) {
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

function resolveCollapsedSeparatorArrowDown(context: StructuralNavigationContext): VerticalNavigationResult | number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isStructuralSeparatorLine(context, currentLine.number)) {
    return resolveLineAfterStructuralSeparator(context, currentLine.number);
  }

  const currentBlock = findBlockForLine(context.snapshot, currentLine.number);

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

  if (blockBelow !== null &&
      (blockBelow.kind === "table" || blockBelow.kind === "thematic-break" || blockBelow.kind === "html-image")) {
    return resolveVisibleBlockEntryAnchor(context.snapshot, blockBelow, "start");
  }

  const nextAnchor = resolveAnchorBelowStructuralSeparator(context, separator);

  if (nextAnchor === null || separator.nextBlockStart === null) {
    return null;
  }

  const nextLine = context.view.state.doc.lineAt(separator.nextBlockStart);
  const nextBlock = findBlockForLine(context.snapshot, nextLine.number);

  if (!nextBlock) {
    return nextAnchor;
  }

  const currentVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
    lineStart: currentLine.from,
    lineEnd: currentLine.to
  });
  const nextVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
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
  context: StructuralNavigationContext
): VerticalNavigationResult | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (isBlankLineText(currentLine.text)) {
    return null;
  }

  const currentBlock = findBlockForLine(context.snapshot, currentLine.number);

  if (!currentBlock) {
    return null;
  }

  if (!findTableAboveVisibleLine(context, currentLine.number)) {
    return null;
  }

  const nextLineNumber = currentLine.number + 1;

  if (nextLineNumber <= context.view.state.doc.lines) {
    const nextLine = context.view.state.doc.line(nextLineNumber);
    const nextBlock = findBlockForLine(context.snapshot, nextLine.number);

    if (!isBlankLineText(nextLine.text) && nextBlock) {
      const currentVisible = createVisibleLine({
        snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
        lineStart: currentLine.from,
        lineEnd: currentLine.to
      });
      const nextVisible = createVisibleLine({
        snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
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

  const currentBlock = findBlockForLine(context.snapshot, currentLine.number);
  const previousLine = context.view.state.doc.line(currentLine.number - 1);

  if (isBlankLineText(previousLine.text) || !currentBlock) {
    return null;
  }

  const previousBlock = findBlockForLine(context.snapshot, previousLine.number);

  if (!previousBlock) {
    return null;
  }

  const currentVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
    lineStart: currentLine.from, lineEnd: currentLine.to
  });
  const previousVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
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

  const currentBlock = findBlockForLine(context.snapshot, currentLine.number);
  const nextLine = context.view.state.doc.line(currentLine.number + 1);

  if (isBlankLineText(nextLine.text) || !currentBlock) {
    return null;
  }

  const nextBlock = findBlockForLine(context.snapshot, nextLine.number);

  if (!nextBlock) {
    return null;
  }

  const currentVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
    lineStart: currentLine.from, lineEnd: currentLine.to
  });
  const nextVisible = createVisibleLine({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(context.view.state)),
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

  const blockAbove = findBlockEndingOnLine(context.snapshot, currentLine.number - 1);

  if (!blockAbove) {
    return null;
  }

  return resolveVisibleBlockEntryAnchor(context.snapshot, blockAbove, "end");
}

function resolveAdjacentBlockArrowDown(context: VerticalInteractionContext): number | null {
  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (!isBlankLineText(currentLine.text)) {
    return null;
  }

  const blockBelow = findBlockStartingOnLine(context.snapshot, currentLine.number + 1);

  if (!blockBelow) {
    return null;
  }

  return resolveVisibleBlockEntryAnchor(context.snapshot, blockBelow, "start");
}

function findListItemAtLineStart(
  snapshot: EditorDerivedSnapshot,
  listNode: MarkdownNode,
  lineStart: number
): MarkdownNode | null {
  for (const child of childrenOf(listNode)) {
    if (child.kind !== "list-item") {
      continue;
    }

    if ((snapshot.lineAt(child.source.startOffset)?.range.startOffset ?? child.source.startOffset) === lineStart) {
      return child;
    }

    for (const nested of childrenOf(child)) {
      if (nested.kind !== "list") {
        continue;
      }

      const nestedItem = findListItemAtLineStart(snapshot, nested, lineStart);

      if (nestedItem) {
        return nestedItem;
      }
    }
  }

  return null;
}

function resolveHeadingPointer(context: PointerInteractionContext): number | null {
  const node = context.lineBlock;

  if (node === null || node.kind !== "heading") {
    return null;
  }

  const markerTarget = context.target.closest(".cm-inactive-heading-marker");

  if (markerTarget) {
    return node.source.startOffset;
  }

  return null;
}

function resolveListPointer(context: PointerInteractionContext): number | null {
  const listNode = context.lineBlock;

  if (listNode === null || listNode.kind !== "list") {
    return null;
  }

  const isInactiveListLine = context.lineElement.classList.contains("cm-inactive-list");
  const isInactiveContinuationLine = context.lineElement.classList.contains("cm-inactive-list-continuation");
  const isActiveListLine = context.lineElement.classList.contains("cm-active-list");
  const isActiveContinuationLine = context.lineElement.classList.contains("cm-active-list-continuation");

  if (!isInactiveListLine && !isInactiveContinuationLine && !isActiveListLine && !isActiveContinuationLine) {
    return null;
  }

  if (isInactiveContinuationLine || isActiveContinuationLine) {
    return resolveVisibleTextPointerAnchor(context);
  }

  const item = findListItemAtLineStart(context.snapshot, listNode, context.lineStart);

  if (!item) {
    return null;
  }

  if (
    context.target.closest(".cm-inactive-list-marker") ||
    context.target.closest(".cm-inactive-task-marker") ||
    (context.paddingLeft > 0 && isPointerWithinLeftPadding(context))
  ) {
    return context.lineStart;
  }

  return resolveVisibleTextPointerAnchor(context);
}

function resolveBlockquotePointer(context: PointerInteractionContext): number | null {
  const node = context.lineBlock;

  if (node === null || node.kind !== "blockquote") {
    return null;
  }

  if (!context.lineElement.classList.contains("cm-inactive-blockquote")) {
    return null;
  }

  const clickedLine = getCanonicalBlockquoteLineInfos(context.snapshot, node)
    .find((line) => line.lineStart === context.lineStart);

  if (!clickedLine) {
    return null;
  }

  if (
    context.target.closest(".cm-inactive-blockquote-marker") ||
    (context.paddingLeft > 0 && isPointerWithinLeftPadding(context))
  ) {
    return clickedLine.lineStart;
  }

  return null;
}

function resolveThematicBreakPointer(context: PointerInteractionContext): number | null {
  const node = context.lineBlock;

  if (node === null || node.kind !== "thematic-break") {
    return null;
  }

  if (!context.lineElement.classList.contains("cm-inactive-thematic-break")) {
    return null;
  }

  return node.source.startOffset;
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
    const structuralContext = createStructuralNavigationContext(context);

    return (
      resolveCollapsedSeparatorArrowUp(structuralContext) ??
      resolveSourceLineArrowUp(structuralContext) ??
      resolveAdjacentBlockArrowUp(structuralContext)
    );
  },
  resolveArrowDown(context) {
    const structuralContext = createStructuralNavigationContext(context);

    return (
      resolveCollapsedSeparatorArrowDown(structuralContext) ??
      resolveFirstLineBelowTableArrowDown(structuralContext) ??
      resolveSourceLineArrowDown(structuralContext) ??
      resolveAdjacentBlockArrowDown(structuralContext)
    );
  }
};
