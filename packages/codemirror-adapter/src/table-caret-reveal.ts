import type { SelectionRange, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { readEditableSelection } from "./decorations/table-widget";
import { computeEditorRevealDelta, mergeEditorRevealIntent, type EditorRevealIntent } from "./viewport-reveal";
import { readTableCaretGeometry } from "./table-caret-geometry";

type PendingCaretReveal = {
  readonly doc: Text;
  readonly head: number;
  readonly editor: HTMLElement;
  readonly offset: number;
  readonly intent: EditorRevealIntent;
};

// This belongs to one canonical selection, not to a remembered screen position.
const pendingReveals = new WeakMap<EditorView, PendingCaretReveal>();

export function noteTableCaretReveal(
  view: EditorView, editor: HTMLElement, offset: number, intent: EditorRevealIntent
): void {
  const head = view.state.selection.main.head;
  const previous = pendingReveals.get(view);
  const mergedIntent = previous?.doc === view.state.doc && previous.head === head &&
    previous.editor === editor && previous.offset === offset
    ? mergeEditorRevealIntent(previous.intent, intent) : intent;
  pendingReveals.set(view, { doc: view.state.doc, head, editor, offset, intent: mergedIntent });
}

export function clearTableCaretReveal(view: EditorView): void {
  pendingReveals.delete(view);
}

export function revealTableCaret(view: EditorView, range: SelectionRange): boolean {
  const pending = pendingReveals.get(view);
  if (!pending) return false;
  pendingReveals.delete(view);
  const { editor } = pending;
  if (view.state.doc !== pending.doc || !range.empty || !view.state.selection.main.empty ||
      range.head !== pending.head || range.head !== view.state.selection.main.head ||
      !editor.isConnected || !view.dom.contains(editor) ||
      editor.dataset.tableCellRenderMode !== "plain" || editor.ownerDocument.activeElement !== editor) return false;
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !selection.focusNode ||
      !editor.contains(selection.focusNode) || !selection.anchorNode ||
      !editor.contains(selection.anchorNode) || readEditableSelection(editor).start !== pending.offset) return false;
  const geometry = readTableCaretGeometry(editor, pending.offset);
  if (!geometry) return false;
  return revealTableRect(view, editor, geometry.rect, pending.intent);
}

export function revealTableRect(
  view: EditorView, editor: HTMLElement,
  rect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">,
  intent: EditorRevealIntent
): boolean {
  const scroller = view.scrollDOM;
  const outer = scroller.getBoundingClientRect();
  const scaleX = scroller.offsetWidth ? outer.width / scroller.offsetWidth : 1;
  const scaleY = scroller.offsetHeight ? outer.height / scroller.offsetHeight : 1;
  if (!(scaleX > 0 && scaleY > 0)) return false;
  const top = outer.top + scroller.clientTop * scaleY;
  const left = outer.left + scroller.clientLeft * scaleX;
  const viewport = { top, left, bottom: top + scroller.clientHeight * scaleY,
    right: left + scroller.clientWidth * scaleX,
    width: scroller.clientWidth * scaleX, height: scroller.clientHeight * scaleY };
  // The table may own horizontal overflow. Read both boxes before writing;
  // account for the actual clamped inner movement before revealing externally.
  const table = editor.closest<HTMLElement>(".cm-table-widget");
  const innerBox = table?.getBoundingClientRect();
  let target = rect;
  if (table && innerBox && table.scrollWidth > table.clientWidth && table.offsetWidth > 0) {
    const innerScale = innerBox.width / table.offsetWidth;
    if (!(innerScale > 0)) return false;
    const innerLeft = innerBox.left + table.clientLeft * innerScale;
    const inner = { top: rect.top, bottom: rect.bottom, height: rect.height,
      left: innerLeft, right: innerLeft + table.clientWidth * innerScale,
      width: table.clientWidth * innerScale };
    const dx = computeEditorRevealDelta(rect, inner, intent).left;
    if (dx !== 0) {
      const previous = table.scrollLeft;
      table.scrollLeft = previous + dx / innerScale;
      const actual = (table.scrollLeft - previous) * innerScale;
      target = { ...rect, left: rect.left - actual, right: rect.right - actual };
    }
  }
  const delta = computeEditorRevealDelta(target, viewport, intent);
  if (delta.top !== 0) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta.top / scaleY);
  if (delta.left !== 0) scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta.left / scaleX);
  // Consuming a zero-delta target is essential: the default coordinates describe
  // the entire replacement table, not this native caret.
  return true;
}

