// @vitest-environment jsdom

import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { createCodeEditorController } from "./code-editor";

const getEditorView = (host: HTMLElement) => {
  const editorRoot = host.querySelector(".cm-editor");

  expect(editorRoot).not.toBeNull();

  return editorRoot instanceof HTMLElement ? EditorView.findFromDOM(editorRoot) : null;
};

const getLineElementByText = (host: HTMLElement, text: string) => {
  const lines = Array.from(host.querySelectorAll(".cm-line"));
  return lines.find((line) => line.textContent?.includes(text)) ?? null;
};

const dispatchCompositionEvent = (
  target: HTMLElement,
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data = ""
) => {
  target.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
};

describe("createCodeEditorController", () => {
  it("returns the current content and can replace the loaded document", () => {
    const host = document.createElement("div");
    const controller = createCodeEditorController({
      parent: host,
      initialContent: "# Title\n",
      onChange: vi.fn()
    });

    expect(controller.getContent()).toBe("# Title\n");

    controller.replaceDocument("## Updated\n");

    expect(controller.getContent()).toBe("## Updated\n");

    controller.destroy();
  });

  it("calls onBlur when the editor loses focus", () => {
    const host = document.createElement("div");
    const onBlur = vi.fn();

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "# Title\n",
      onChange: vi.fn(),
      onBlur
    });

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(onBlur).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("reports active-block changes as the selection moves across top-level blocks", () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph", "", "- one", "- two", "", "> quote"].join("\n");
    const activeBlockTypes: Array<string | null> = [];
    const selectionAnchors: number[] = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
        selectionAnchors.push(state.selection.anchor);
      }
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();
    expect(activeBlockTypes.at(-1)).toBe("heading");

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(selectionAnchors.at(-1)).toBe(source.indexOf("Paragraph"));

    view?.dispatch({ selection: { anchor: source.indexOf("- one") } });
    expect(activeBlockTypes.at(-1)).toBe("list");

    view?.dispatch({ selection: { anchor: source.indexOf("> quote") } });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");

    controller.destroy();
  });

  it("applies inactive heading decorations when focus moves into a non-heading block", () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const headingLine = getLineElementByText(host, "# Title");
    const headingMarker = host.querySelector(".cm-inactive-heading-marker");

    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(headingLine?.classList.contains("cm-inactive-heading-depth-1")).toBe(true);
    expect(headingMarker).not.toBeNull();
    expect(headingMarker?.textContent).toBe("#");

    controller.destroy();
  });

  it("removes inactive heading decorations when the heading becomes active again", () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Title") } });

    const headingLine = getLineElementByText(host, "# Title");

    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(host.querySelector(".cm-inactive-heading-marker")).toBeNull();

    controller.destroy();
  });

  it("flushes inactive heading decorations once when composition ends", () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();

    const originalDispatch = view?.dispatch.bind(view);
    const dispatchSpy = vi.fn((spec: Parameters<NonNullable<typeof originalDispatch>>[0]) =>
      originalDispatch?.(spec)
    );

    if (view) {
      view.dispatch = dispatchSpy as unknown as typeof view.dispatch;
    }

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "x");
    view?.dispatch({
      changes: { from: source.length, insert: "x" },
      selection: { anchor: source.length + 1 }
    });

    dispatchSpy.mockClear();
    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "x");

    const decorationFlushCount = dispatchSpy.mock.calls.filter(
      ([spec]) => typeof spec === "object" && spec !== null && "effects" in spec
    ).length;

    expect(decorationFlushCount).toBe(1);
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();

    controller.destroy();
  });

  it("applies inactive paragraph decorations when another paragraph becomes active", () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });

    const firstParagraphLine = getLineElementByText(host, "Paragraph one");

    expect(firstParagraphLine).not.toBeNull();
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph")).toBe(true);
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph-leading")).toBe(
      true
    );

    controller.destroy();
  });

  it("removes inactive paragraph decorations when that paragraph becomes active again", () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });
    expect(getLineElementByText(host, "Paragraph one")?.classList.contains("cm-inactive-paragraph")).toBe(
      true
    );

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph one") } });

    const firstParagraphLine = getLineElementByText(host, "Paragraph one");

    expect(firstParagraphLine).not.toBeNull();
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph")).toBe(false);

    controller.destroy();
  });

  it("keeps heading and paragraph decorations in the same inactive-state pipeline", () => {
    const host = document.createElement("div");
    const source = ["# Heading", "", "Paragraph one", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });

    const headingLine = getLineElementByText(host, "# Heading");
    const firstParagraphLine = getLineElementByText(host, "Paragraph one");

    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();
    expect(firstParagraphLine).not.toBeNull();
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph")).toBe(true);

    controller.destroy();
  });

  it("flushes inactive paragraph decorations once when composition ends", () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });
    expect(getLineElementByText(host, "Paragraph one")?.classList.contains("cm-inactive-paragraph")).toBe(
      true
    );

    const originalDispatch = view?.dispatch.bind(view);
    const dispatchSpy = vi.fn((spec: Parameters<NonNullable<typeof originalDispatch>>[0]) =>
      originalDispatch?.(spec)
    );

    if (view) {
      view.dispatch = dispatchSpy as unknown as typeof view.dispatch;
    }

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "x");
    view?.dispatch({
      changes: { from: source.length, insert: "x" },
      selection: { anchor: source.length + 1 }
    });

    dispatchSpy.mockClear();
    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "x");

    const decorationFlushCount = dispatchSpy.mock.calls.filter(
      ([spec]) => typeof spec === "object" && spec !== null && "effects" in spec
    ).length;

    expect(decorationFlushCount).toBe(1);
    expect(getLineElementByText(host, "Paragraph one")?.classList.contains("cm-inactive-paragraph")).toBe(
      true
    );

    controller.destroy();
  });

  it("defers paragraph active-block recomputation until composition ends", () => {
    const host = document.createElement("div");
    const source = "Paragraph";
    const activeBlockTypes: Array<string | null> = [];
    const selectionAnchors: number[] = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
        selectionAnchors.push(state.selection.anchor);
      }
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(activeBlockTypes).toEqual(["paragraph"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "你");

    view?.dispatch({
      changes: { from: source.length, insert: "你" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("Paragraph你");
    expect(activeBlockTypes).toEqual(["paragraph"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "你");

    expect(activeBlockTypes).toEqual(["paragraph", "paragraph"]);
    expect(selectionAnchors).toEqual([0, source.length + 1]);

    controller.destroy();
  });

  it("defers heading updates until composition ends without losing committed text", () => {
    const host = document.createElement("div");
    const source = "# 标题";
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(activeBlockTypes).toEqual(["heading"]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "中");

    view?.dispatch({
      changes: { from: source.length, insert: "中" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("# 标题中");
    expect(activeBlockTypes).toEqual(["heading"]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "中");

    expect(controller.getContent()).toBe("# 标题中");
    expect(activeBlockTypes).toEqual(["heading", "heading"]);

    controller.destroy();
  });

  it("flushes list active-block state once after composition ends", () => {
    const host = document.createElement("div");
    const source = "- item";
    const activeBlockTypes: Array<string | null> = [];
    const selectionAnchors: number[] = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
        selectionAnchors.push(state.selection.anchor);
      }
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(activeBlockTypes).toEqual(["list"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "测");

    view?.dispatch({
      changes: { from: source.length, insert: "试" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("- item试");
    expect(activeBlockTypes).toEqual(["list"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "试");

    expect(activeBlockTypes).toEqual(["list", "list"]);
    expect(selectionAnchors).toEqual([0, source.length + 1]);

    controller.destroy();
  });

  it("recomputes the active block when the loaded document is replaced", () => {
    const host = document.createElement("div");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "# Title",
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    controller.replaceDocument("> Quote");

    expect(activeBlockTypes).toEqual(["heading", "blockquote"]);

    controller.destroy();
  });
});
