// @vitest-environment jsdom
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTableCaretReveal, noteTableCaretReveal, revealTableCaret, revealTableRect } from "./table-caret-reveal";

function setup() {
  const dom = document.createElement("div"), scroller = document.createElement("div"), editor = document.createElement("div");
  editor.dataset.tableCellRenderMode = "plain";
  editor.tabIndex = 0;
  editor.contentEditable = "true";
  editor.textContent = "abcdef";
  dom.append(scroller); scroller.append(editor); document.body.append(dom); editor.focus();
  const selection = document.getSelection()!, range = document.createRange();
  range.setStart(editor.firstChild!, 2); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
  const state = EditorState.create({ doc: "abcdef", selection: { anchor: 2 } });
  const view = { dom, scrollDOM: scroller, state } as unknown as EditorView;
  Object.defineProperties(scroller, { clientWidth: { value: 100 }, clientHeight: { value: 100 }, offsetWidth: { value: 100 }, offsetHeight: { value: 100 } });
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  const original = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [new DOMRect(30, 90, 0, 10)] });
  return { view, editor, scroller, restore() { if (original) Object.defineProperty(Range.prototype, "getClientRects", original); else Reflect.deleteProperty(Range.prototype, "getClientRects"); } };
}
afterEach(() => { document.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("canonical table caret scroll target", () => {
  it("consumes visible zero-delta geometry once, avoiding the default whole-widget target", () => {
    const { view, editor, scroller, restore } = setup();
    try {
      noteTableCaretReveal(view, editor, 2, "preserve");
      expect(revealTableCaret(view, view.state.selection.main)).toBe(true);
      expect(scroller.scrollTop).toBe(0);
      expect(revealTableCaret(view, view.state.selection.main)).toBe(false);
    } finally { restore(); }
  });

  it("does not let reentrant focus weaken the pending keyboard margin", () => {
    const { view, editor, scroller, restore } = setup();
    try {
      noteTableCaretReveal(view, editor, 2, "nearest");
      noteTableCaretReveal(view, editor, 2, "preserve");
      expect(revealTableCaret(view, view.state.selection.main)).toBe(true);
      expect(scroller.scrollTop).toBe(24);
    } finally { restore(); }
  });

  it.each(["offset", "detached", "preview", "range", "document", "cleared"])("does not consume a stale or unowned target: %s", change => {
    const { view, editor, scroller, restore } = setup();
    try {
      noteTableCaretReveal(view, editor, 2, "nearest");
      let range = view.state.selection.main;
      if (change === "offset") document.getSelection()!.collapse(editor.firstChild!, 3);
      if (change === "detached") editor.remove();
      if (change === "preview") editor.dataset.tableCellRenderMode = "preview";
      if (change === "range") range = EditorSelection.range(1, 2);
      if (change === "document") Object.assign(view, { state: view.state.update({ changes: { from: 5, insert: "x" } }).state });
      if (change === "cleared") clearTableCaretReveal(view);
      expect(revealTableCaret(view, range)).toBe(false);
      expect(scroller.scrollTop).toBe(0);
    } finally { restore(); }
  });

  it("reveals horizontal table overflow before the outer viewport", () => {
    const { view, editor, scroller, restore } = setup();
    try {
      const table = document.createElement("div"); table.className = "cm-table-widget";
      editor.replaceWith(table); table.append(editor);
      Object.defineProperties(table, { scrollWidth: { value: 300 }, clientWidth: { value: 100 }, offsetWidth: { value: 100 } });
      vi.spyOn(table, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 5000));
      expect(revealTableRect(view, editor, new DOMRect(180, 20, 0, 21), "preserve")).toBe(true);
      expect(table.scrollLeft).toBe(80);
      expect(scroller.scrollLeft).toBe(0);
      expect(scroller.scrollTop).toBe(0);
    } finally { restore(); }
  });
});
