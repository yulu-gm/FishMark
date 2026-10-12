// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import { createCodeEditorController } from "./code-editor";

// jsdom cannot certify scrolling geometry. These assertions cover the actual
// scroll effect's source position; the owned Windows probe verifies visibility.
const headings = [
  { name: "H1", text: "# Title", visible: 2 },
  { name: "H2", text: "## Title", visible: 3 },
  { name: "H3", text: "### Title", visible: 4 },
  { name: "bold title", text: "## **Title**", visible: 5 },
  { name: "nested link title", text: "### [**Title**](url)", visible: 7 },
  { name: "empty title", text: "## ", visible: 3 },
  { name: "Setext title", text: "Title\n=====", visible: 0 }
];

for (const mode of ["reading", "editing"] as const) {
  it.each(headings)(`reveals the visible heading content for $name in ${mode}`, ({ text, visible }) => {
    const host = document.body.appendChild(document.createElement("div"));
    const prefix = "Control paragraph.\n\n";
    const source = prefix + text + "\n\nTail";
    const onChange = vi.fn();
    const controller = createCodeEditorController({
      parent: host, initialContent: source, headingPresentationMode: mode, onChange
    });
    const scroll = vi.spyOn(EditorView, "scrollIntoView");
    try {
      controller.navigateToOffset(prefix.length);
      expect(scroll).toHaveBeenCalledWith(prefix.length + visible, { y: "center", yMargin: 24 });
      expect(controller.getContent()).toBe(source);
      expect(onChange).not.toHaveBeenCalled();
      const selection = controller.getSelection();
      const expectedSelection = prefix.length + (mode === "reading" ? visible : 0);
      expect(selection).toEqual({ anchor: expectedSelection, head: expectedSelection });
    } finally {
      scroll.mockRestore(); controller.destroy(); host.remove();
    }
  });

  it(`uses the current heading offsets after switching and reloading in ${mode}`, () => {
    const host = document.body.appendChild(document.createElement("div"));
    const controller = createCodeEditorController({
      parent: host, initialContent: "# First", headingPresentationMode: mode, onChange: vi.fn()
    });
    const scroll = vi.spyOn(EditorView, "scrollIntoView");
    try {
      for (const [index, source] of ["# First", "Other introduction\n\n## **Second**", "Reloaded introduction with different offsets.\n\n### Third"].entries()) {
        if (index > 0) controller.replaceDocument(source);
        controller.setDocumentIdentity({ tabId: index === 0 ? "first" : "second", epoch: index + 1, loadRevision: index + 1 });
        scroll.mockClear();
        const at = source.indexOf("#");
        const visible = source.indexOf(["First", "Second", "Third"][index]!);
        controller.navigateToOffset(at);
        expect(scroll).toHaveBeenCalledWith(visible, { y: "center", yMargin: 24 });
        expect(controller.getContent()).toBe(source);
      }
    } finally {
      scroll.mockRestore(); controller.destroy(); host.remove();
    }
  });
}

it.each([
  { name: "source heading", source: "# Title", viewMode: "source" as const, offset: 0 },
  { name: "paragraph", source: "**Text**", viewMode: "wysiwym" as const, offset: 0 },
  { name: "heading interior", source: "# Title", viewMode: "wysiwym" as const, offset: 5 },
  { name: "document end clamp", source: "# Title", viewMode: "wysiwym" as const, offset: 99 }
])("preserves the reveal target for $name", ({ source, viewMode, offset }) => {
  const host = document.body.appendChild(document.createElement("div"));
  const controller = createCodeEditorController({ parent: host, initialContent: source, viewMode, onChange: vi.fn() });
  const scroll = vi.spyOn(EditorView, "scrollIntoView");
  try {
    controller.navigateToOffset(offset);
    expect(scroll).toHaveBeenCalledWith(Math.min(offset, source.length), { y: "center", yMargin: 24 });
  } finally {
    scroll.mockRestore(); controller.destroy(); host.remove();
  }
});

it.each(["complete", "destroy", "reload", "identity", "edit", "selection", "new navigation", "other navigation", "source mode", "presentation mode"] as const)(
  "bounds the next-frame heading measurement when navigation is followed by %s", action => {
    const host = document.body.appendChild(document.createElement("div"));
    const controller = createCodeEditorController({ parent: host, initialContent: "# First\n\n## Second", onChange: vi.fn() });
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1000, destroyed = false;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextId, callback); return nextId;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const measure = vi.spyOn(view, "requestMeasure").mockImplementation(() => undefined);
    const dispatch = vi.spyOn(view, "dispatch");
    try {
      controller.navigateToOffset(0);
      expect(frames.size).toBe(1);
      const firstId = nextId, first = frames.get(firstId)!;
      if (action === "destroy") { controller.destroy(); destroyed = true; }
      if (action === "reload") controller.replaceDocument("# Reloaded");
      if (action === "identity") controller.setDocumentIdentity({ tabId: "other", epoch: 2, loadRevision: 2 });
      if (action === "edit") controller.setContent("# Changed");
      if (action === "selection") controller.setSelection(4);
      if (action === "new navigation") controller.navigateToOffset(9);
      if (action === "other navigation") controller.navigateToOffset(4);
      if (action === "source mode") controller.setViewMode("source");
      if (action === "presentation mode") controller.setHeadingPresentationMode("reading");
      if (["destroy", "reload", "identity", "edit", "new navigation", "other navigation", "source mode", "presentation mode"].includes(action))
        expect(cancelFrame).toHaveBeenCalledWith(firstId);
      measure.mockClear(); dispatch.mockClear();
      const scheduledCount = requestFrame.mock.calls.length;
      first(0);
      expect(measure).toHaveBeenCalledTimes(action === "complete" ? 1 : 0);
      expect(dispatch).not.toHaveBeenCalled();
      expect(requestFrame).toHaveBeenCalledTimes(scheduledCount);
      if (action === "new navigation") {
        frames.get(nextId)!(0);
        expect(measure).toHaveBeenCalledTimes(1);
        expect(dispatch).not.toHaveBeenCalled();
      }
    } finally {
      if (!destroyed) controller.destroy();
      dispatch.mockRestore(); measure.mockRestore(); requestFrame.mockRestore(); cancelFrame.mockRestore(); host.remove();
    }
  }
);

it.each([
  { source: "Paragraph", viewMode: "wysiwym" as const, offset: 0 },
  { source: "# Title", viewMode: "source" as const, offset: 0 },
  { source: "# Title", viewMode: "wysiwym" as const, offset: 4 }
])("does not schedule heading measurement for an unaffected target %#", ({ source, viewMode, offset }) => {
  const host = document.body.appendChild(document.createElement("div"));
  const controller = createCodeEditorController({ parent: host, initialContent: source, viewMode, onChange: vi.fn() });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  const measure = vi.spyOn(view, "requestMeasure").mockImplementation(() => undefined);
  const frame = vi.spyOn(window, "requestAnimationFrame");
  try {
    controller.navigateToOffset(offset);
    expect(frame).not.toHaveBeenCalled();
  } finally {
    controller.destroy(); measure.mockRestore(); frame.mockRestore(); host.remove();
  }
});
