import type {
  BlockquoteBlock,
  MarkdownBlock,
  HeadingBlock,
  ListBlock,
  ListItemBlock,
  ThematicBreakBlock
} from "@yulora/markdown-engine";

import {
  hasTransformedLinePresentation,
  resolveAnchorForVisibleLineColumn,
  resolveVisibleLineColumn
} from "../../line-visibility";
import type {
  BlockInteractionAdapter,
  PointerInteractionContext,
  VerticalInteractionContext
} from "../types";

function isPointerWithinLeftPadding(context: PointerInteractionContext): boolean {
  return (
    context.event.clientX >= context.rect.left &&
    context.event.clientX <= context.rect.left + context.paddingLeft
  );
}

function findListItemAtLineStart(block: ListBlock, lineStart: number): ListItemBlock | null {
  for (const item of block.items) {
    if (item.startOffset === lineStart) {
      return item;
    }
  }

  return null;
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
    default:
      return null;
  }
}

function resolveSourceLineArrowUp(context: VerticalInteractionContext): number | null {
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

  if (previousLine.text.trim().length === 0 || !currentBlock) {
    return null;
  }

  const previousBlock = findBlockForLine(context.document.blocks, previousLine.number);
  const currentLineParams = {
    source: context.source,
    block: currentBlock,
    lineStart: currentLine.from,
    lineEnd: currentLine.to
  } as const;

  if (!previousBlock) {
    return null;
  }

  const previousLineParams = {
    source: context.source,
    block: previousBlock,
    lineStart: previousLine.from,
    lineEnd: previousLine.to
  } as const;

  if (
    !hasTransformedLinePresentation(currentLineParams) &&
    !hasTransformedLinePresentation(previousLineParams)
  ) {
    return null;
  }

  const visibleColumn = resolveVisibleLineColumn({
    ...currentLineParams,
    anchor: selection.anchor
  });

  return resolveAnchorForVisibleLineColumn(previousLineParams, visibleColumn);
}

function resolveSourceLineArrowDown(context: VerticalInteractionContext): number | null {
  const selection = context.view.state.selection.main;

  if (!selection.empty) {
    return null;
  }

  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (currentLine.number >= context.view.state.doc.lines || currentLine.text.trim().length === 0) {
    return null;
  }

  const currentBlock = findBlockForLine(context.document.blocks, currentLine.number);
  const nextLine = context.view.state.doc.line(currentLine.number + 1);

  if (nextLine.text.trim().length === 0 || !currentBlock) {
    return null;
  }

  const nextBlock = findBlockForLine(context.document.blocks, nextLine.number);
  const currentLineParams = {
    source: context.source,
    block: currentBlock,
    lineStart: currentLine.from,
    lineEnd: currentLine.to
  } as const;

  if (!nextBlock) {
    return null;
  }

  const nextLineParams = {
    source: context.source,
    block: nextBlock,
    lineStart: nextLine.from,
    lineEnd: nextLine.to
  } as const;

  if (
    !hasTransformedLinePresentation(currentLineParams) &&
    !hasTransformedLinePresentation(nextLineParams)
  ) {
    return null;
  }

  const visibleColumn = resolveVisibleLineColumn({
    ...currentLineParams,
    anchor: selection.anchor
  });

  return resolveAnchorForVisibleLineColumn(nextLineParams, visibleColumn);
}

function resolveAdjacentBlockArrowUp(context: VerticalInteractionContext): number | null {
  const currentLine = context.view.state.doc.lineAt(context.lineStart);

  if (currentLine.text.trim().length !== 0) {
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

  if (currentLine.text.trim().length !== 0) {
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
    return resolveSourceLineArrowUp(context) ?? resolveAdjacentBlockArrowUp(context);
  },
  resolveArrowDown(context) {
    return resolveSourceLineArrowDown(context) ?? resolveAdjacentBlockArrowDown(context);
  }
};
