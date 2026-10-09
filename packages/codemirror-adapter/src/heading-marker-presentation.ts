import { StateEffect, StateField, Transaction, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ActiveBlockSelection, EditorDerivedSnapshot } from "@fishmark/editor-model";
import type { InlineASTNode } from "@fishmark/markdown-engine";

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

// Only ordinary list/task prefixes and supported inline syntax join the heading
// protocol. Tables, images, math, footnotes and fence boundaries retain their owners.
export function progressiveMarkerAt(snapshot: EditorDerivedSnapshot, offset: number, includeList = true): HeadingMarkerRange | null {
  const heading = headingMarkerAt(snapshot, offset);
  if (heading !== null && offset >= heading.from && offset <= heading.to) return heading;
  const line = snapshot.lineAt(offset);
  const list = line?.segments.find(segment => segment.kind === "list-marker");
  if (includeList && line && list && offset >= list.range.startOffset && offset <= line.contentStartOffset) {
    return { from: list.range.startOffset, to: line.contentStartOffset };
  }
  const node = line?.nodeId == null ? null : snapshot.nodeById(line.nodeId);
  return node && (node.kind === "paragraph" || node.kind === "heading") && node.inline
    ? inlineMarkerAt(node.inline, offset) : null;
}

function inlineMarkerAt(node: InlineASTNode, offset: number): HeadingMarkerRange | null {
  if (offset < node.startOffset || offset > node.endOffset) return null;
  if (node.type !== "root" && node.type !== "strong" && node.type !== "emphasis" && node.type !== "strikethrough" &&
    node.type !== "codeSpan" && node.type !== "link") return null;
  if ("children" in node) {
    for (const child of node.children) { const range = inlineMarkerAt(child, offset); if (range) return range; }
  }
  if (node.type === "root") return null;
  const from = node.openMarker.startOffset, to = node.openMarker.endOffset;
  if (offset >= from && offset <= to) return { from, to };
  const close = { from: node.closeMarker.startOffset, to: node.type === "link" ? node.endOffset : node.closeMarker.endOffset };
  return offset >= close.from && offset <= close.to ? close : null;
}
