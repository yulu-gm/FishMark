// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { undoDepth, redoDepth } from "@codemirror/commands";
import { createCodeEditorController } from "./code-editor";
import { isEditorScrollbarPointerEvent } from "./editor/editor-pointer-utils";

// A routing contract only. Mock dimensions do not certify native thumb dragging
// or CodeMirror's virtualized height map in a real browser.
const rangeDescriptors = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const name of ["getClientRects", "getBoundingClientRect"]) {
    rangeDescriptors.set(name, Object.getOwnPropertyDescriptor(Range.prototype, name));
    if (!(name in Range.prototype)) Object.defineProperty(Range.prototype, name, {
      configurable: true, writable: true,
      value: name === "getClientRects" ? () => [] : () => new DOMRect()
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of rangeDescriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

describe("table editor scrollbar pointer routing", () => {
  it.each([
    { active: false, mapsToBody: false, axis: "vertical", native: true },
    { active: true, mapsToBody: false, axis: "vertical", native: true },
    { active: true, mapsToBody: true, axis: "vertical", native: true },
    { active: false, mapsToBody: false, axis: "horizontal", native: true },
    { active: true, mapsToBody: false, axis: "horizontal", native: true },
    { active: true, mapsToBody: true, axis: "horizontal", native: true },
    { active: true, mapsToBody: true, axis: "body", native: false },
    { active: true, mapsToBody: true, axis: "no-overflow", native: false }
  ])("routes host scrollbar input separately from body clicks: %j", async ({ active, mapsToBody, axis, native }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const source = "| A | B |\n| --- | --- |\n| alpha | beta |\n\nBody after table.";
    const onChange = vi.fn();
    const controller = createCodeEditorController({ parent: host, initialContent: source, onChange });
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    try {
      const cell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
      expect(cell).not.toBeNull();
      if (active) {
        cell.focus();
        await Promise.resolve();
        expect(document.activeElement).toBe(cell);
      }
      const scroller = view.scrollDOM;
      Object.defineProperties(scroller, {
        offsetWidth: { configurable: true, value: 916 }, clientWidth: { configurable: true, value: 900 },
        offsetHeight: { configurable: true, value: 616 }, clientHeight: { configurable: true, value: 600 },
        scrollHeight: { configurable: true, value: axis === "no-overflow" ? 600 : 12000 },
        scrollWidth: { configurable: true, value: axis === "horizontal" ? 1200 : 900 }
      });
      vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 916, 616));
      vi.spyOn(view, "posAtCoords").mockReturnValue(mapsToBody ? source.length : null);
      const selection = controller.getSelection();
      const focused = document.activeElement;
      const history = { undo: undoDepth(view.state), redo: redoDepth(view.state) };
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0,
        clientX: axis === "vertical" || axis === "no-overflow" ? 910 : 100,
        clientY: axis === "horizontal" ? 610 : 100 });
      scroller.dispatchEvent(event);
      expect(isEditorScrollbarPointerEvent(event, host)).toBe(native);
      if (native) {
        expect.soft(event.defaultPrevented).toBe(false);
        expect.soft(controller.getSelection()).toEqual(selection);
        expect.soft(document.activeElement).toBe(focused);
      } else {
        expect(event.defaultPrevented).toBe(true);
        expect(controller.getSelection()).toEqual({ anchor: source.length, head: source.length });
        expect(document.activeElement).toBe(view.contentDOM);
      }
      expect({ undo: undoDepth(view.state), redo: redoDepth(view.state) }).toEqual(history);
      expect(onChange).not.toHaveBeenCalled();
      expect(controller.getContent()).toBe(source);
    } finally {
      vi.restoreAllMocks();
      controller.destroy();
      host.remove();
    }
  });
});
