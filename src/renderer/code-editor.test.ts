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

const getInlineDecorationCount = (line: Element | null, className: string) =>
  line?.querySelectorAll(`.${className}`).length ?? 0;

const getImagePreviews = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>(".cm-markdown-image-preview"));

const dispatchCompositionEvent = (
  target: HTMLElement,
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data = ""
) => {
  target.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
};

const flushMicrotasks = async () => {
  await Promise.resolve();
};

const getLastEditorLine = (host: HTMLElement) => {
  const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
  return lines.at(-1) ?? null;
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

  it("moves the selection and scroll target when navigateToOffset is requested", () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph"].join("\n");
    const selectionAnchors: number[] = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        selectionAnchors.push(state.selection.anchor);
      }
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    controller.navigateToOffset(source.indexOf("Paragraph"));

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("Paragraph"));
    expect(view?.state.selection.main.head).toBe(source.indexOf("Paragraph"));
    expect(selectionAnchors.at(-1)).toBe(source.indexOf("Paragraph"));

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
    expect(headingMarker?.textContent).toBe("# ");

    controller.destroy();
  });

  it("styles the first heading as inactive before the editor receives focus", () => {
    const host = document.createElement("div");
    const source = "# Title";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const headingLine = getLineElementByText(host, "# Title");
    const headingMarker = host.querySelector(".cm-inactive-heading-marker");

    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(headingLine?.classList.contains("cm-inactive-heading-depth-1")).toBe(true);
    expect(headingMarker).not.toBeNull();
    expect(headingMarker?.textContent).toBe("# ");

    controller.destroy();
  });

  it("removes inactive heading decorations when the heading becomes active again", async () => {
    const host = document.createElement("div");
    const source = ["# Title", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf("Title") } });

    const headingLine = getLineElementByText(host, "# Title");

    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(host.querySelector(".cm-inactive-heading-marker")).toBeNull();

    controller.destroy();
  });

  it("renders inline decorations for paragraph content and preserves styles when the block becomes active again", async () => {
    const host = document.createElement("div");
    const sourceLine = "**bold** *italic* `code` ~~strike~~";
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const inactiveLine = getLineElementByText(host, sourceLine);

    expect(inactiveLine).not.toBeNull();
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-marker")).toBe(8);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strong")).toBe(1);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-emphasis")).toBe(1);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-code")).toBe(1);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strikethrough")).toBe(1);

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf(sourceLine) + 2 } });

    expect(inactiveLine?.textContent).toBe(sourceLine);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-marker")).toBe(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strong")).toBeGreaterThan(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-emphasis")).toBeGreaterThan(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-code")).toBeGreaterThan(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strikethrough")).toBeGreaterThan(0);

    controller.destroy();
  });

  it("renders Markdown images as a preview when the paragraph is inactive and keeps the preview visible when the paragraph becomes active", async () => {
    const host = document.createElement("div");
    const sourceLine = "![hero](./assets/demo.png)";
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/notes/today.md",
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const inactivePreviews = getImagePreviews(host);
    const inactiveImage = inactivePreviews[0]?.querySelector("img");

    expect(inactivePreviews).toHaveLength(1);
    expect(inactivePreviews[0]?.dataset.imagePreviewMode).toBe("inactive");
    expect(inactiveImage?.getAttribute("src")).toBe(
      "yulora-asset://preview?path=D%3A%2Fnotes%2Fassets%2Fdemo.png"
    );
    expect(host.textContent).not.toContain(sourceLine);

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf(sourceLine) + 2 } });

    const activePreviews = getImagePreviews(host);

    expect(host.textContent).toContain(sourceLine);
    expect(activePreviews).toHaveLength(1);
    expect(activePreviews[0]?.dataset.imagePreviewMode).toBe("active");
    expect(activePreviews[0]?.querySelector("img")?.getAttribute("src")).toBe(
      "yulora-asset://preview?path=D%3A%2Fnotes%2Fassets%2Fdemo.png"
    );

    controller.destroy();
  });

  it("moves the cursor to the Markdown image source when the inactive preview is clicked", async () => {
    const host = document.createElement("div");
    const sourceLine = "![hero](./assets/demo.png)";
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/notes/today.md",
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const inactivePreviewImage = getImagePreviews(host)[0]?.querySelector("img");

    expect(inactivePreviewImage).toBeInstanceOf(HTMLElement);

    inactivePreviewImage?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.indexOf(sourceLine));
    expect(view?.state.selection.main.head).toBe(source.indexOf(sourceLine));
    expect(host.textContent).toContain(sourceLine);

    controller.destroy();
  });

  it("renders top-level HTML img blocks as previews and preserves zoom styling when the block becomes active", async () => {
    const host = document.createElement("div");
    const sourceLine =
      '<img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" style="zoom:25%;" />';
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/MyAgent/Yulora/Yulora/.worktrees/codex-image-render/README.md",
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const inactivePreview = getImagePreviews(host)[0];
    const inactiveImage = inactivePreview?.querySelector("img");

    expect(inactivePreview).toBeDefined();
    expect(inactivePreview?.dataset.imagePreviewMode).toBe("inactive");
    expect(inactiveImage?.getAttribute("src")).toBe(
      "yulora-asset://preview?path=D%3A%2FMyAgent%2FYulora%2FYulora%2F.worktrees%2Fcodex-image-render%2Fassets%2Fbranding%2Fyulora_logo_light.svg"
    );
    expect(inactiveImage?.style.zoom).toBe("25%");
    expect(host.textContent).not.toContain(sourceLine);

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf(sourceLine) + 2 } });

    const activePreview = getImagePreviews(host)[0];
    const activeImage = activePreview?.querySelector("img");

    expect(host.textContent).toContain(sourceLine);
    expect(activePreview?.dataset.imagePreviewMode).toBe("active");
    expect(activeImage?.style.zoom).toBe("25%");

    controller.destroy();
  });

  it("moves the cursor to the HTML image source when the active preview is clicked", async () => {
    const host = document.createElement("div");
    const sourceLine =
      '<img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" style="zoom:25%;" />';
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/MyAgent/Yulora/Yulora/.worktrees/codex-image-render/README.md",
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf(sourceLine) + 12 } });

    const activePreviewImage = getImagePreviews(host)[0]?.querySelector("img");

    expect(activePreviewImage).toBeInstanceOf(HTMLElement);

    activePreviewImage?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.indexOf(sourceLine));
    expect(view?.state.selection.main.head).toBe(source.indexOf(sourceLine));

    controller.destroy();
  });

  it("intercepts image paste, imports the clipboard image, and inserts the returned Markdown", async () => {
    const host = document.createElement("div");
    const importClipboardImage = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("![today](assets/pasted.png)");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "Paragraph",
      documentPath: "D:/notes/today.md",
      onChange: vi.fn(),
      importClipboardImage
    });

    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    advancedController.setSelection("Paragraph".length);

    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true
    });

    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [{ type: "image/png" }]
      }
    });

    editorRoot?.dispatchEvent(pasteEvent);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(importClipboardImage).toHaveBeenCalledTimes(1);
    expect(importClipboardImage).toHaveBeenCalledWith({
      documentPath: "D:/notes/today.md"
    });
    expect(controller.getContent()).toBe("Paragraph![today](assets/pasted.png)");

    controller.destroy();
  });

  it("keeps nested inline styles on inactive heading, list, and blockquote content", () => {
    const host = document.createElement("div");
    const source = [
      "# Heading with **bold**",
      "",
      "- Item with *italic*",
      "",
      "> Quote with `code`",
      "",
      "Paragraph"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const headingLine = getLineElementByText(host, "# Heading with **bold**");
    const listLine = getLineElementByText(host, "- Item with *italic*");
    const quoteLine = getLineElementByText(host, "> Quote with `code`");

    expect(headingLine).not.toBeNull();
    expect(getInlineDecorationCount(headingLine, "cm-inactive-inline-strong")).toBe(1);
    expect(getInlineDecorationCount(headingLine, "cm-inactive-inline-marker")).toBe(2);

    expect(listLine).not.toBeNull();
    expect(getInlineDecorationCount(listLine, "cm-inactive-inline-emphasis")).toBe(1);
    expect(getInlineDecorationCount(listLine, "cm-inactive-inline-marker")).toBe(2);

    expect(quoteLine).not.toBeNull();
    expect(getInlineDecorationCount(quoteLine, "cm-inactive-inline-code")).toBe(1);
    expect(getInlineDecorationCount(quoteLine, "cm-inactive-inline-marker")).toBe(2);

    controller.destroy();
  });

  it("keeps combined strong and strikethrough inline styles layered on inactive content", () => {
    const host = document.createElement("div");
    const source = ["***both***", "~~**mix**~~", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const bothLine = getLineElementByText(host, "***both***");
    const mixLine = getLineElementByText(host, "~~**mix**~~");

    expect(bothLine).not.toBeNull();
    expect(getInlineDecorationCount(bothLine, "cm-inactive-inline-strong")).toBeGreaterThanOrEqual(1);
    expect(getInlineDecorationCount(bothLine, "cm-inactive-inline-emphasis")).toBeGreaterThanOrEqual(1);
    expect(getInlineDecorationCount(bothLine, "cm-inactive-inline-marker")).toBeGreaterThanOrEqual(2);

    expect(mixLine).not.toBeNull();
    expect(getInlineDecorationCount(mixLine, "cm-inactive-inline-strong")).toBeGreaterThanOrEqual(1);
    expect(getInlineDecorationCount(mixLine, "cm-inactive-inline-strikethrough")).toBeGreaterThanOrEqual(1);
    expect(getInlineDecorationCount(mixLine, "cm-inactive-inline-marker")).toBeGreaterThanOrEqual(2);

    controller.destroy();
  });

  it("flushes inline decorations once when composition ends", () => {
    const host = document.createElement("div");
    const source = ["**bold**", "", "Paragraph"].join("\n");

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
    expect(getInlineDecorationCount(getLineElementByText(host, "**bold**"), "cm-inactive-inline-strong")).toBe(
      1
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
    expect(getInlineDecorationCount(getLineElementByText(host, "**bold**"), "cm-inactive-inline-strong")).toBe(
      1
    );

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

  it("keeps paragraph visual style consistent when it becomes active", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });
    expect(getLineElementByText(host, "Paragraph one")?.classList.contains("cm-inactive-paragraph")).toBe(
      true
    );

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph one") } });

    const firstParagraphLine = getLineElementByText(host, "Paragraph one");

    expect(firstParagraphLine).not.toBeNull();
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph")).toBe(false);
    expect(firstParagraphLine?.classList.contains("cm-active-paragraph")).toBe(true);
    expect(firstParagraphLine?.classList.contains("cm-active-paragraph-leading")).toBe(true);

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
    const headingMarker = host.querySelector(".cm-inactive-heading-marker");
    expect(headingMarker).not.toBeNull();
    expect(headingMarker?.textContent).toBe("# ");
    expect(firstParagraphLine).not.toBeNull();
    expect(firstParagraphLine?.classList.contains("cm-inactive-paragraph")).toBe(true);

    controller.destroy();
  });

  it("applies inactive list decorations when focus moves into a non-list block", () => {
    const host = document.createElement("div");
    const source = ["- one", "- [ ] todo", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const firstListLine = getLineElementByText(host, "- one");
    const taskListLine = getLineElementByText(host, "- [ ] todo");
    const listMarkers = host.querySelectorAll(".cm-inactive-list-marker");
    const taskMarkers = host.querySelectorAll(".cm-inactive-task-marker");

    expect(firstListLine).not.toBeNull();
    expect(firstListLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(firstListLine?.classList.contains("cm-inactive-list-unordered")).toBe(true);
    expect(taskListLine).not.toBeNull();
    expect(taskListLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(listMarkers.length).toBe(2);
    expect(taskMarkers.length).toBe(1);

    controller.destroy();
  });

  it("styles ordered and checked task markers distinctly in inactive lists", () => {
    const host = document.createElement("div");
    const source = ["1. first", "2. [x] done", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const firstListLine = getLineElementByText(host, "1. first");
    const checkedTaskMarker = host.querySelector(".cm-inactive-task-marker-checked");
    const checkedTaskLine = getLineElementByText(host, "2. [x] done");

    expect(firstListLine).not.toBeNull();
    expect(firstListLine?.classList.contains("cm-inactive-list-ordered")).toBe(true);
    expect(checkedTaskMarker).not.toBeNull();
    expect(checkedTaskMarker?.getAttribute("data-task-state")).toBe("checked");
    expect(checkedTaskLine?.classList.contains("cm-inactive-list-task")).toBe(true);
    expect(checkedTaskLine?.classList.contains("cm-inactive-list-task-checked")).toBe(true);

    controller.destroy();
  });

  it("applies inactive blockquote decorations when focus moves into a non-blockquote block", () => {
    const host = document.createElement("div");
    const source = ["> Quote line", "> Still quoted", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const firstQuoteLine = getLineElementByText(host, "> Quote line");
    const secondQuoteLine = getLineElementByText(host, "> Still quoted");
    const quoteMarkers = host.querySelectorAll(".cm-inactive-blockquote-marker");

    expect(firstQuoteLine).not.toBeNull();
    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote-start")).toBe(true);
    expect(secondQuoteLine).not.toBeNull();
    expect(secondQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(secondQuoteLine?.classList.contains("cm-inactive-blockquote-start")).toBe(false);
    expect(quoteMarkers.length).toBe(2);
    expect(Array.from(quoteMarkers, (marker) => marker.textContent)).toEqual([">", ">"]);

    controller.destroy();
  });

  it("keeps blockquote presentation when that blockquote becomes active again", async () => {
    const host = document.createElement("div");
    const source = ["> Quote line", "> Still quoted", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(host.querySelector(".cm-inactive-blockquote-marker")).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf("Quote line") } });

    const firstQuoteLine = getLineElementByText(host, "> Quote line");
    const secondQuoteLine = getLineElementByText(host, "> Still quoted");

    expect(firstQuoteLine).not.toBeNull();
    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote-start")).toBe(true);
    expect(secondQuoteLine).not.toBeNull();
    expect(secondQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(host.querySelectorAll(".cm-inactive-blockquote-marker")).toHaveLength(2);

    controller.destroy();
  });

  it("renders fenced code blocks as inactive code when focus moves into another block", () => {
    const host = document.createElement("div");
    const source = [
      "```ts",
      "const answer = 42;",
      "  console.log(answer);",
      "```",
      "",
      "Paragraph"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const firstCodeLine = getLineElementByText(host, "const answer = 42;");
    const secondCodeLine = getLineElementByText(host, "console.log(answer);");
    const openingFenceLine = getLineElementByText(host, "```ts");
    const closingFenceLine = getLineElementByText(host, "```");
    const fenceMarkers = host.querySelectorAll(".cm-inactive-code-block-fence-marker");

    expect(firstCodeLine).not.toBeNull();
    expect(firstCodeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(firstCodeLine?.classList.contains("cm-inactive-code-block-start")).toBe(true);
    expect(secondCodeLine).not.toBeNull();
    expect(secondCodeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(secondCodeLine?.classList.contains("cm-inactive-code-block-end")).toBe(true);
    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(closingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(fenceMarkers.length).toBe(2);

    controller.destroy();
  });

  it("restores fenced code block markdown when the opening fence becomes active again", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(
      true
    );

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: 0 } });

    const openingFenceLine = getLineElementByText(host, "```ts");
    const codeLine = getLineElementByText(host, "const answer = 42;");

    expect(openingFenceLine).not.toBeNull();
    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(false);
    expect(codeLine).not.toBeNull();
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(false);

    controller.destroy();
  });

  it("keeps fenced code block fences hidden while editing inside the code content", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.setSelection(source.indexOf("answer"));
    advancedController.insertText("updated ");

    const openingFenceLine = getLineElementByText(host, "```ts");
    const closingFenceLine = getLineElementByText(host, "```");
    const codeLine = getLineElementByText(host, "const updated answer = 42;");

    expect(controller.getContent()).toBe(["```ts", "const updated answer = 42;", "```", "", "Paragraph"].join("\n"));
    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(closingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(true);

    controller.destroy();
  });

  it("restores the whole fenced code block when the selection lands on the closing fence line", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(
      true
    );

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.lastIndexOf("```") } });

    const openingFenceLine = getLineElementByText(host, "```ts");
    const codeLine = getLineElementByText(host, "const answer = 42;");
    const closingFenceLine = getLineElementByText(host, "```");

    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(false);
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(false);
    expect(closingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(false);

    controller.destroy();
  });

  it("reveals fenced code block markdown only when the selection moves onto the fence line itself", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.setSelection(source.indexOf("answer"));

    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(true);

    advancedController.setSelection(0);

    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(false);
    expect(getLineElementByText(host, "const answer = 42;")?.classList.contains("cm-inactive-code-block")).toBe(
      false
    );

    controller.destroy();
  });

  it("keeps the fenced code block consistently inactive when the selection moves to the blank separator below it", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1 } });

    const openingFenceLine = getLineElementByText(host, "```ts");
    const codeLine = getLineElementByText(host, "const answer = 42;");
    const closingFenceLine = getLineElementByText(host, "```");

    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(closingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);

    controller.destroy();
  });

  it("renders thematic breaks as inactive separators when focus moves into another block", () => {
    const host = document.createElement("div");
    const source = ["---", "", "+++", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });

    const dashRuleLine = getLineElementByText(host, "---");
    const plusRuleLine = getLineElementByText(host, "+++");
    const ruleMarkers = host.querySelectorAll(".cm-inactive-thematic-break-marker");

    expect(dashRuleLine).not.toBeNull();
    expect(dashRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(plusRuleLine).not.toBeNull();
    expect(plusRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(ruleMarkers.length).toBe(2);

    controller.destroy();
  });

  it("restores thematic break markdown when the separator becomes active again", async () => {
    const host = document.createElement("div");
    const source = ["---", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(host.querySelector(".cm-inactive-thematic-break-marker")).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view?.dispatch({ selection: { anchor: 0 } });

    const dashRuleLine = getLineElementByText(host, "---");

    expect(dashRuleLine).not.toBeNull();
    expect(dashRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(false);
    expect(host.querySelector(".cm-inactive-thematic-break-marker")).toBeNull();

    controller.destroy();
  });

  it("keeps thematic break decorations aligned when replacing with CRLF content", () => {
    const host = document.createElement("div");
    const source = ["# Heading", "", "---", "", "+++", "", "Paragraph"].join("\r\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn()
    });

    controller.replaceDocument(source);

    const dashRuleLine = getLineElementByText(host, "---");
    const plusRuleLine = getLineElementByText(host, "+++");

    expect(dashRuleLine).not.toBeNull();
    expect(dashRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(plusRuleLine).not.toBeNull();
    expect(plusRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);

    controller.destroy();
  });

  it("renders compact plus separators as inactive thematic breaks when the caret is on adjacent text", () => {
    const host = document.createElement("div");
    const source = ["+++", "\u5206\u5272\u7EBF", "+++"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("\u5206\u5272\u7EBF") } });

    const topRuleLine = getLineElementByText(host, "+++");
    const ruleMarkers = host.querySelectorAll(".cm-inactive-thematic-break-marker");

    expect(topRuleLine).not.toBeNull();
    expect(topRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(ruleMarkers.length).toBe(2);

    controller.destroy();
  });

  it("keeps a closing frontmatter-style dash fence rendered as a separator while editing metadata text", () => {
    const host = document.createElement("div");
    const source = [
      "---",
      "name: yulora-task-intake",
      "description: skill metadata",
      "---",
      "",
      "# Heading"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("description") } });

    const ruleLines = Array.from(host.querySelectorAll(".cm-line")).filter((line) => line.textContent === "---");

    expect(ruleLines).toHaveLength(2);
    expect(ruleLines[0]?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(ruleLines[1]?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(host.querySelectorAll(".cm-inactive-thematic-break-marker")).toHaveLength(2);

    controller.destroy();
  });

  it("keeps the leading plus separator rendered after typing a trailing single dash below it", () => {
    const host = document.createElement("div");
    const source = ["+++", "\u5206\u5272\u7EBF", ""].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    advancedController.setSelection(source.indexOf("\u5206\u5272\u7EBF"));

    expect(getLineElementByText(host, "+++")?.classList.contains("cm-inactive-thematic-break")).toBe(
      true
    );

    advancedController.setSelection(source.length);
    advancedController.insertText("-");

    const topRuleLine = getLineElementByText(host, "+++");
    const bottomDashLine = getLineElementByText(host, "-");

    expect(topRuleLine).not.toBeNull();
    expect(topRuleLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);
    expect(bottomDashLine?.classList.contains("cm-inactive-thematic-break")).toBe(false);

    controller.destroy();
  });

  it("flushes inactive blockquote decorations once when composition ends", () => {
    const host = document.createElement("div");
    const source = ["> Quote line", "> Still quoted", "", "Paragraph"].join("\n");

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
    expect(host.querySelector(".cm-inactive-blockquote-marker")).not.toBeNull();

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
    expect(host.querySelector(".cm-inactive-blockquote-marker")).not.toBeNull();

    controller.destroy();
  });

  it("continues a non-empty blockquote line on Enter", () => {
    const host = document.createElement("div");
    const source = "> quote";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("> quote\n> ");

    controller.destroy();
  });

  it("does not render a blockquote until a space is typed after the marker", async () => {
    const host = document.createElement("div");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      insertText: (text: string) => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(0);
    advancedController.insertText(">");

    expect(controller.getContent()).toBe(">");
    expect(host.querySelector(".cm-inactive-blockquote")).toBeNull();
    expect(host.querySelector(".cm-inactive-blockquote-marker")).toBeNull();

    advancedController.insertText(" ");

    expect(controller.getContent()).toBe("> ");
    expect(host.querySelector(".cm-inactive-blockquote")).not.toBeNull();
    expect(host.querySelector(".cm-inactive-blockquote-marker")).not.toBeNull();

    controller.destroy();
  });

  it("exits an empty blockquote line on Enter", () => {
    const host = document.createElement("div");
    const source = ["> quote", "> "].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("> quote\n");

    controller.destroy();
  });

  it("continues a non-empty task list item on Enter", () => {
    const host = document.createElement("div");
    const source = "- [ ] todo";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    expect(typeof advancedController.setSelection).toBe("function");
    expect(typeof advancedController.pressEnter).toBe("function");

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("- [ ] todo\n- [ ] ");

    controller.destroy();
  });

  it("auto-completes a fenced code block when pressing Enter after triple backticks", () => {
    const host = document.createElement("div");
    const source = "```";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("```\n\n```");

    controller.destroy();
  });

  it("keeps the info string and inserts subsequent text inside the new fenced code block", () => {
    const host = document.createElement("div");
    const source = "```ts";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    controller.insertText("const answer = 42;");

    expect(controller.getContent()).toBe("```ts\nconst answer = 42;\n```");

    controller.destroy();
  });

  it("keeps the code block presentation while placing the caret at the end of the last code line when Backspace is pressed from the separator below it", async () => {
    const host = document.createElement("div");
    const source = ["```ts", "const answer = 42;", "```", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const editorRoot = host.querySelector(".cm-editor");
    const view = getEditorView(host);

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("\n\n") + 1);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    expect(host.querySelector(".cm-inactive-code-block-fence")).not.toBeNull();

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("const answer = 42;") + 18);
    expect(host.querySelector(".cm-inactive-code-block")).not.toBeNull();
    expect(host.querySelector(".cm-inactive-code-block-fence")).not.toBeNull();

    controller.destroy();
  });

  it("deletes code content directly while keeping the code block presentation when Backspace is pressed twice from below a fenced code block", async () => {
    const host = document.createElement("div");
    const source = ["```", "code block", "```", ""].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const editorRoot = host.querySelector(".cm-editor");
    const view = getEditorView(host);

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.pressBackspace();
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("code block") + 10);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(["```", "code bloc", "```", ""].join("\n"));
    expect(host.querySelector(".cm-inactive-code-block")).not.toBeNull();
    expect(host.querySelector(".cm-inactive-code-block-fence")).not.toBeNull();
    expect(getLineElementByText(host, "code bloc")).not.toBeNull();

    controller.destroy();
  });

  it("keeps blockquote presentation when Backspace is pressed at a later line start", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph", "", "> quote one", "> quote two", "After blockquote"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    advancedController.setSelection(source.indexOf("> quote two"));
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("> quote two") - 1);
    expect(host.querySelector(".cm-inactive-blockquote")).not.toBeNull();
    expect(host.querySelectorAll(".cm-inactive-blockquote-marker")).toHaveLength(2);

    controller.destroy();
  });

  it("allows leaving a blockquote when Backspace is pressed from the first line start", () => {
    const host = document.createElement("div");
    const source = ["Paragraph", "", "> quote one", "> quote two", "After blockquote"].join("\n");
    const quoteOpenOffset = source.indexOf("> quote one");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const expected = `${source.slice(0, quoteOpenOffset - 1)}${source.slice(quoteOpenOffset)}`;

    expect(view).not.toBeNull();

    advancedController.setSelection(quoteOpenOffset);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(quoteOpenOffset - 1);

    controller.destroy();
  });

  it("increments ordered list markers on Enter", () => {
    const host = document.createElement("div");
    const source = "2. next";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    expect(typeof advancedController.setSelection).toBe("function");
    expect(typeof advancedController.pressEnter).toBe("function");

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("2. next\n3. ");

    controller.destroy();
  });

  it("exits an empty nested list item on Enter", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - "].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    expect(typeof advancedController.setSelection).toBe("function");
    expect(typeof advancedController.pressEnter).toBe("function");

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("- parent\n");

    controller.destroy();
  });

  it("indents the current list item subtree into a child list when Tab is pressed", () => {
    const host = document.createElement("div");
    const source = ["- parent", "- child", "  continuation", "  - nested", "- sibling"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressTab: () => void;
    };

    advancedController.setSelection(source.indexOf("child"));
    advancedController.pressTab();

    expect(controller.getContent()).toBe(
      ["- parent", "  - child", "    continuation", "    - nested", "- sibling"].join("\n")
    );

    controller.destroy();
  });

  it("does not indent the first list item when Tab is pressed", () => {
    const host = document.createElement("div");
    const source = ["- parent", "- child"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressTab: () => void;
    };

    advancedController.setSelection(source.indexOf("parent"));
    advancedController.pressTab();

    expect(controller.getContent()).toBe(source);

    controller.destroy();
  });

  it("removes the trailing newline when exiting an empty task item at EOF", () => {
    const host = document.createElement("div");
    const source = "- [ ] todo\n- [ ] \n";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(17);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("- [ ] todo\n");

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

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "x");

    view?.dispatch({
      changes: { from: source.length, insert: "x" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("Paragraphx");
    expect(activeBlockTypes).toEqual(["paragraph"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "x");

    expect(activeBlockTypes).toEqual(["paragraph", "paragraph"]);
    expect(selectionAnchors).toEqual([0, source.length + 1]);

    controller.destroy();
  });

  it("defers heading updates until composition ends without losing committed text", () => {
    const host = document.createElement("div");
    const source = "# Title";
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

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "x");

    view?.dispatch({
      changes: { from: source.length, insert: "x" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("# Titlex");
    expect(activeBlockTypes).toEqual(["heading"]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "x");

    expect(controller.getContent()).toBe("# Titlex");
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

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionstart", "x");

    view?.dispatch({
      changes: { from: source.length, insert: "x" },
      selection: { anchor: source.length + 1 }
    });

    expect(controller.getContent()).toBe("- itemx");
    expect(activeBlockTypes).toEqual(["list"]);
    expect(selectionAnchors).toEqual([0]);

    dispatchCompositionEvent(editorRoot as HTMLElement, "compositionend", "x");

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

  it("keeps heading, blockquote, and list decorations aligned when replacing with CRLF content", () => {
    const host = document.createElement("div");
    const source = [
      "# MVP Backlog",
      "",
      "> Project summary",
      "",
      "## Usage Rules",
      "",
      "- Only advance one `TASK` at a time",
      "",
      "Paragraph"
    ].join("\r\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn()
    });

    controller.replaceDocument(source);

    const quoteLine = getLineElementByText(host, "Project summary");
    const secondHeadingLine = getLineElementByText(host, "Usage Rules");
    const listLine = getLineElementByText(host, "Only advance one");

    expect(quoteLine).not.toBeNull();
    expect(quoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(secondHeadingLine).not.toBeNull();
    expect(secondHeadingLine?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(secondHeadingLine?.classList.contains("cm-inactive-heading-depth-2")).toBe(true);
    expect(listLine).not.toBeNull();
    expect(listLine?.classList.contains("cm-inactive-list")).toBe(true);

    controller.destroy();
  });

  it("toggles strong via Mod-b without breaking onChange propagation", () => {
    const host = document.createElement("div");
    const onChange = vi.fn();
    const controller = createCodeEditorController({
      parent: host,
      initialContent: "alpha bold beta",
      onChange
    });

    const view = getEditorView(host);
    expect(view).not.toBeNull();

    view!.dispatch({ selection: { anchor: 6, head: 10 } });

    view!.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        code: "KeyB",
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );

    expect(controller.getContent()).toBe("alpha **bold** beta");
    expect(onChange).toHaveBeenCalledWith("alpha **bold** beta");

    controller.destroy();
  });

  it("renders a table block as a widget instead of raw markdown lines", () => {
    const host = document.createElement("div");
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const tableWidget = host.querySelector(".cm-table-widget");
    const firstCellInput = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');
    const rawLine = getLineElementByText(host, "| name | qty |");

    expect(tableWidget).not.toBeNull();
    expect(firstCellInput?.value).toBe("name");
    expect(rawLine).toBeNull();

    controller.destroy();
  });

  it("renders loose headerless pipe rows as a table widget", () => {
    const host = document.createElement("div");
    const source = [
      "| 2026-04-19 | TASK-table-rendering | 通过 |",
      "",
      "| 2026-04-18 | TASK-041 | 通过 |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const tableWidget = host.querySelector(".cm-table-widget");
    const firstCellInput = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');
    const secondRowCellInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');
    const rawLine = getLineElementByText(host, "| 2026-04-19 | TASK-table-rendering | 通过 |");

    expect(tableWidget).not.toBeNull();
    expect(firstCellInput?.value).toBe("2026-04-19");
    expect(secondRowCellInput?.value).toBe("TASK-041");
    expect(rawLine).toBeNull();

    controller.destroy();
  });

  it("renders contiguous loose headerless pipe rows as a single table widget", () => {
    const host = document.createElement("div");
    const source = [
      "| 2026-04-17 | TASK-038 | 通过 |",
      "| 2026-04-18 | TASK-041 | 通过 |",
      "| 2026-04-19 | TASK-table-rendering | 通过 |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const tableWidget = host.querySelector(".cm-table-widget");
    const thirdRowCellInput = host.querySelector<HTMLInputElement>('[data-table-cell="2:1"]');
    const rawLine = getLineElementByText(host, "| 2026-04-17 | TASK-038 | 通过 |");

    expect(tableWidget).not.toBeNull();
    expect(thirdRowCellInput?.value).toBe("TASK-table-rendering");
    expect(rawLine).toBeNull();

    controller.destroy();
  });

  it("preserves the clicked caret offset while entering table editing context", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pencil | 20 |"].join("\n");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLInputElement);

    input!.focus();
    input!.setSelectionRange(3, 3);
    input!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(activeBlockTypes.at(-1)).toBe("table");
    expect(document.activeElement).toBe(currentInput);
    expect(currentInput?.selectionStart).toBe(3);
    expect(currentInput?.selectionEnd).toBe(3);

    controller.destroy();
    host.remove();
  });

  it("materializes a draft pipe-table header into a full table on Enter", () => {
    const host = document.createElement("div");
    const source = "| a | b | c |";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(
      ["| a | b | c |", "| :--- | :--- | :--- |", "|   |   |   |"].join("\n")
    );
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();

    controller.destroy();
  });

  it("allows clicking a table cell input and typing to update the cell", async () => {
    const host = document.createElement("div");
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLInputElement);

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    input!.value = "pencil";
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(
      ["| name   | qty |", "| :----- | ---: |", "| pencil |   2 |"].join("\n")
    );

    controller.destroy();
  });

  it("moves the active block into the table when a cell is clicked from another block", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(activeBlockTypes.at(-1)).toBe("paragraph");

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe("table");

    controller.destroy();
  });

  it("supports table keyboard actions after entering the table from another block", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLInputElement);

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();

    input?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );
    await flushMicrotasks();

    expect(controller.getContent()).toBe(
      [
        "Paragraph",
        "",
        "| name | qty |",
        "| :--- | ---: |",
        "| pen  |   2 |",
        "|      |     |"
      ].join("\n")
    );

    controller.destroy();
  });

  it("moves between table rows and exits to the next line on Enter from the last row", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Paragraph",
      "",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
      "| ink | 3 |",
      "",
      "After"
    ].join("\n");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="2:1"]');
    expect(activeBlockTypes.at(-1)).toBe("table");
    expect(document.activeElement).toBe(currentInput);

    currentInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe(null);
    expect(document.activeElement).not.toBe(currentInput);
    expect(controller.getContent()).toBe(source);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(source.lastIndexOf("\n\n") + 1);
    expect(controller.getContent().indexOf("After")).toBeGreaterThan(0);

    controller.destroy();
    host.remove();
  });

  it("creates a new line after the table when Enter exits from the last row at document end", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`${source}\n`);
    expect(document.activeElement).not.toBe(input);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(controller.getContent().length);

    controller.destroy();
    host.remove();
  });

  it("exits to the line above when ArrowUp is pressed from the first table row", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:1"]');

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe(null);
    expect(document.activeElement).not.toBe(input);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(source.indexOf("\n\n") + 1);

    controller.destroy();
    host.remove();
  });

  it("enters the first cell when ArrowDown is pressed from the line above the table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
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

    expect(view).not.toBeNull();

    view!.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1 } });
    view!.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');

    expect(activeBlockTypes.at(-1)).toBe("table");
    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe(0);

    controller.destroy();
    host.remove();
  });

  it("enters the last table row when ArrowUp is pressed from the line below the table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "", "After"].join("\n");
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

    expect(view).not.toBeNull();

    view!.dispatch({ selection: { anchor: source.lastIndexOf("\n\n") + 1 } });
    view!.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        code: "ArrowUp",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(activeBlockTypes.at(-1)).toBe("table");
    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe(0);

    controller.destroy();
    host.remove();
  });

  it("creates a new line above the table when ArrowUp exits from the first row at document start", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`\n${source}`);
    expect(document.activeElement).not.toBe(input);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(0);

    controller.destroy();
    host.remove();
  });

  it("clears the table cell highlight when ArrowUp exits from the first table row", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    const highlightedCell = host
      .querySelector<HTMLInputElement>('[data-table-cell="0:0"]')
      ?.closest<HTMLElement>(".cm-table-widget-cell");

    expect(document.activeElement).not.toBe(input);
    expect(highlightedCell?.dataset.active).toBe("false");

    controller.destroy();
    host.remove();
  });

  it("returns focus to CodeMirror when the selection moves out of a table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "", "After"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(view).not.toBeNull();

    input?.focus();
    view!.dispatch({ selection: { anchor: source.indexOf("After"), head: source.indexOf("After") } });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(document.activeElement).not.toBe(input);

    controller.destroy();
    host.remove();
  });

  it("does not highlight a table cell when the selection is only on the adjacent line above the table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view!.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1, head: source.indexOf("\n\n") + 1 } });
    await flushMicrotasks();

    const highlightedCell = host.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');

    expect(highlightedCell).toBeNull();

    controller.destroy();
    host.remove();
  });

  it("moves focus and selection out of the table when the blank line below it is clicked", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| header | column |", "| :--- | :--- |", "| 11 | 22 |", ""].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const blankLine = getLastEditorLine(host);
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(blankLine).not.toBeNull();
    expect(view).not.toBeNull();

    input?.focus();
    blankLine?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(document.activeElement).not.toBe(input);
    expect(view!.state.selection.main.anchor).toBe(source.length);

    controller.destroy();
    host.remove();
  });

  it("does not move the cursor when clicking the blank area beside a table block", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| header | column |", "| :--- | :--- |", "| 11 | 22 |", ""].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const content = host.querySelector<HTMLElement>(".cm-content");
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(content).not.toBeNull();
    expect(view).not.toBeNull();

    input?.focus();
    input?.setSelectionRange(1, 1);
    const initialAnchor = view!.state.selection.main.anchor;

    content?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    content?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    content?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(view!.state.selection.main.anchor).toBe(initialAnchor);
    expect(document.activeElement).toBe(input);

    controller.destroy();
    host.remove();
  });

  it("inserts plain text below the table after clicking the blank line below it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| header | column |", "| :--- | :--- |", "| 11 | 22 |", ""].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const blankLine = getLastEditorLine(host);

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(blankLine).not.toBeNull();

    input?.focus();
    blankLine?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    controller.insertText("abc");

    expect(controller.getContent()).toBe(`${source}abc`);

    controller.destroy();
    host.remove();
  });

  it("enters the last table row instead of skipping above the table when ArrowUp is pressed from the line below it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "1. 内容",
      "2. 内容",
      "3. 内容",
      "4. ",
      "",
      "---",
      "",
      "| header | contentv | column |",
      "| :--- | :--- | :--- |",
      "| 11 | 嘿嘿 | |",
      ""
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const blankLine = getLastEditorLine(host);
    const view = getEditorView(host);

    expect(currentInput).toBeInstanceOf(HTMLInputElement);
    expect(blankLine).not.toBeNull();
    expect(view).not.toBeNull();

    currentInput?.focus();
    blankLine?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    blankLine?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    view!.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        code: "ArrowUp",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();
    await flushMicrotasks();

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe(0);

    controller.destroy();
    host.remove();
  });

  it("uses horizontal arrow keys to leave a cell only when the caret reaches the boundary", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    input?.focus();
    input?.setSelectionRange(1, 1);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    let currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    expect(document.activeElement).toBe(currentInput);
    expect(currentInput?.selectionStart).toBe(1);

    currentInput?.setSelectionRange(0, 0);
    currentInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", bubbles: true, cancelable: true }));
    await flushMicrotasks();

    currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="0:1"]');
    expect(document.activeElement).toBe(currentInput);

    controller.destroy();
    host.remove();
  });

  it("does not re-enter a selection loop when browser focus is restored to a clicked table cell", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const activeBlockTypes: Array<string | null> = [];
    const originalGetClientRects = Range.prototype.getClientRects;
    const originalFocus = HTMLInputElement.prototype.focus;

    Range.prototype.getClientRects = function getClientRects() {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* iterator() {}
      } as unknown as DOMRectList;
    };

    HTMLInputElement.prototype.focus = function focusPatched(this: HTMLInputElement) {
      this.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
      this.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    };

    try {
      const controller = createCodeEditorController({
        parent: host,
        initialContent: source,
        onChange: vi.fn(),
        onActiveBlockChange: (state) => {
          activeBlockTypes.push(state.activeBlock?.type ?? null);
        }
      });

      const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

      input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await flushMicrotasks();
      await flushMicrotasks();

      expect(activeBlockTypes.at(-1)).toBe("table");
      expect(activeBlockTypes.filter((type) => type === "table").length).toBeLessThanOrEqual(2);

      controller.destroy();
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
      HTMLInputElement.prototype.focus = originalFocus;
    }
  });

  it("keeps the table widget visible when it follows a thematic break", () => {
    const host = document.createElement("div");
    const source = ["---", "| table | header | column |", "| :--- | :--- | :--- |", "| ... | ... | ... |"].join(
      "\n"
    );

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    expect(host.querySelector(".cm-inactive-thematic-break")).not.toBeNull();
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]')?.value).toBe("table");

    controller.destroy();
  });

  it("rewrites canonical markdown after a direct cell edit", () => {
    const host = document.createElement("div");
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    controller.editTableCell({
      row: 1,
      column: 1,
      text: "20"
    });

    expect(controller.getContent()).toBe(
      ["| name | qty |", "| :--- | ---: |", "| pen  |  20 |"].join("\n")
    );

    controller.destroy();
  });

  it("keeps table rendering intact after inserting a column", () => {
    const host = document.createElement("div");
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    controller.insertTableColumnRight();

    expect(controller.getContent()).toBe(
      ["| name |   | qty |", "| :--- | :--- | ---: |", "| pen  |   |   2 |"].join("\n")
    );
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();
    expect(host.querySelectorAll("[data-table-cell]").length).toBe(6);

    controller.destroy();
  });
});
