import type { EditorView } from "@codemirror/view";

import type { MarkdownBlock } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import type { PointerInteractionContext, VerticalInteractionContext } from "./types";

function findBlockAtOffset(blocks: readonly MarkdownBlock[], offset: number): MarkdownBlock | null {
  for (const block of blocks) {
    if (offset >= block.startOffset && offset < block.endOffset) {
      return block;
    }
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;

    if (offset === block.endOffset) {
      return block;
    }
  }

  return null;
}

export function createPointerInteractionContext(
  view: EditorView,
  activeState: ActiveBlockState,
  event: MouseEvent
): PointerInteractionContext | null {
  const target = event.target instanceof Element ? event.target : null;

  if (!target || !view.dom.contains(target)) {
    return null;
  }

  const lineElement = target.closest(".cm-line");

  if (!(lineElement instanceof HTMLElement)) {
    return null;
  }

  let lineStart = -1;

  try {
    lineStart = view.posAtDOM(lineElement, 0);
  } catch {
    return null;
  }

  const line = view.state.doc.lineAt(lineStart);
  const styles = window.getComputedStyle(lineElement);

  return {
    view,
    activeState,
    source: view.state.doc.toString(),
    document: activeState.blockMap,
    target,
    event,
    lineElement,
    lineStart: line.from,
    lineEnd: line.to,
    lineBlock: findBlockAtOffset(activeState.blockMap.blocks, line.from),
    rect: lineElement.getBoundingClientRect(),
    paddingLeft: Number.parseFloat(styles.paddingLeft || "0") || 0,
    paddingTop: Number.parseFloat(styles.paddingTop || "0") || 0,
    paddingBottom: Number.parseFloat(styles.paddingBottom || "0") || 0
  };
}

export function createVerticalInteractionContext(
  view: EditorView,
  activeState: ActiveBlockState,
  goalColumn?: number
): VerticalInteractionContext {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);

  return {
    view,
    activeState,
    source: view.state.doc.toString(),
    document: activeState.blockMap,
    activeBlock: activeState.activeBlock,
    lineStart: line.from,
    lineEnd: line.to,
    goalColumn: goalColumn ?? selection.goalColumn
  };
}
