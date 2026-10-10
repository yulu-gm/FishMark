import { findClusterBreak } from "@codemirror/state";
import { projectTableCellSource } from "@fishmark/markdown-engine";

export type TableCaretGeometry = {
  readonly rect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width" | "height">;
  readonly source: "selection" | "text-boundary" | "character" | "empty-line";
};

function validRect(rect: DOMRect): boolean {
  return [rect.top, rect.bottom, rect.left, rect.right].every(Number.isFinite) && rect.height > 0;
}

// Reading an equivalent Text boundary repairs geometry, not the browser's
// Selection. Chromium can report no rect for (editable DIV, childIndex=0).
export function readTableCaretGeometry(editor: HTMLElement, offset: number): TableCaretGeometry | null {
  const doc = editor.ownerDocument;
  const selection = doc.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !selection.focusNode ||
      !editor.contains(selection.focusNode) || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null;
  const fullText = editor.textContent ?? "";
  if (!Number.isInteger(offset) || offset < 0 || offset > fullText.length) return null;
  const native = selection.getRangeAt(0);
  const nativeRect = Array.from(native.getClientRects()).find(validRect);
  if (nativeRect) return { rect: nativeRect, source: "selection" };
  const walker = doc.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    if (text.length && remaining <= text.length) {
      const range = doc.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const boundaryRect = Array.from(range.getClientRects()).find(validRect);
      if (boundaryRect) return { rect: boundaryRect, source: "text-boundary" };
      // Keep graphemes whole (surrogates, combining marks, ZWJ emoji). This
      // temporary range never changes native selection or inserts DOM content.
      const after = offset < fullText.length;
      const from = after ? offset : findClusterBreak(fullText, offset, false);
      const to = after ? findClusterBreak(fullText, offset, true) : offset;
      // A DOM code-unit offset inside a grapheme has no unambiguous edge.
      const prior = from === 0 ? 0 : findClusterBreak(fullText, from, false);
      if ((from !== 0 && findClusterBreak(fullText, prior, true) !== from) ||
          findClusterBreak(fullText, from, true) !== to ||
          /[\p{Script=Hebrew}\p{Script=Arabic}]/u.test(fullText.slice(from, to))) return null;
      const start = resolveTableTextBoundary(editor, from, true);
      const end = resolveTableTextBoundary(editor, to, false);
      if (!start || !end) return null;
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const boxes = Array.from(range.getClientRects()).filter(validRect);
      const box = after ? boxes[0] : boxes[boxes.length - 1];
      if (!box) return null;
      const rtl = doc.defaultView?.getComputedStyle(node.parentElement ?? editor).direction === "rtl";
      const x = after !== rtl ? box.left : box.right;
      return { rect: { top: box.top, bottom: box.bottom, left: x, right: x, width: 0, height: box.height }, source: "character" };
    }
    remaining -= text.length;
    node = walker.nextNode();
  }
  if (offset !== 0 || editor.textContent !== "") return null;
  // Empty cells have a real placeholder line. Never use the cell's potentially
  // viewport-sized border box as the caret's height.
  const br = editor.querySelector("br");
  const box = br ? Array.from(br.getClientRects()).find(validRect) : null;
  if (!box) return null;
  return { rect: { top: box.top, bottom: box.bottom, left: box.left, right: box.left,
    width: 0, height: box.height }, source: "empty-line" };
}

function resolveTableTextBoundary(editor: HTMLElement, offset: number, forward: boolean): { node: Node; offset: number } | null {
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  let last: Node | null = null;
  while (node) {
    const length = node.nodeValue?.length ?? 0;
    if (remaining < length || (!forward && remaining === length && length > 0)) return { node, offset: remaining };
    remaining -= length;
    last = node;
    node = walker.nextNode();
  }
  return remaining === 0 && last ? { node: last, offset: last.nodeValue?.length ?? 0 } : null;
}

/** Exact text projection only; callers must prove canonical source equals DOM text. */
export function readTableTextRangeRects(editor: HTMLElement, from: number, to: number): DOMRect[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > (editor.textContent?.length ?? 0)) return [];
  const start = resolveTableTextBoundary(editor, from, true);
  const end = resolveTableTextBoundary(editor, to, false);
  if (!start || !end) return [];
  const range = editor.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return Array.from(range.getClientRects()).filter(validRect);
}

/** Prove the rendered text projection before using canonical source offsets. */
export function readTableSourceRangeRects(editor: HTMLElement, source: string, from: number, to: number): DOMRect[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > source.length) return [];
  if (editor.textContent === source) return readTableTextRangeRects(editor, from, to);
  const { text, boundaries } = projectTableCellSource(source);
  if (editor.textContent !== text) return [];
  const start = boundaries.findIndex(boundary => boundary > from) - 1;
  const end = boundaries.findIndex(boundary => boundary >= to);
  return readTableTextRangeRects(editor, start, end);
}
