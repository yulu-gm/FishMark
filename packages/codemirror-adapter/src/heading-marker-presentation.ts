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

// Inline editing reveals the containing element, including its other delimiter.
// Both outer boundaries belong to the element. At a shared sibling boundary,
// both pairs are visible, so either arrow can enter the corresponding source.
export function inlineElementIsVisible(range: HeadingMarkerRange, selection: ActiveBlockSelection,
  hasFocus: boolean, presentation: HeadingMarkerPresentation = initialPresentation): boolean {
  if (!hasFocus || presentation.mode === "reading") return false;
  const from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head);
  return from === to ? from >= range.from && from <= range.to : from < range.to && to > range.from;
}

type EditableInline = Extract<InlineASTNode, { type: "strong" | "emphasis" | "strikethrough" | "codeSpan" | "link" }>;
function isEditableInline(node: InlineASTNode): node is EditableInline {
  return node.type === "strong" || node.type === "emphasis" || node.type === "strikethrough" ||
    node.type === "codeSpan" || node.type === "link";
}

// Only a collapsed pointer entry into previously hidden content uses this map.
// Once revealed, source offsets (including positions inside delimiters) are exact.
export function hiddenInlinePointerBoundary(snapshot: EditorDerivedSnapshot, offset: number,
  previousSelection: ActiveBlockSelection, hadFocus: boolean, presentation: HeadingMarkerPresentation): number | null {
  if (inlineElementAt(snapshot, offset) === null) return null;
  const line = snapshot.lineAt(offset);
  const block = line?.nodeId == null ? null : snapshot.nodeById(line.nodeId);
  if (!block || (block.kind !== "paragraph" && block.kind !== "heading") || !block.inline) return null;
  const visible = (node: EditableInline) => inlineElementIsVisible(
    { from: node.startOffset, to: node.endOffset }, previousSelection, hadFocus, presentation);
  const contentEdge = (node: EditableInline, end: boolean): number => {
    const edge = end ? node.closeMarker.startOffset : node.openMarker.endOffset;
    const child = "children" in node ? (end ? node.children.at(-1) : node.children[0]) : undefined;
    return child && isEditableInline(child) && !visible(child) &&
      (end ? child.endOffset : child.startOffset) === edge ? contentEdge(child, end) : edge;
  };
  const visit = (node: InlineASTNode): number | null => {
    if (offset < node.startOffset || offset > node.endOffset) return null;
    if (isEditableInline(node)) {
      // Parent first: coincident hidden edges enter the outermost formatting.
      if (!visible(node)) {
        if (offset === contentEdge(node, false)) return node.startOffset;
        if (offset === contentEdge(node, true)) return node.endOffset;
      }
    } else if (node.type !== "root") return null;
    if ("children" in node) for (const child of node.children) {
      const boundary = visit(child);
      if (boundary !== null) return boundary;
    }
    return null;
  };
  return visit(block.inline);
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
export function progressiveMarkerAt(snapshot: EditorDerivedSnapshot, offset: number, includeList = true,
  direction: -1 | 0 | 1 = 0): HeadingMarkerRange | null {
  const heading = headingMarkerAt(snapshot, offset);
  if (heading !== null && offset >= heading.from && offset <= heading.to) return heading;
  const line = snapshot.lineAt(offset);
  const list = line?.segments.find(segment => segment.kind === "list-marker");
  if (includeList && line && list && offset >= list.range.startOffset && offset <= line.contentStartOffset) {
    return { from: list.range.startOffset, to: line.contentStartOffset };
  }
  const node = line?.nodeId == null ? null : snapshot.nodeById(line.nodeId);
  return node && (node.kind === "paragraph" || node.kind === "heading") && node.inline
    ? inlineMarkerAt(node.inline, offset, direction) : null;
}

function inlineMarkerAt(node: InlineASTNode, offset: number, direction: -1 | 0 | 1): HeadingMarkerRange | null {
  if (offset < node.startOffset || offset > node.endOffset) return null;
  if (node.type !== "root" && node.type !== "strong" && node.type !== "emphasis" && node.type !== "strikethrough" &&
    node.type !== "codeSpan" && node.type !== "link") return null;
  if ("children" in node) {
    for (const child of node.children) { const range = inlineMarkerAt(child, offset, direction); if (range) return range; }
  }
  if (node.type === "root") return null;
  // At shared endpoints, arrows enter the marker on their movement side.
  // Pointer and Backspace lookups retain their inclusive owner semantics.
  const contains = (from: number, to: number) =>
    (direction < 0 ? offset > from : offset >= from) && (direction > 0 ? offset < to : offset <= to);
  const from = node.openMarker.startOffset, to = node.openMarker.endOffset;
  if (contains(from, to)) return { from, to };
  const close = { from: node.closeMarker.startOffset, to: node.type === "link" ? node.endOffset : node.closeMarker.endOffset };
  return contains(close.from, close.to) ? close : null;
}

export function inlineElementAt(snapshot: EditorDerivedSnapshot, offset: number): HeadingMarkerRange | null {
  const line = snapshot.lineAt(offset);
  const node = line?.nodeId == null ? null : snapshot.nodeById(line.nodeId);
  if (!node || (node.kind !== "paragraph" && node.kind !== "heading") || !node.inline) return null;
  // undefined means this child has no supported owner at the offset; null is
  // an excluded preview owner and blocks falling back to a formatting ancestor.
  const visit = (inline: InlineASTNode): HeadingMarkerRange | null | undefined => {
    if (offset < inline.startOffset || offset > inline.endOffset) return undefined;
    if (inline.type === "text" || inline.type === "hardBreak") return undefined;
    if (inline.type !== "root" && inline.type !== "strong" && inline.type !== "emphasis" &&
      inline.type !== "strikethrough" && inline.type !== "codeSpan" && inline.type !== "link") return null;
    if ("children" in inline) for (const child of inline.children) {
      const range = visit(child);
      if (range !== undefined) return range;
    }
    return inline.type === "root" ? undefined : { from: inline.startOffset, to: inline.endOffset };
  };
  return visit(node.inline) ?? null;
}
