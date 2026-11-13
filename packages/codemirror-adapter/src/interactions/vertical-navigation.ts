import { EditorSelection, type SelectionRange } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { VerticalNavigationResult } from "./types";

type VerticalLayout = {
  staysInLine: boolean;
  goalColumn: number;
  contentLeft: number;
};

export function readVerticalLayout(
  view: EditorView,
  selection: SelectionRange,
  forward: boolean
): VerticalLayout | null {
  const content = view.contentDOM.getBoundingClientRect();
  if (content.height === 0) return null;

  const start = view.coordsAtPos(selection.head, selection.assoc || (forward ? 1 : -1));
  if (start === null || start.bottom <= start.top) return null;

  const line = view.state.doc.lineAt(selection.head);
  const edge = view.coordsAtPos(forward ? line.to : line.from, forward ? -1 : 1);
  const middle = (start.top + start.bottom) / 2;

  return {
    staysInLine: edge !== null && (forward ? middle < edge.top : middle > edge.bottom),
    goalColumn: selection.goalColumn ?? (start.left - content.left),
    contentLeft: content.left
  };
}

export function structuralCursor(
  view: EditorView,
  selection: SelectionRange,
  target: VerticalNavigationResult,
  layout: VerticalLayout,
  forward: boolean
): SelectionRange {
  if (target.anchor === selection.head) {
    return EditorSelection.cursor(target.anchor, selection.assoc, selection.bidiLevel ?? undefined, layout.goalColumn);
  }

  if (target.goalColumn !== undefined) {
    // 结构规则指定目的源码行。用布局在其第一或最后一个视觉行找落点，
    // 避免把字符列当作像素，也避免把光标落在 emoji 的代理对中间。
    const line = view.state.doc.lineAt(target.anchor);
    const edge = view.coordsAtPos(forward ? line.from : line.to, forward ? 1 : -1);
    if (edge !== null && edge.bottom > edge.top) {
      const point = view.posAndSideAtCoords({
        x: layout.contentLeft + layout.goalColumn,
        y: (edge.top + edge.bottom) / 2
      }, false);
      if (point.pos >= line.from && point.pos <= line.to) {
        return EditorSelection.cursor(point.pos, point.assoc, undefined, layout.goalColumn);
      }
    }
  }

  return EditorSelection.cursor(target.anchor, forward ? 1 : -1, undefined, layout.goalColumn);
}
