import { isMarkdownLeafNode, type CodeFenceBlock, type MarkdownNode } from "@fishmark/markdown-engine";

import { getInactiveCodeFenceLines } from "@fishmark/editor-model";
import { canonicalLeafView } from "../../decorations/canonical-leaf-view";
import type { BlockInteractionAdapter, PointerInteractionContext, VerticalInteractionContext } from "../types";

function getCodeFenceBoundaryAnchors(block: CodeFenceBlock, source: string) {
  const lines = getInactiveCodeFenceLines(block.startOffset, block.endOffset, source, block.kind);
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

// Root-level code fences only, matching the projection's active block: a fence nested in a container
// keeps its container as the active block, so its arrow navigation stays with the container.
function readCodeFenceBlock(
  context: PointerInteractionContext | VerticalInteractionContext,
  node: MarkdownNode | null
): CodeFenceBlock | null {
  if (node === null || !isMarkdownLeafNode(node) || node.data.kind !== "code-fence") {
    return null;
  }

  return canonicalLeafView(node, context.snapshot) as CodeFenceBlock;
}

function resolvePointerSelection(context: PointerInteractionContext): number | null {
  const block = readCodeFenceBlock(context, context.lineBlock);

  if (!block) {
    return null;
  }

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
  const block = readCodeFenceBlock(context, context.activeBlock);

  if (!block) {
    return null;
  }

  const boundaries = getCodeFenceBoundaryAnchors(block, context.source);

  if (context.lineStart === boundaries.firstContent?.lineStart) {
    return boundaries.openingFence?.lineStart ?? null;
  }

  return null;
}

function resolveArrowDown(context: VerticalInteractionContext): number | null {
  const block = readCodeFenceBlock(context, context.activeBlock);

  if (!block) {
    return null;
  }

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
