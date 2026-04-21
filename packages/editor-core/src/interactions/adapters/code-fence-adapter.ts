import type { CodeFenceBlock } from "@yulora/markdown-engine";

import { getInactiveCodeFenceLines } from "../../decorations";
import type { BlockInteractionAdapter, PointerInteractionContext, VerticalInteractionContext } from "../types";

function getCodeFenceBoundaryAnchors(block: CodeFenceBlock, source: string) {
  const lines = getInactiveCodeFenceLines(block.startOffset, block.endOffset, source);
  const openingFence = lines[0];
  const closingFence = lines.at(-1);
  const firstContent = lines.find((line) => line.kind === "content" && line.isFirstContentLine);
  const lastContent = [...lines].reverse().find((line) => line.kind === "content" && line.isLastContentLine);

  return {
    openingFence,
    closingFence,
    firstContent,
    lastContent
  };
}

function resolvePointerSelection(context: PointerInteractionContext): number | null {
  if (context.lineBlock?.type !== "codeFence") {
    return null;
  }

  const block = context.lineBlock as CodeFenceBlock;
  const boundaries = getCodeFenceBoundaryAnchors(block, context.source);

  if (
    boundaries.firstContent &&
    context.lineStart === boundaries.firstContent.lineStart &&
    context.lineElement.classList.contains("cm-inactive-code-block-start") &&
    context.paddingTop > 0 &&
    context.event.clientY >= context.rect.top &&
    context.event.clientY <= context.rect.top + context.paddingTop
  ) {
    return boundaries.openingFence?.lineStart ?? null;
  }

  if (
    boundaries.lastContent &&
    context.lineStart === boundaries.lastContent.lineStart &&
    context.lineElement.classList.contains("cm-inactive-code-block-end") &&
    context.paddingBottom > 0 &&
    context.event.clientY <= context.rect.bottom &&
    context.event.clientY >= context.rect.bottom - context.paddingBottom
  ) {
    return boundaries.closingFence?.lineStart ?? null;
  }

  return null;
}

function resolveArrowUp(context: VerticalInteractionContext): number | null {
  if (context.activeBlock?.type !== "codeFence") {
    return null;
  }

  const block = context.activeBlock as CodeFenceBlock;
  const boundaries = getCodeFenceBoundaryAnchors(block, context.source);

  if (context.lineStart === boundaries.firstContent?.lineStart) {
    return boundaries.openingFence?.lineStart ?? null;
  }

  return null;
}

function resolveArrowDown(context: VerticalInteractionContext): number | null {
  if (context.activeBlock?.type !== "codeFence") {
    return null;
  }

  const block = context.activeBlock as CodeFenceBlock;
  const boundaries = getCodeFenceBoundaryAnchors(block, context.source);

  if (context.lineStart === boundaries.lastContent?.lineStart) {
    return boundaries.closingFence?.lineStart ?? null;
  }

  return null;
}

export const codeFenceAdapter: BlockInteractionAdapter = {
  resolvePointerSelection,
  resolveArrowUp,
  resolveArrowDown
};
