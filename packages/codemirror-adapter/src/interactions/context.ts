import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "@fishmark/editor-model";
import { findBlockForLine } from "./canonical-blocks";
import type { PointerInteractionContext, VerticalInteractionContext } from "./types";

function findElementAtPoint(document: Document, clientX: number, clientY: number): Element | null {
  if (typeof document.elementFromPoint !== "function") {
    return null;
  }

  const target = document.elementFromPoint(clientX, clientY);

  return target instanceof Element ? target : null;
}

export function createPointerInteractionContext(
  view: EditorView,
  activeState: ActiveBlockState,
  event: MouseEvent
): PointerInteractionContext | null {
  let target = event.target instanceof Element ? event.target : null;

  if (!target || !view.dom.contains(target)) {
    const coordinateTarget = findElementAtPoint(view.dom.ownerDocument, event.clientX, event.clientY);
    target = coordinateTarget;

    if (!target || !view.dom.contains(target)) {
      return null;
    }
  }

  let lineElement = target.closest(".cm-line");

  if (!(lineElement instanceof HTMLElement)) {
    const coordinateTarget = findElementAtPoint(view.dom.ownerDocument, event.clientX, event.clientY);

    if (coordinateTarget && view.dom.contains(coordinateTarget)) {
      const coordinateLine = coordinateTarget.closest(".cm-line");

      if (coordinateLine instanceof HTMLElement) {
        target = coordinateTarget;
        lineElement = coordinateLine;
      }
    }
  }

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
    snapshot: activeState.snapshot,
    source: view.state.doc.toString(),
    target,
    event,
    lineElement,
    lineStart: line.from,
    lineEnd: line.to,
    lineBlock: findBlockForLine(activeState.snapshot, line.number),
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
    snapshot: activeState.snapshot,
    source: view.state.doc.toString(),
    activeBlock: activeState.activeRootNodeId === null
      ? null
      : activeState.snapshot.nodeById(activeState.activeRootNodeId),
    lineStart: line.from,
    lineEnd: line.to,
    goalColumn: goalColumn ?? selection.goalColumn
  };
}
