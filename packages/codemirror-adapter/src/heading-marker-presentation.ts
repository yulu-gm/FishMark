import { StateEffect, StateField, Transaction, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ActiveBlockSelection, EditorDerivedSnapshot } from "@fishmark/editor-model";

export type HeadingPresentationMode = "reading" | "editing";
export type HeadingMarkerRange = { from: number; to: number };
export type HeadingMarkerPresentation = { mode: HeadingPresentationMode; revealed: HeadingMarkerRange | null };
const initialPresentation: HeadingMarkerPresentation = { mode: "editing", revealed: null };
export const setHeadingPresentationEffect = StateEffect.define<HeadingPresentationMode>();
export const revealHeadingMarkerEffect = StateEffect.define<HeadingMarkerRange>();
const headingPresentationField = StateField.define<HeadingMarkerPresentation>({
  create: () => initialPresentation,
  update(value, transaction) {
    let { mode, revealed } = value;
    if (revealed !== null) {
      revealed = { from: transaction.changes.mapPos(revealed.from, 1), to: transaction.changes.mapPos(revealed.to, -1) };
      const selection = transaction.newSelection.main;
      if (revealed.to <= revealed.from || !selection.empty || selection.head !== revealed.to) revealed = null;
    }
    for (const effect of transaction.effects) {
      if (effect.is(setHeadingPresentationEffect)) { mode = effect.value; if (mode === "reading") revealed = null; }
      if (effect.is(revealHeadingMarkerEffect)) revealed = effect.value;
    }
    return { mode, revealed };
  }
});
export function createHeadingPresentationExtension(mode: HeadingPresentationMode = "editing"): Extension {
  return headingPresentationField.init(() => ({ mode, revealed: null }));
}
export function readHeadingPresentation(state: EditorState): HeadingMarkerPresentation {
  return state.field(headingPresentationField, false) ?? initialPresentation;
}
export function setHeadingPresentation(view: EditorView, mode: HeadingPresentationMode): void {
  if (readHeadingPresentation(view.state).mode !== mode) view.dispatch({
    effects: setHeadingPresentationEffect.of(mode), annotations: Transaction.addToHistory.of(false)
  });
}
export function headingMarkerIsVisible(range: HeadingMarkerRange, selection: ActiveBlockSelection,
  hasFocus: boolean, presentation: HeadingMarkerPresentation = initialPresentation): boolean {
  if (!hasFocus || presentation.mode === "reading") return false;
  const from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head);
  return (from === to ? from >= range.from && from < range.to : from < range.to && to > range.from) ||
    (presentation.revealed?.from === range.from && presentation.revealed.to === range.to && from === range.to && from === to);
}
export function headingMarkerAt(snapshot: EditorDerivedSnapshot, offset: number): HeadingMarkerRange | null {
  const line = snapshot.lineAt(offset);
  const node = line?.nodeId == null ? null : snapshot.nodeById(line.nodeId);
  if (node?.data.kind !== "heading") return null;
  const marker = node.markers.find((value) => value.kind === "heading");
  if (marker === undefined) return null;
  const { startOffset: from, endOffset: to } = marker.range;
  // Long whitespace/tab prefixes stay source-visible from the outset. The same
  // qualification owns decorations and keyboard behavior, including in reading.
  return /^#{1,6} ?$/u.test(snapshot.source.slice(from, to)) ? { from, to } : null;
}
