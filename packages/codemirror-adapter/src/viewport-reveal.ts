import { EditorView } from "@codemirror/view";

export type EditorRevealIntent = "preserve" | "nearest" | "navigate";

type RectLike = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

type RevealMargins = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type EditorRevealDelta = {
  readonly top: number;
  readonly left: number;
};

const PRESERVE_MARGINS: RevealMargins = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
};

const NEAREST_MARGINS: RevealMargins = {
  top: 24,
  right: 16,
  bottom: 24,
  left: 16
};

// A single key makes repeated focus/mousedown/click requests in the same frame
// collapse to one geometry measurement. The latest target wins, while intent is
// promoted rather than overwritten so a re-entrant focus "preserve" request
// cannot weaken a keyboard "nearest" reveal.
const EDITOR_REVEAL_MEASURE_KEY = {};

type PendingEditorReveal = {
  element: HTMLElement;
  intent: EditorRevealIntent;
};

const pendingEditorReveals = new WeakMap<EditorView, PendingEditorReveal>();
const EDITOR_REVEAL_INTENT_PRIORITY: Readonly<Record<EditorRevealIntent, number>> = {
  preserve: 0,
  nearest: 1,
  navigate: 2
};

export function mergeEditorRevealIntent(
  current: EditorRevealIntent,
  next: EditorRevealIntent
): EditorRevealIntent {
  return EDITOR_REVEAL_INTENT_PRIORITY[next] > EDITOR_REVEAL_INTENT_PRIORITY[current]
    ? next
    : current;
}

export function editorRevealOptionsFor(intent: EditorRevealIntent) {
  if (intent === "navigate") {
    return {
      y: "center" as const,
      x: "nearest" as const,
      yMargin: 24,
      xMargin: 16
    };
  }

  const margins = intent === "nearest" ? NEAREST_MARGINS : PRESERVE_MARGINS;
  return {
    y: "nearest" as const,
    x: "nearest" as const,
    yMargin: margins.top,
    xMargin: margins.left
  };
}

export function createEditorOffsetRevealEffect(offset: number, intent: EditorRevealIntent) {
  return EditorView.scrollIntoView(offset, editorRevealOptionsFor(intent));
}

export function computeEditorRevealDelta(
  targetRect: RectLike,
  viewportRect: RectLike,
  intent: EditorRevealIntent
): EditorRevealDelta {
  const margins = intent === "preserve" ? PRESERVE_MARGINS : NEAREST_MARGINS;

  if (intent === "navigate") {
    const safeTop = viewportRect.top + margins.top;
    const safeBottom = viewportRect.bottom - margins.bottom;
    const safeHeight = Math.max(0, safeBottom - safeTop);
    const targetHeight = Math.max(0, targetRect.bottom - targetRect.top);
    const top = targetHeight <= safeHeight
      ? (targetRect.top + targetRect.bottom) / 2 - (safeTop + safeBottom) / 2
      : targetRect.top - safeTop;

    return {
      top,
      left: nearestAxisDelta(
        targetRect.left,
        targetRect.right,
        viewportRect.left,
        viewportRect.right,
        margins.left,
        margins.right
      )
    };
  }

  return {
    top: nearestAxisDelta(
      targetRect.top,
      targetRect.bottom,
      viewportRect.top,
      viewportRect.bottom,
      margins.top,
      margins.bottom
    ),
    left: nearestAxisDelta(
      targetRect.left,
      targetRect.right,
      viewportRect.left,
      viewportRect.right,
      margins.left,
      margins.right
    )
  };
}

export function requestEditorElementReveal(
  view: EditorView,
  element: HTMLElement,
  intent: EditorRevealIntent
): void {
  const pending = pendingEditorReveals.get(view);

  if (pending) {
    pending.element = element;
    pending.intent = mergeEditorRevealIntent(pending.intent, intent);
    return;
  }

  pendingEditorReveals.set(view, { element, intent });

  view.requestMeasure({
    key: EDITOR_REVEAL_MEASURE_KEY,
    read: () => {
      const current = pendingEditorReveals.get(view);
      if (!current || !view.dom.contains(current.element)) {
        return null;
      }

      const scroller = view.scrollDOM;
      return {
        intent: current.intent,
        scroller,
        targetRect: current.element.getBoundingClientRect(),
        viewportRect: scroller.getBoundingClientRect(),
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft
      };
    },
    write: (measurement) => {
      pendingEditorReveals.delete(view);

      if (measurement === null) {
        return;
      }

      const delta = computeEditorRevealDelta(
        measurement.targetRect,
        measurement.viewportRect,
        measurement.intent
      );

      if (delta.top !== 0) {
        measurement.scroller.scrollTop = Math.max(0, measurement.scrollTop + delta.top);
      }

      if (delta.left !== 0) {
        measurement.scroller.scrollLeft = Math.max(0, measurement.scrollLeft + delta.left);
      }
    }
  });
}

function nearestAxisDelta(
  targetStart: number,
  targetEnd: number,
  viewportStart: number,
  viewportEnd: number,
  startMargin: number,
  endMargin: number
): number {
  const safeStart = viewportStart + startMargin;
  const safeEnd = viewportEnd - endMargin;
  const targetSize = Math.max(0, targetEnd - targetStart);
  const safeSize = Math.max(0, safeEnd - safeStart);

  // When a target is larger than the available safe area, aligning its leading
  // edge is stable and avoids oscillating between top/bottom corrections.
  if (targetSize > safeSize) {
    return targetStart - safeStart;
  }

  if (targetStart < safeStart) {
    return targetStart - safeStart;
  }

  if (targetEnd > safeEnd) {
    return targetEnd - safeEnd;
  }

  return 0;
}
