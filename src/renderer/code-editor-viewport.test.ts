// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import {createCodeEditorController} from "./code-editor";

// jsdom lacks Range geometry; this checks measure ordering, not pixel layout.
const rangeGeometryDescriptors = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const name of ["getClientRects", "getBoundingClientRect"]) {
    rangeGeometryDescriptors.set(name, Object.getOwnPropertyDescriptor(Range.prototype, name));
    if (!(name in Range.prototype)) Object.defineProperty(Range.prototype, name, {
      configurable: true, writable: true,
      value: name === "getClientRects" ? () => [] : () => new DOMRect()
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of rangeGeometryDescriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

describe("editor view snapshots", () => {
  it("rejects malformed and invisible cross-window anchors without queuing a late scroll", () => {
    const host = document.createElement("div");
    const controller = createCodeEditorController({ parent: host, initialContent: "0123456789", onChange: vi.fn() });
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    const dispatch = vi.spyOn(view, "dispatch");
    try {
      expect(controller.restoreReadingPosition({ anchor: 11, relativeY: 0, scrollLeft: 0 })).toBe(false);
      expect(controller.restoreReadingPosition({ anchor: 0, relativeY: NaN, scrollLeft: 0 })).toBe(false);
      expect(controller.restoreReadingPosition({ anchor: 0, relativeY: 0, scrollLeft: -1 })).toBe(false);
      expect(controller.restoreReadingPosition({ anchor: 3, relativeY: -12, scrollLeft: 0 })).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
      controller.replaceDocument("replacement");
      expect(controller.getContent()).toBe("replacement");
    } finally { dispatch.mockRestore(); controller.destroy(); }
    expect(controller.restoreReadingPosition({ anchor: 0, relativeY: 0, scrollLeft: 0 })).toBe(false);
  });
  it("settles a pending layout before an immediate second capture", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const controller = createCodeEditorController({ parent: host, initialContent: "first\nsecond", onChange: vi.fn() });
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    let measured = false;
    try {
      const saved = controller.captureViewState();
      controller.replaceDocument("other");
      controller.replaceDocument("first\nsecond");
      controller.restoreViewState(saved);
      view.requestMeasure({ read: () => { measured = true; } });
      // No animation frame or timer between restore and the next switch.
      controller.captureViewState();
      expect(measured).toBe(true);
    } finally { controller.destroy(); host.remove(); }
  });

  it("restores exact selection without editing text and rejects changed content", () => {
    const host = document.createElement("div");
    const onChange = vi.fn(), onDocumentChangeFrame = vi.fn();
    const controller = createCodeEditorController({ parent: host, initialContent: "0123456789", onChange, onDocumentChangeFrame });
    try {
      controller.setSelection(7, 3);
      const saved = controller.captureViewState();
      controller.replaceDocument("different");
      expect(controller.restoreViewState(saved)).toBe(false);
      expect(controller.getContent()).toBe("different");
      expect(controller.getSelection()).toEqual({ anchor: 0, head: 0 });
      controller.replaceDocument("0123456789");
      expect(controller.restoreViewState(saved)).toBe(true);
      expect(controller.getSelection()).toEqual({ anchor: 7, head: 3 });
      expect(controller.getContent()).toBe("0123456789");
      expect(onChange).not.toHaveBeenCalled();
      expect(onDocumentChangeFrame).not.toHaveBeenCalled();
    } finally { controller.destroy(); }
  });
});
