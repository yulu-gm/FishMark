// Selection-derived editor state. Everything here is recomputed from a selection alone, so a
// cursor move never touches the parsed document.

export interface EditorSelection {
  readonly anchor: number;
  readonly head: number;
}

export interface SelectionContext {
  readonly selection: EditorSelection;
  readonly from: number;
  readonly to: number;
  readonly empty: boolean;
  readonly activeOffset: number;
}

export function createSelectionContext(selection: EditorSelection): SelectionContext {
  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);

  return Object.freeze({
    selection: Object.freeze({ anchor: selection.anchor, head: selection.head }),
    from,
    to,
    empty: from === to,
    activeOffset: selection.head
  });
}

export function sameSelection(left: EditorSelection, right: EditorSelection): boolean {
  return left.anchor === right.anchor && left.head === right.head;
}

export function clampSelectionToSource(selection: EditorSelection, sourceLength: number): EditorSelection {
  const clamp = (offset: number): number => Math.max(0, Math.min(sourceLength, offset));

  return { anchor: clamp(selection.anchor), head: clamp(selection.head) };
}
