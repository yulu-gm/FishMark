// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EditorView } from "@codemirror/view";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCodeEditorController } from "./code-editor";

const getEditorView = (host: HTMLElement) => {
  const editorRoot = host.querySelector(".cm-editor");

  expect(editorRoot).not.toBeNull();

  return editorRoot instanceof HTMLElement ? EditorView.findFromDOM(editorRoot) : null;
};

const getLineElementByText = (host: HTMLElement, text: string) => {
  const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
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

const dispatchEditorKeydown = (
  view: EditorView | null,
  key: string,
  options: Pick<KeyboardEventInit, "altKey" | "ctrlKey" | "metaKey" | "shiftKey"> = {}
) => {
  view?.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }));
};

const flushMicrotasks = async () => {
  await Promise.resolve();
};

const setDomCaret = (editor: HTMLElement, offset: number) => {
  const selection = editor.ownerDocument.getSelection();
  const range = editor.ownerDocument.createRange();
  const textNode = editor.firstChild;

  if (!selection) {
    return;
  }

  if (textNode?.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, Math.max(0, Math.min(offset, textNode.textContent?.length ?? 0)));
  } else {
    range.setStart(editor, Math.max(0, Math.min(offset, editor.childNodes.length)));
  }

  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const createDomRect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({})
  }) as DOMRect;

const getLastEditorLine = (host: HTMLElement) => {
  const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
  return lines.at(-1) ?? null;
};

const installPatchedRangeClientRects = () => {
  const originalDescriptor = typeof Range === "undefined"
    ? null
    : Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");

  if (typeof Range === "undefined" || originalDescriptor?.value) {
    return null;
  }
  const emptyRectList = {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterator() {}
  } as unknown as DOMRectList;

  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: (() => emptyRectList) as unknown as typeof Range.prototype.getClientRects,
    writable: true
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(Range.prototype, "getClientRects", originalDescriptor);
    } else {
      delete (Range.prototype as Partial<Range>).getClientRects;
    }
  };
};

const getLineStartOffset = (source: string, lineNumber: number) => {
  if (lineNumber <= 1) {
    return 0;
  }

  let currentLine = 1;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") {
      continue;
    }

    currentLine += 1;

    if (currentLine === lineNumber) {
      return index + 1;
    }
  }

  return source.length;
};

const complexEditorFixtureSource = readFileSync(
  resolve(process.cwd(), "fixtures/test-harness/complex-editor-navigation.md"),
  "utf8"
).replace(/\r\n/g, "\n");

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
      "fishmark-asset://preview?path=D%3A%2Fnotes%2Fassets%2Fdemo.png"
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
      "fishmark-asset://preview?path=D%3A%2Fnotes%2Fassets%2Fdemo.png"
    );

    controller.destroy();
  });

  it("forwards inactive Markdown link Mod-clicks to the external link opener", () => {
    const host = document.createElement("div");
    const sourceLine = "[FishMark](https://fishmark.app)";
    const source = [sourceLine, "", "Paragraph"].join("\n");
    const openExternalLink = vi.fn();

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      openExternalLink
    } as Parameters<typeof createCodeEditorController>[0] & {
      openExternalLink: (href: string) => void;
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    const inactiveLink = host.querySelector<HTMLElement>(".cm-inactive-inline-link");

    expect(inactiveLink).toBeInstanceOf(HTMLElement);

    inactiveLink?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );

    expect(openExternalLink).toHaveBeenCalledWith("https://fishmark.app");

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
      '<img src="assets/branding/fishmark_logo_light.svg" alt="FishMark logo" style="zoom:25%;" />';
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/MyAgent/FishMark/FishMark/.worktrees/codex-image-render/README.md",
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
      "fishmark-asset://preview?path=D%3A%2FMyAgent%2FFishMark%2FFishMark%2F.worktrees%2Fcodex-image-render%2Fassets%2Fbranding%2Ffishmark_logo_light.svg"
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
      '<img src="assets/branding/fishmark_logo_light.svg" alt="FishMark logo" style="zoom:25%;" />';
    const source = [sourceLine, "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      documentPath: "D:/MyAgent/FishMark/FishMark/.worktrees/codex-image-render/README.md",
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

  it("keeps inline hard break source visible while rendering a visual break in active paragraphs", async () => {
    const host = document.createElement("div");
    const source = "Alpha<br>Beta";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    view?.dispatch({ selection: { anchor: source.indexOf("<br>") } });

    const activeLine = getLineElementByText(host, "Alpha<br>Beta");

    expect(activeLine).not.toBeNull();
    expect(activeLine?.classList.contains("cm-active-paragraph")).toBe(true);
    expect(activeLine?.querySelector("br")).not.toBeNull();

    controller.destroy();
  });

  it("keeps structural blank separators collapsed and unreachable while editing", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const blankLineStart = source.indexOf("\n\n") + 1;
    const previousBlockEnd = "Paragraph one".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });

    const blankLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ""
    );

    expect(blankLine).not.toBeNull();
    expect(blankLine?.classList.contains("cm-inactive-blank-line")).toBe(true);

    host.querySelector(".cm-editor")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    view?.dispatch({ selection: { anchor: blankLineStart } });
    await flushMicrotasks();

    const activeBlankLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ""
    );

    expect(activeBlankLine).not.toBeNull();
    expect(activeBlankLine?.classList.contains("cm-inactive-blank-line")).toBe(true);
    expect(view?.state.selection.main.anchor).toBe(previousBlockEnd);

    controller.destroy();
  });

  it("keeps extra blank rows visible when a paragraph gap contains multiple blank lines", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph two") } });
    await flushMicrotasks();

    const blankLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === ""
    );

    expect(blankLines).toHaveLength(2);
    expect(blankLines[0]?.classList.contains("cm-inactive-blank-line")).toBe(true);
    expect(blankLines[1]?.classList.contains("cm-inactive-blank-line")).toBe(false);

    controller.destroy();
  });

  it("skips the collapsed structural blank row on ArrowDown from the previous block", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const blankLineStart = source.indexOf("\n\n") + 1;
    const nextBlockStart = source.indexOf("Paragraph two");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    controller.setSelection("Paragraph one".length);
    controller.pressArrowDown();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(nextBlockStart);
    expect(view?.state.selection.main.anchor).not.toBe(blankLineStart);

    controller.destroy();
  });

  it("lands on the visible extra blank row on ArrowDown when a gap has multiple blank lines", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");
    const hiddenBlankLineStart = source.indexOf("\n\n\n") + 1;
    const visibleExtraBlankLineStart = hiddenBlankLineStart + 1;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    controller.setSelection("Paragraph one".length);
    controller.pressArrowDown();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(visibleExtraBlankLineStart);
    expect(view?.state.selection.main.anchor).not.toBe(hiddenBlankLineStart);

    controller.destroy();
  });

  it("lands on the visible extra blank row on ArrowUp when a gap has multiple blank lines", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");
    const hiddenBlankLineStart = source.indexOf("\n\n\n") + 1;
    const visibleExtraBlankLineStart = hiddenBlankLineStart + 1;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    controller.setSelection(source.indexOf("Paragraph two"));
    controller.pressArrowUp();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(visibleExtraBlankLineStart);
    expect(view?.state.selection.main.anchor).not.toBe(hiddenBlankLineStart);

    controller.destroy();
  });

  it("skips only the collapsed separator above a visible extra blank row on ArrowUp", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");
    const hiddenBlankLineStart = source.indexOf("\n\n\n") + 1;
    const visibleExtraBlankLineStart = hiddenBlankLineStart + 1;
    const previousBlockEnd = "Paragraph one".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    controller.setSelection(visibleExtraBlankLineStart);
    controller.pressArrowUp();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(previousBlockEnd);
    expect(view?.state.selection.main.anchor).not.toBe(hiddenBlankLineStart);

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
    const taskListLine = getLineElementByText(host, "todo");
    const listMarkers = host.querySelectorAll(".cm-inactive-list-marker");
    const taskMarkers = host.querySelectorAll(".cm-inactive-task-marker");

    expect(firstListLine).not.toBeNull();
    expect(firstListLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(firstListLine?.classList.contains("cm-inactive-list-unordered")).toBe(true);
    expect(taskListLine).not.toBeNull();
    expect(taskListLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(listMarkers.length).toBe(2);
    expect(taskMarkers.length).toBe(1);
    expect(taskMarkers[0]?.querySelector(".cm-inactive-task-marker-box")).not.toBeNull();

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
    const checkedTaskLine = getLineElementByText(host, "done");

    expect(firstListLine).not.toBeNull();
    expect(firstListLine?.classList.contains("cm-inactive-list-ordered")).toBe(true);
    expect(checkedTaskMarker).not.toBeNull();
    expect(checkedTaskMarker?.getAttribute("data-task-state")).toBe("checked");
    expect(checkedTaskMarker?.querySelector(".cm-inactive-task-marker-box")).not.toBeNull();
    expect(checkedTaskMarker?.querySelector(".cm-inactive-task-marker-check")).not.toBeNull();
    expect(checkedTaskLine?.classList.contains("cm-inactive-list-task")).toBe(true);
    expect(checkedTaskLine?.classList.contains("cm-inactive-list-task-checked")).toBe(true);

    controller.destroy();
  });

  it("applies active list line classes without hiding source markers while editing a list item", async () => {
    const host = document.createElement("div");
    const source = [
      "- 222222222222222222222222222222222222",
      "  - child item",
      "continued child item"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view?.dispatch({ selection: { anchor: source.indexOf("2222") } });
    await flushMicrotasks();

    const activeListLine = getLineElementByText(host, "- 222222");

    expect(activeListLine).not.toBeNull();
    expect(activeListLine?.classList.contains("cm-active-list")).toBe(true);
    expect(activeListLine?.classList.contains("cm-active-list-unordered")).toBe(true);
    expect(activeListLine?.classList.contains("cm-active-list-depth-0")).toBe(true);
    expect(activeListLine?.style.getPropertyValue("--fishmark-list-source-prefix-offset")).toBe(
      "0em"
    );
    expect(activeListLine?.querySelector(".cm-inactive-list-marker")).toBeNull();
    expect(activeListLine?.querySelector(".cm-active-list-source-prefix")?.textContent).toBe(" ");
    expect(activeListLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");

    view?.dispatch({ selection: { anchor: source.indexOf("child") } });
    await flushMicrotasks();

    const activeChildListLine = getLineElementByText(host, "- child item");

    expect(activeChildListLine).not.toBeNull();
    expect(activeChildListLine?.classList.contains("cm-active-list")).toBe(true);
    expect(activeChildListLine?.classList.contains("cm-active-list-unordered")).toBe(true);
    expect(activeChildListLine?.classList.contains("cm-active-list-depth-1")).toBe(true);
    expect(activeChildListLine?.style.getPropertyValue("--fishmark-list-source-prefix-offset")).toBe(
      "0em"
    );
    expect(activeChildListLine?.querySelector(".cm-active-list-source-prefix")?.textContent).toBe("  ");
    expect(activeChildListLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");

    view?.dispatch({ selection: { anchor: source.indexOf("continued") } });
    await flushMicrotasks();

    const activeContinuationLine = getLineElementByText(host, "continued child item");

    expect(activeContinuationLine).not.toBeNull();
    expect(activeContinuationLine?.classList.contains("cm-active-list-continuation")).toBe(true);
    expect(activeContinuationLine?.classList.contains("cm-active-list-depth-1")).toBe(true);
    expect(activeContinuationLine?.style.getPropertyValue("--fishmark-list-source-prefix-offset")).toBe("0em");

    view?.dispatch({ selection: { anchor: 0 } });
    await flushMicrotasks();

    const inactiveContinuationLine = getLineElementByText(host, "continued child item");
    const inactiveChildListLine = getLineElementByText(host, "- child item");

    expect(inactiveChildListLine).not.toBeNull();
    expect(inactiveChildListLine?.querySelector(".cm-inactive-list-marker")).not.toBeNull();
    expect(inactiveChildListLine?.querySelectorAll(".cm-inactive-list-source-prefix")).toHaveLength(2);
    expect(inactiveContinuationLine).not.toBeNull();
    expect(inactiveContinuationLine?.classList.contains("cm-inactive-list-continuation")).toBe(true);
    expect(inactiveContinuationLine?.classList.contains("cm-inactive-list-depth-1")).toBe(true);
    expect(inactiveContinuationLine?.style.getPropertyValue("--fishmark-list-source-prefix-offset")).toBe("0ch");

    controller.destroy();
  });

  it("keeps a paragraph line stable when starting a trailing dash list item", async () => {
    const host = document.createElement("div");
    const source = ["- 2", "  - child", "", "wwww", "-"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view?.dispatch({ selection: { anchor: source.length } });
    await flushMicrotasks();

    const paragraphLine = getLineElementByText(host, "wwww");
    const dashLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "-"
    );

    expect(paragraphLine).not.toBeNull();
    expect(paragraphLine?.classList.contains("cm-inactive-paragraph")).toBe(true);
    expect(paragraphLine?.classList.contains("cm-inactive-list-continuation")).toBe(false);
    expect(paragraphLine?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(dashLine).not.toBeNull();
    expect(dashLine?.classList.contains("cm-active-list")).toBe(true);
    expect(dashLine?.style.getPropertyValue("--fishmark-list-source-prefix-offset")).toBe(
      "0em"
    );
    expect(dashLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");

    controller.destroy();
  });

  it("moves the cursor to a list item content start when its left padding is clicked", async () => {
    const host = document.createElement("div");
    const source = ["- one", "- [ ] todo", "", "Paragraph"].join("\n");

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
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    const listLine = getLineElementByText(host, "todo");

    expect(listLine).toBeInstanceOf(HTMLElement);

    if (listLine instanceof HTMLElement) {
      listLine.style.paddingLeft = "20px";
      listLine.getBoundingClientRect = () => createDomRect(0, 100, 320, 32);
      listLine.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: 8,
          clientY: 112
        })
      );
    }

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("todo"));

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
    expect(Array.from(quoteMarkers, (marker) => marker.textContent)).toEqual(["> ", "> "]);

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

  it("moves the cursor to a blockquote line content start when its left padding is clicked", async () => {
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
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    const quoteLine = getLineElementByText(host, "> Quote line");

    expect(quoteLine).toBeInstanceOf(HTMLElement);

    if (quoteLine instanceof HTMLElement) {
      quoteLine.style.paddingLeft = "18px";
      quoteLine.getBoundingClientRect = () => createDomRect(0, 100, 320, 32);
      quoteLine.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: 6,
          clientY: 112
        })
      );
    }

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("Quote line"));

    controller.destroy();
  });

  it("enters the last visible blockquote line instead of its hidden marker when ArrowUp crosses a hidden separator", async () => {
    const host = document.createElement("div");
    const source = ["> Quote line", "> Still quoted", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);
    const expectedAnchor = source.indexOf("Still quoted");

    expect(view).not.toBeNull();

    view?.dispatch({
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      }
    });

    dispatchEditorKeydown(view, "ArrowUp");

    expect(view?.state.selection.main.anchor).toBe(expectedAnchor);

    controller.destroy();
  });

  it("normalizes blockquote inline code edge selections away from hidden backtick markers", async () => {
    const host = document.createElement("div");
    const source = ["> ``inline``", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const openMarkerStart = source.indexOf("``inline``");
    const openMarkerEnd = openMarkerStart + 2;
    const closeMarkerStart = source.indexOf("``", openMarkerEnd + "inline".length);

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(openMarkerStart + 1);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(openMarkerEnd);

    advancedController.setSelection(closeMarkerStart + 1);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(closeMarkerStart);

    controller.destroy();
  });

  it("normalizes list strikethrough edge selections away from hidden closing markers", async () => {
    const host = document.createElement("div");
    const source = ["- ~~todo~~", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const closeMarkerStart = source.lastIndexOf("~~");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(closeMarkerStart + 1);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(closeMarkerStart);

    controller.destroy();
  });

  it("normalizes paragraph and heading hidden markers away from invisible cursor positions", async () => {
    const host = document.createElement("div");
    const source = [
      "**Bold**",
      "Normal",
      "*斜体*",
      "## **加粗标题**",
      "## 正常标题",
      "## ***加粗倾斜标题***"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const strongOpenMarker = source.indexOf("**Bold**");
    const emphasisOpenMarker = source.indexOf("*斜体*");
    const headingMarker = source.indexOf("## **加粗标题**");
    const headingStrongOpenMarker = source.indexOf("**加粗标题**");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(strongOpenMarker + 1);
    await flushMicrotasks();
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("Bold"));

    advancedController.setSelection(emphasisOpenMarker);
    await flushMicrotasks();
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("斜体"));

    advancedController.setSelection(headingMarker + 1);
    await flushMicrotasks();
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("加粗标题"));

    advancedController.setSelection(headingStrongOpenMarker + 1);
    await flushMicrotasks();
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("加粗标题"));

    controller.destroy();
  });

  it("reactivates a heading line after hidden marker normalization moves the cursor into visible heading content", async () => {
    const host = document.createElement("div");
    const source = ["## **加粗标题**", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const headingLine = () => getLineElementByText(host, "加粗标题");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(headingLine()?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("## **加粗标题**") + 1);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("加粗标题"));
    expect(headingLine()?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(host.querySelector(".cm-inactive-heading-marker")).toBeNull();

    controller.destroy();
  });

  it("reactivates inline-code and strikethrough paragraph lines after hidden marker normalization", async () => {
    const host = document.createElement("div");
    const source = ["`内联代码`", "~~todo~~", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const codeLine = () => getLineElementByText(host, "`内联代码`");
    const strikeLine = () => getLineElementByText(host, "~~todo~~");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    view?.dispatch({ selection: { anchor: source.indexOf("Paragraph") } });
    expect(getInlineDecorationCount(codeLine(), "cm-inactive-inline-marker")).toBeGreaterThan(0);
    expect(getInlineDecorationCount(strikeLine(), "cm-inactive-inline-marker")).toBeGreaterThan(0);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("`内联代码`"));
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("内联代码"));
    expect(getInlineDecorationCount(codeLine(), "cm-inactive-inline-marker")).toBe(0);

    advancedController.setSelection(source.indexOf("~~todo~~"));
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.indexOf("todo"));
    expect(getInlineDecorationCount(strikeLine(), "cm-inactive-inline-marker")).toBe(0);

    controller.destroy();
  });

  it("moves upward through hidden-inline paragraph and heading lines without skipping visible content", async () => {
    const host = document.createElement("div");
    const source = [
      "**Bold**",
      "Normal",
      "*斜体*",
      "## **加粗标题**",
      "## 正常标题",
      "## ***加粗倾斜标题***",
      "- ~~Todo~~",
      "`内联代码`",
      "~~todo~~",
      "+++"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.lastIndexOf("+++"));
    await flushMicrotasks();

    const expectedAnchors = [
      source.indexOf("todo", source.indexOf("~~todo~~")),
      source.indexOf("内联代码"),
      source.indexOf("Todo"),
      source.indexOf("加粗倾斜标题"),
      source.indexOf("正常标题"),
      source.indexOf("加粗标题"),
      source.indexOf("斜体"),
      source.indexOf("Normal"),
      source.indexOf("Bold")
    ];

    for (const expectedAnchor of expectedAnchors) {
      dispatchEditorKeydown(view, "ArrowUp");
      await flushMicrotasks();

      expect(view?.state.selection.main.anchor).toBe(expectedAnchor);
    }

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

  it("renders indented code blocks as inactive code when focus moves into another block", () => {
    const host = document.createElement("div");
    const source = [
      "Indented code",
      "",
      "    // Some comments",
      "    line 1 of code",
      "    line 2 of code",
      "    line 3 of code",
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

    const firstCodeLine = getLineElementByText(host, "// Some comments");
    const lastCodeLine = getLineElementByText(host, "line 3 of code");
    const indentMarkers = host.querySelectorAll(".cm-inactive-code-block-indent-marker");

    expect(firstCodeLine).not.toBeNull();
    expect(firstCodeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(firstCodeLine?.classList.contains("cm-inactive-code-block-start")).toBe(true);
    expect(lastCodeLine).not.toBeNull();
    expect(lastCodeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(lastCodeLine?.classList.contains("cm-inactive-code-block-end")).toBe(true);
    expect(indentMarkers.length).toBe(4);

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

  it("moves to the opening fence when ArrowUp is pressed from the first code line", async () => {
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("const"));

    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(true);

    dispatchEditorKeydown(view, "ArrowUp");

    expect(view?.state.selection.main.anchor).toBe(0);
    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(false);

    controller.destroy();
  });

  it("moves to the opening fence when the first code line top padding is clicked", async () => {
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("const"));

    const firstCodeLine = getLineElementByText(host, "const answer = 42;");

    expect(firstCodeLine).toBeInstanceOf(HTMLElement);

    if (firstCodeLine instanceof HTMLElement) {
      firstCodeLine.style.paddingTop = "16px";
      firstCodeLine.getBoundingClientRect = () =>
        ({
          top: 100,
          right: 400,
          bottom: 140,
          left: 0,
          width: 400,
          height: 40,
          x: 0,
          y: 100,
          toJSON: () => ({})
        }) as DOMRect;

      firstCodeLine.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 108
        })
      );
    }

    expect(view?.state.selection.main.anchor).toBe(0);
    expect(getLineElementByText(host, "```ts")?.classList.contains("cm-inactive-code-block-fence")).toBe(false);

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

    const openingFenceLine = getLineElementByText(host, "```ts");
    const codeLine = getLineElementByText(host, "const answer = 42;");
    const closingFenceLine = getLineElementByText(host, "```");

    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(true);
    expect(closingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(true);

    controller.destroy();
  });

  it("moves to the closing fence when ArrowDown is pressed from the last code line", async () => {
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("42"));

    dispatchEditorKeydown(view, "ArrowDown");

    expect(view?.state.selection.main.anchor).toBe(source.lastIndexOf("```"));

    controller.destroy();
  });

  it("moves to the closing fence when the last code line bottom padding is clicked", async () => {
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("42"));

    const codeLine = getLineElementByText(host, "const answer = 42;");

    expect(codeLine).toBeInstanceOf(HTMLElement);

    if (codeLine instanceof HTMLElement) {
      codeLine.style.paddingBottom = "16px";
      codeLine.getBoundingClientRect = () => createDomRect(0, 100, 400, 40);
      codeLine.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 136
        })
      );
    }

    expect(view?.state.selection.main.anchor).toBe(source.lastIndexOf("```"));

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

  it("moves the cursor to a thematic break when the rule line is clicked", async () => {
    const host = document.createElement("div");
    const source = ["---", "", "Paragraph"].join("\n");

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
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    const ruleLine = getLineElementByText(host, "---");

    expect(ruleLine).toBeInstanceOf(HTMLElement);

    if (ruleLine instanceof HTMLElement) {
      ruleLine.style.paddingTop = "10px";
      ruleLine.style.paddingBottom = "10px";
      ruleLine.getBoundingClientRect = () => createDomRect(0, 100, 320, 28);
      ruleLine.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 114
        })
      );
    }

    expect(view?.state.selection.main.anchor).toBe(0);

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
      "name: fishmark-task-intake",
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

  it("continues a nested blockquote line on Enter while preserving its source prefix", () => {
    const host = document.createElement("div");
    const source = "> > quote";

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

    expect(controller.getContent()).toBe("> > quote\n> > ");

    controller.destroy();
  });

  it("inserts an inline hard break on Shift+Enter", () => {
    const host = document.createElement("div");
    const source = "AlphaBeta";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view!.dispatch({
      selection: {
        anchor: "Alpha".length,
        head: "Alpha".length
      }
    });
    dispatchEditorKeydown(view, "Enter", { shiftKey: true });

    expect(controller.getContent()).toBe("Alpha<br>Beta");
    expect(view?.state.selection.main.anchor).toBe("Alpha<br>".length);
    expect(view?.state.selection.main.head).toBe("Alpha<br>".length);

    controller.destroy();
  });

  it("uses a single editable line break for plain paragraph Enter and removes it with one Backspace", () => {
    const host = document.createElement("div");
    const source = "Alpha";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("Alpha\n");
    expect(view?.state.selection.main.anchor).toBe("Alpha\n".length);
    expect(view?.state.selection.main.head).toBe("Alpha\n".length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("Alpha");
    expect(view?.state.selection.main.anchor).toBe("Alpha".length);
    expect(view?.state.selection.main.head).toBe("Alpha".length);

    controller.destroy();
  });

  it("does not create two blank source rows when Enter is pressed before an existing next line", () => {
    const host = document.createElement("div");
    const source = ["AAAAA", "BBBBB"].join("\n");
    const nextBlockStartAfterInsert = "AAAAA\n\n".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection("AAAAA".length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(["AAAAA", "", "BBBBB"].join("\n"));
    expect(view?.state.selection.main.anchor).toBe(nextBlockStartAfterInsert);
    expect(view?.state.selection.main.head).toBe(nextBlockStartAfterInsert);

    controller.destroy();
  });

  it("does not create another structural separator on Enter at an existing block start", () => {
    const host = document.createElement("div");
    const source = ["Alpha", "", "Beta"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("Beta"));
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(["Alpha", "", "", "Beta"].join("\n"));
    expect(view?.state.selection.main.anchor).toBe("Alpha\n\n\n".length);
    expect(view?.state.selection.main.head).toBe("Alpha\n\n\n".length);

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

  it("exits an empty nested blockquote line on Enter", () => {
    const host = document.createElement("div");
    const source = ["> > quote", "> > "].join("\n");

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

    expect(controller.getContent()).toBe("> > quote\n");

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

  it("pressing Enter on an empty nested task item creates an empty parent task item", () => {
    const host = document.createElement("div");
    const source = ["- [ ] parent", "  - [ ] "].join("\n");

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

    expect(controller.getContent()).toBe(["- [ ] parent", "- [ ] "].join("\n"));

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

  it("normalizes attempts to place the caret on the separator below a code block", async () => {
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

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("\n\n"));

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

  it("keeps compact nested blockquote content intact when Backspace is pressed at content start", async () => {
    const host = document.createElement("div");
    const source = [">> quote one", ">> quote two"].join("\n");

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

    advancedController.setSelection(source.indexOf("quote two"));
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf(">> quote two") - 1);

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
    expect(view?.state.selection.main.anchor).toBe(expected.indexOf("quote one"));

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

  it("renumbers ordered list markers after deleting a middle item", () => {
    const host = document.createElement("div");
    const source = ["1. Todo", "2. Todo2", "3. Todo3"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);
    const deleteFrom = getLineStartOffset(source, 2);
    const deleteTo = getLineStartOffset(source, 3);

    expect(view).not.toBeNull();

    advancedController.setSelection(deleteFrom, deleteTo);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(["1. Todo", "2. Todo3"].join("\n"));

    controller.destroy();
  });

  it("breaks ordered list rendering from the current item when Backspace is pressed at content start", () => {
    const host = document.createElement("div");
    const source = ["1. 内容", "2. 内容2", "3. 内容3"].join("\n");
    const expected = ["1. 内容", "", "2.内容2", "3. 内容3"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("内容2"));
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.indexOf("2.") + "2.".length);
    expect(view?.state.selection.main.head).toBe(expected.indexOf("2.") + "2.".length);

    controller.destroy();
  });

  it("joins body text after a list boundary into the previous item on Backspace", () => {
    const host = document.createElement("div");
    const source = ["1. Tail", "", "Body"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("Body"));
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("1. TailBody");
    expect(view?.state.selection.main.anchor).toBe("1. Tail".length);
    expect(view?.state.selection.main.head).toBe("1. Tail".length);

    controller.destroy();
  });

  it("keeps the caret at joined paragraph text when Backspace joins after an ordered list boundary", () => {
    const host = document.createElement("div");
    const source = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massa",
      "",
      "You can use sequential numbers...",
      "2. ...or keep all the numbers as `1.`",
      "",
      "Start numbering with offset:"
    ].join("\n");
    const expected = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massaYou can use sequential numbers...",
      "4. ...or keep all the numbers as `1.`",
      "",
      "Start numbering with offset:"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("You can"));
    advancedController.pressBackspace();

    const expectedCursor = controller.getContent().indexOf("You can");
    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("keeps the caret at split ordered item content when Enter splits a middle ordered item", () => {
    const host = document.createElement("div");
    const source = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massa",
      "4. You can use sequential numbers...",
      "5. ...or keep all the numbers as `1.`"
    ].join("\n");
    const expected = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massa",
      "4. You ",
      "5. can use sequential numbers...",
      "6. ...or keep all the numbers as `1.`"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("can use"));
    advancedController.pressEnter();

    const expectedCursor = controller.getContent().indexOf("can use");
    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("joins paragraph text across a structural blank separator on Backspace", () => {
    const host = document.createElement("div");
    const source = ["Alpha", "", "Beta"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("Beta"));
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("AlphaBeta");
    expect(view?.state.selection.main.anchor).toBe("Alpha".length);
    expect(view?.state.selection.main.head).toBe("Alpha".length);

    controller.destroy();
  });

  it("removes a visible extra blank row before joining across the structural separator on Backspace", () => {
    const host = document.createElement("div");
    const source = ["Alpha", "", "", "Beta"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("Beta"));
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(["Alpha", "", "Beta"].join("\n"));
    expect(view?.state.selection.main.anchor).toBe("Alpha\n\n".length);
    expect(view?.state.selection.main.head).toBe("Alpha\n\n".length);

    controller.destroy();
  });

  it("keeps non-tail empty list items visible while one empty item is active", async () => {
    const host = document.createElement("div");
    const source = ["1. 内容", "2. ", "3. ", "4. 111"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view!.dispatch({
      selection: {
        anchor: getLineStartOffset(source, 2) + "2. ".length,
        head: getLineStartOffset(source, 2) + "2. ".length
      }
    });
    await flushMicrotasks();

    const emptyListLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === "2. " || line.textContent === "3. "
    );

    expect(emptyListLines.map((line) => line.textContent)).toEqual(["2. ", "3. "]);
    expect(emptyListLines[0]?.classList.contains("cm-active-list")).toBe(true);
    expect(emptyListLines[1]?.classList.contains("cm-inactive-list")).toBe(true);

    controller.destroy();
  });

  it("continues an empty ordered list item when later siblings still exist", () => {
    const host = document.createElement("div");
    const source = ["1. Todo", "2. ", "3. Todo2", "4. Todo3"].join("\n");
    const expected = ["1. Todo", "2. ", "3. ", "4. Todo2", "5. Todo3"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);
    const emptyItemCursor = getLineStartOffset(source, 2) + "2. ".length;
    const expectedCursor = getLineStartOffset(expected, 3) + "3. ".length;

    expect(view).not.toBeNull();

    advancedController.setSelection(emptyItemCursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("exits a trailing empty ordered list item on Enter", () => {
    const host = document.createElement("div");
    const source = ["1. Todo", "2. "].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);
    const emptyItemCursor = getLineStartOffset(source, 2) + "2. ".length;

    expect(view).not.toBeNull();

    advancedController.setSelection(emptyItemCursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("1. Todo\n");
    expect(view?.state.selection.main.anchor).toBe("1. Todo\n".length);
    expect(view?.state.selection.main.head).toBe("1. Todo\n".length);

    controller.destroy();
  });

  it("upgrades a trailing ordered list item to body text when Enter is pressed before its content", () => {
    const host = document.createElement("div");
    const source = ["1. Todo", "2. Todo2", "3. Todo3", "4. Tail"].join("\n");
    const expected = ["1. Todo", "2. Todo2", "3. Todo3", "", "Tail"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);
    const cursor = source.indexOf("Tail");
    const expectedCursor = expected.indexOf("Tail");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("upgrades a single top-level list item to body text without leaving a leading blank line", () => {
    const host = document.createElement("div");
    const source = "1. Tail";
    const expected = "Tail";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);
    const cursor = source.indexOf("Tail");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(0);
    expect(view?.state.selection.main.head).toBe(0);

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

    expect(controller.getContent()).toBe(["- parent", "- "].join("\n"));
    expect(controller.getSelection()).toEqual({
      anchor: ["- parent", "- "].join("\n").length,
      head: ["- parent", "- "].join("\n").length
    });

    advancedController.pressEnter();

    expect(controller.getContent()).toBe("- parent\n");
    expect(controller.getSelection()).toEqual({
      anchor: "- parent\n".length,
      head: "- parent\n".length
    });

    controller.destroy();
  });

  it("upgrades a nested list item to a parent item when Enter is pressed before its content", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - child"].join("\n");
    const expected = ["- parent", "- child"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);
    const cursor = source.indexOf("child");
    const expectedCursor = expected.indexOf("child");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

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

  it("indents a second-level unordered item into a third-level child list when Tab is pressed", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - child", "  - leaf", "- sibling"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);

    advancedController.setSelection(source.indexOf("leaf"));
    const handled = view?.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(controller.getContent()).toBe(["- parent", "  - child", "    - leaf", "- sibling"].join("\n"));

    controller.destroy();
  });

  it("outdents a third-level unordered item subtree when Shift-Tab is pressed", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressTab: (shiftKey?: boolean) => void;
    };

    advancedController.setSelection(source.indexOf("leaf"));
    advancedController.pressTab(true);

    expect(controller.getContent()).toBe(["- parent", "  - child", "  - leaf", "  continuation", "- sibling"].join("\n"));

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

  it("renumbers later ordered siblings when deleting a middle item", () => {
    const host = document.createElement("div");
    const source = ["5. first", "6. second", "7. third"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };

    const secondLineStart = getLineStartOffset(source, 2);
    const thirdLineStart = getLineStartOffset(source, 3);

    advancedController.setSelection(secondLineStart, thirdLineStart);
    advancedController.insertText("");

    expect(controller.getContent()).toBe(["5. first", "6. third"].join("\n"));

    controller.destroy();
  });

  it("renumbers later ordered siblings when inserting a new item in the middle", () => {
    const host = document.createElement("div");
    const source = ["5. first", "6. second"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressEnter: () => void;
    };

    advancedController.setSelection("5. first".length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(["5. first", "6. ", "7. second"].join("\n"));

    controller.destroy();
  });

  it("preserves the ordered offset after a blank line created inside an ordered run", () => {
    const host = document.createElement("div");
    const source = ["1. one", "2. two", "3. three", "4. four"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };

    advancedController.setSelection("1. one\n2. two".length);
    advancedController.insertText("\n");

    expect(controller.getContent()).toBe(["1. one", "2. two", "", "3. three", "4. four"].join("\n"));

    controller.destroy();
  });

  it("preserves the ordered offset after deleting a middle ordered item into a blank line", () => {
    const host = document.createElement("div");
    const source = ["1. one", "2. two", "3. three", "4. four", "5. five", "6. six"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };

    const fourthLineStart = getLineStartOffset(source, 4);
    const fourthLineEnd = getLineStartOffset(source, 5) - 1;

    advancedController.setSelection(fourthLineStart, fourthLineEnd);
    advancedController.insertText("");

    expect(controller.getContent()).toBe(
      ["1. one", "2. two", "3. three", "", "5. five", "6. six"].join("\n")
    );

    controller.destroy();
  });

  it("keeps the caret on the current empty ordered item when Backspace deletes within its marker line", () => {
    const host = document.createElement("div");
    const source = ["1. 1", "2. 2", "3. 4", "4. ", "5. 6", "6. 7"].join("\n");
    const expected = ["1. 1", "2. 2", "3. 4", "4.", "5. 6", "6. 7"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);
    const lineFourStart = getLineStartOffset(source, 4);
    const cursorOffset = lineFourStart + "4. ".length;
    const expectedCursor = getLineStartOffset(expected, 4) + "4.".length;

    expect(view).not.toBeNull();

    advancedController.setSelection(cursorOffset);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("keeps the caret on the current line when Backspace removes the dot from an empty ordered item", () => {
    const host = document.createElement("div");
    const source = ["1. 1", "2. 2", "3. 4", "4.", "5. 6", "6. 7"].join("\n");
    const expected = ["1. 1", "2. 2", "3. 4", "4", "1. 6", "2. 7"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
    };
    const view = getEditorView(host);
    const lineFourStart = getLineStartOffset(source, 4);
    const cursorOffset = lineFourStart + "4.".length;
    const expectedCursor = getLineStartOffset(expected, 4) + "4".length;

    expect(view).not.toBeNull();

    advancedController.setSelection(cursorOffset);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("renumbers source and target ordered-list scopes when Tab indents an item", () => {
    const host = document.createElement("div");
    const source = ["5. parent", "6. child", "7. sibling"].join("\n");

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

    expect(controller.getContent()).toBe(["5. parent", "  1. child", "6. sibling"].join("\n"));

    controller.destroy();
  });

  it("renumbers parent and child ordered-list scopes when Shift-Tab outdents an item", () => {
    const host = document.createElement("div");
    const source = ["5. parent", "  1. child", "6. sibling"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("child") } });
    dispatchEditorKeydown(view, "Tab", { shiftKey: true });

    expect(controller.getContent()).toBe(["5. parent", "6. child", "7. sibling"].join("\n"));

    controller.destroy();
  });

  describe("ordered-list Alt-Arrow subtree", () => {
    let restoreRangeClientRects: (() => void) | null = null;

    beforeAll(() => {
      restoreRangeClientRects = installPatchedRangeClientRects();
    });

    afterAll(async () => {
      if (restoreRangeClientRects) {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
        restoreRangeClientRects();
        restoreRangeClientRects = null;
      }
    });

    it("moves an ordered list item subtree together on Alt-ArrowDown", () => {
      const host = document.createElement("div");
      const source = ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n");

      const controller = createCodeEditorController({
        parent: host,
        initialContent: source,
        onChange: vi.fn()
      });
      const view = getEditorView(host);

      expect(view).not.toBeNull();

      view?.dispatch({ selection: { anchor: source.indexOf("child") } });
      dispatchEditorKeydown(view, "ArrowDown", { altKey: true });

      expect(controller.getContent()).toBe(
        ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n")
      );

      controller.destroy();
    });

    it("moves an ordered list item subtree together on Alt-ArrowUp", () => {
      const host = document.createElement("div");
      const source = ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n");

      const controller = createCodeEditorController({
        parent: host,
        initialContent: source,
        onChange: vi.fn()
      });
      const view = getEditorView(host);

      expect(view).not.toBeNull();

      view?.dispatch({ selection: { anchor: source.indexOf("child") } });
      dispatchEditorKeydown(view, "ArrowUp", { altKey: true });

      expect(controller.getContent()).toBe(
        ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n")
      );

      controller.destroy();
    });
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

  it("renders readable content-weighted columns for progress tables", () => {
    const host = document.createElement("div");
    const source = [
      "| Task | Epic | 状态 | 说明 |",
      "| --- | --- | --- | --- |",
      "| BOOTSTRAP-DOCS | 文档基线 | CLOSED | 文档基线已修正并关闭。 |",
      "| TASK-001 | 项目骨架 | CLOSED | 已通过独立评审；确认 Electron / Vite / React / TypeScript 开发壳可建立。 |",
      "| TASK-002 | 项目结构 | DEV_DONE | 已建立 `apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e` 目录边界，同时保持根目录开发壳可运行。 |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const table = host.querySelector<HTMLTableElement>(".cm-table-widget-table");
    const columns = Array.from(host.querySelectorAll<HTMLTableColElement>(".cm-table-widget-column"));

    expect(table).not.toBeNull();
    expect(columns).toHaveLength(4);
    expect(columns.map((column) => column.style.width)).toEqual([
      "20%",
      "14.55%",
      "14.55%",
      "50.91%"
    ]);

    controller.destroy();
  });

  it("renders inline preview styling inside table cells while preserving raw markdown text for editing", () => {
    const host = document.createElement("div");
    const source = [
      "| bold | italic | code |",
      "| --- | --- | --- |",
      "| **A** | *B* | `C` |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const boldInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const italicInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');
    const codeInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:2"]');
    const boldPreview = host.querySelector<HTMLElement>('[data-table-cell-preview="1:0"]');
    const italicPreview = host.querySelector<HTMLElement>('[data-table-cell-preview="1:1"]');
    const codePreview = host.querySelector<HTMLElement>('[data-table-cell-preview="1:2"]');

    expect(boldInput?.value).toBe("**A**");
    expect(italicInput?.value).toBe("*B*");
    expect(codeInput?.value).toBe("`C`");

    expect(boldPreview?.querySelector(".cm-inactive-inline-strong")?.textContent).toBe("A");
    expect(boldPreview?.querySelectorAll(".cm-inactive-inline-marker")).toHaveLength(2);
    expect(italicPreview?.querySelector(".cm-inactive-inline-emphasis")?.textContent).toBe("B");
    expect(italicPreview?.querySelectorAll(".cm-inactive-inline-marker")).toHaveLength(2);
    expect(codePreview?.querySelector(".cm-inactive-inline-code")?.textContent).toBe("C");
    expect(codePreview?.querySelectorAll(".cm-inactive-inline-marker")).toHaveLength(2);

    controller.destroy();
  });

  it("keeps the active table cell in raw text mode and falls back to plain text for incomplete inline markers", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "| bold | plain |",
      "| --- | --- |",
      "| **A** | done |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const initialCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(initialCell?.querySelector(".cm-inactive-inline-strong")?.textContent).toBe("A");

    initialCell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    let activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(document.activeElement).toBe(activeCell);
    expect(activeCell?.textContent).toBe("**A**");
    expect(activeCell?.querySelector(".cm-inactive-inline-strong")).toBeNull();

    const editableActiveCell = activeCell as HTMLElement & {
      value: string;
      selectionStart: number;
      setSelectionRange: (start: number, end: number) => void;
    };

    editableActiveCell.value = "**";
    editableActiveCell.setSelectionRange(2, 2);
    activeCell?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(document.activeElement).toBe(activeCell);
    expect(activeCell?.textContent).toBe("**");
    expect(
      (activeCell as HTMLElement & { selectionStart: number }).selectionStart
    ).toBe(2);
    expect(activeCell?.querySelector(".cm-inactive-inline-marker")).toBeNull();

    const nextCell = host.querySelector<HTMLElement>('[data-table-cell="1:1"]');
    nextCell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const inactiveCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(inactiveCell?.textContent).toBe("**");
    expect(inactiveCell?.querySelector(".cm-inactive-inline-marker")).toBeNull();

    controller.destroy();
    host.remove();
  });

  it("waits for the post-composition input before rewriting a table cell and commits the composed text once", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | --- |", "|   | ok |"].join("\n");
    const onChange = vi.fn();

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange
    });

    let activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(activeCell).toBeInstanceOf(HTMLElement);

    activeCell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');
    expect(document.activeElement).toBe(activeCell);

    dispatchCompositionEvent(activeCell as HTMLElement, "compositionstart", "·");
    activeCell!.textContent = "·";
    setDomCaret(activeCell as HTMLElement, 1);
    activeCell?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(source);
    expect(document.activeElement).toBe(activeCell);
    expect(onChange).not.toHaveBeenCalled();

    dispatchCompositionEvent(activeCell as HTMLElement, "compositionend", "·");
    await flushMicrotasks();

    expect(controller.getContent()).toBe(source);
    expect(document.activeElement).toBe(activeCell);
    expect(onChange).not.toHaveBeenCalled();

    activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');
    activeCell!.textContent = "·";
    setDomCaret(activeCell as HTMLElement, 1);
    activeCell?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    activeCell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

    expect(controller.getContent()).toContain("·");
    expect(controller.getContent().match(/·/g)).toHaveLength(1);
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();
    expect(document.activeElement).toBe(activeCell);
    expect((activeCell as HTMLElement & { selectionStart: number }).selectionStart).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    controller.destroy();
    host.remove();
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

    expect(input).toBeInstanceOf(HTMLElement);

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
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLElement);

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    expect(document.activeElement).toBe(input);
    input!.value = "pencil";
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(
      ["| name   | qty |", "| :----- | ---: |", "| pencil |   2 |"].join("\n")
    );

    controller.destroy();
    host.remove();
  });

  it("does not preserve a pipe-table delimiter row as editable cell content after editing", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "| 旧规则 | 新规则 |",
      "| :-------- | :------ | ------ |",
      "| df_hf | df | ------ |",
      "| df_hb | db | |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]')?.value).toBe("df_hf");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]')?.value).toBe("df");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:2"]')?.value).toBe("------");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="2:0"]')?.value).toBe("df_hb");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]')?.value).not.toBe(":--------");

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    expect(input).toBeInstanceOf(HTMLElement);

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    input!.value = "df_new";
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    expect(controller.getContent()).toBe(
      [
        "| 旧规则   | 新规则    |        |",
        "| :---- | :----- | :----- |",
        "| df_hf | df_new | ------ |",
        "| df_hb | db     |        |"
      ].join("\n")
    );
    expect(controller.getContent()).not.toContain(":--------");

    controller.destroy();
    host.remove();
  });

  it("does not render a pipe-table delimiter as cell content when a title directly precedes the table", () => {
    const host = document.createElement("div");
    const source = [
      "新旧方向映射规则1（旧数据，非3SPY/SSPY）",
      "| 旧规则 | 新规则 |",
      "| :-------- | :------ | ------ |",
      "| df_hf | df | ------ |",
      "| df_hb | db | |"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    expect(getLineElementByText(host, "新旧方向映射规则1（旧数据，非3SPY/SSPY）")).not.toBeNull();
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]')?.value).toBe("df_hf");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]')?.value).toBe("df");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="1:2"]')?.value).toBe("------");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]')?.value).toBe("旧规则");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:1"]')?.value).toBe("新规则");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:2"]')?.value).toBe("");
    expect(host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]')?.value).not.toBe(":--------");

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

  it("focuses and highlights the clicked table cell when entering from another block", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLElement);

    input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const highlightedCell = host.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');

    expect(document.activeElement).toBe(input);
    expect(highlightedCell).toBe(input?.closest(".cm-table-widget-cell"));

    controller.destroy();
    host.remove();
  });

  it("moves focus and highlight together when a different table cell is clicked", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "| ink | 3 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const firstInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const secondInput = host.querySelector<HTMLInputElement>('[data-table-cell="2:1"]');

    expect(firstInput).toBeInstanceOf(HTMLElement);
    expect(secondInput).toBeInstanceOf(HTMLElement);

    firstInput?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();
    secondInput?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const highlightedCell = host.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');

    expect(document.activeElement).toBe(secondInput);
    expect(highlightedCell).toBe(secondInput?.closest(".cm-table-widget-cell"));
    expect(firstInput?.closest<HTMLElement>(".cm-table-widget-cell")?.dataset.active).toBe("false");

    controller.destroy();
    host.remove();
  });

  it("keeps table cell interactions working after content is inserted before the table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "| ink | 3 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    controller.setSelection(0);
    controller.insertText("Paragraph above\n\n");
    await flushMicrotasks();
    await flushMicrotasks();

    const shiftedInput = host.querySelector<HTMLInputElement>('[data-table-cell="2:1"]');

    expect(shiftedInput).toBeInstanceOf(HTMLElement);

    shiftedInput?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const highlightedCell = host.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');

    expect(document.activeElement).toBe(shiftedInput);
    expect(highlightedCell).toBe(shiftedInput?.closest(".cm-table-widget-cell"));

    controller.destroy();
    host.remove();
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

    expect(input).toBeInstanceOf(HTMLElement);

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

  it("keeps the newly focused table cell in view by scrolling only the CodeMirror scroller", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "| ink | 3 |"].join("\n");
    const originalFocus = HTMLElement.prototype.focus;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const focusCalls: Array<{ cell: string | undefined; options: FocusOptions | undefined }> = [];
    const scrollCalls: Array<{ cell: string | undefined; options: ScrollIntoViewOptions | boolean | undefined }> = [];

    HTMLElement.prototype.focus = function focusPatched(this: HTMLElement, options?: FocusOptions) {
      if (this.classList.contains("cm-table-widget-input")) {
        focusCalls.push({ cell: this.dataset.tableCell, options });
      }

      originalFocus.call(this, options);
    };

    HTMLElement.prototype.scrollIntoView = function scrollIntoViewPatched(
      this: HTMLElement,
      options?: ScrollIntoViewOptions | boolean
    ) {
      if (this.classList.contains("cm-table-widget-input")) {
        scrollCalls.push({ cell: this.dataset.tableCell, options });
      }
    };

    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRectPatched(this: HTMLElement) {
      if (this.classList.contains("cm-scroller")) {
        return createDomRect(0, 100, 600, 200);
      }

      if (this.dataset.tableCell === "2:0") {
        const scroller = host.querySelector<HTMLElement>(".cm-scroller");

        return createDomRect(20, 330 - (scroller?.scrollTop ?? 0), 120, 24);
      }

      return originalGetBoundingClientRect.call(this);
    };

    try {
      const controller = createCodeEditorController({
        parent: host,
        initialContent: source,
        onChange: vi.fn()
      });

      const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

      expect(input).toBeInstanceOf(HTMLElement);

      input?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await flushMicrotasks();
      await flushMicrotasks();

      focusCalls.length = 0;
      scrollCalls.length = 0;

      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true })
      );
      await flushMicrotasks();
      await flushMicrotasks();

      expect(document.activeElement).toBe(host.querySelector('[data-table-cell="2:0"]'));
      expect(focusCalls.at(-1)).toEqual({
        cell: "2:0",
        options: { preventScroll: true }
      });
      expect(scrollCalls).toEqual([]);
      expect(host.querySelector<HTMLElement>(".cm-scroller")?.scrollTop).toBe(54);

      controller.destroy();
    } finally {
      HTMLElement.prototype.focus = originalFocus;
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      host.remove();
    }
  });

  it("inserts an inline hard break inside a table cell on Shift+Enter", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(input).toBeInstanceOf(HTMLElement);

    input?.focus();
    input?.setSelectionRange(1, 1);
    input?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        shiftKey: true
      })
    );
    await flushMicrotasks();

    const currentInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(controller.getContent()).toContain("p<br>en");
    expect(document.activeElement).toBe(currentInput);
    expect(currentInput?.selectionStart).toBe("p<br>".length);

    controller.destroy();
    host.remove();
  });

  it("moves between table rows and exits to the next visible block on Enter from the last row", async () => {
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

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(document.activeElement).not.toBe(currentInput);
    expect(controller.getContent()).toBe(source);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(source.indexOf("After"));
    expect(controller.getContent().indexOf("After")).toBeGreaterThan(0);

    controller.destroy();
    host.remove();
  });

  it("skips the collapsed structural separator when ArrowDown exits below a table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Before",
      "",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
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

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(document.activeElement).not.toBe(input);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("After"));

    const blankLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ""
    );

    expect(blankLine?.classList.contains("cm-inactive-blank-line")).toBe(true);

    controller.destroy();
    host.remove();
  });

  it("skips the collapsed structural separator when ArrowUp exits above a table", async () => {
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

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(document.activeElement).not.toBe(input);
    expect(view?.state.selection.main.anchor).toBe("Before".length);

    const blankLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ""
    );

    expect(blankLine?.classList.contains("cm-inactive-blank-line")).toBe(true);

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

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(document.activeElement).not.toBe(input);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe("Before".length);

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

    view!.dispatch({ selection: { anchor: "Before".length } });
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

    view!.dispatch({ selection: { anchor: source.indexOf("After") } });
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

  it("does not create an unreachable hidden separator above a table at document start", async () => {
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

    expect(controller.getContent()).toBe(source);
    expect(document.activeElement).toBe(input);

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

    expect(input).toBeInstanceOf(HTMLElement);
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

  it("does not enter the previous table when ArrowDown is pressed from the paragraph below it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Tables",
      "",
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files to supply the data that will be passed into templates. |",
      "| engine | engine to be used for processing templates. Handlebars is the default. |",
      "| ext | extension to be used for dest files. |",
      "",
      "Right aligned columns"
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const paragraphStart = source.indexOf("Right aligned columns");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view!.dispatch({ selection: { anchor: paragraphStart, head: paragraphStart } });
    await flushMicrotasks();

    const arrowDown = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      code: "ArrowDown",
      bubbles: true,
      cancelable: true
    });

    view!.contentDOM.dispatchEvent(arrowDown);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(arrowDown.defaultPrevented).toBe(true);
    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(view!.state.selection.main.anchor).toBe(paragraphStart);
    expect(host.querySelector('.cm-table-widget-cell[data-active="true"]')).toBeNull();
    expect(document.activeElement?.classList.contains("cm-table-widget-input")).toBe(false);

    controller.destroy();
    host.remove();
  });

  it("handles ArrowDown from the paragraph below a table before default browser geometry can re-enter it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Tables",
      "",
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files. |",
      "",
      "Right aligned columns",
      "Next paragraph line"
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const paragraphStart = source.indexOf("Right aligned columns");
    const nextLineStart = source.indexOf("Next paragraph line");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view!.dispatch({ selection: { anchor: paragraphStart, head: paragraphStart } });
    await flushMicrotasks();

    const arrowDown = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      code: "ArrowDown",
      bubbles: true,
      cancelable: true
    });

    view!.contentDOM.dispatchEvent(arrowDown);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(arrowDown.defaultPrevented).toBe(true);
    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(view!.state.selection.main.anchor).toBe(nextLineStart);
    expect(host.querySelector('.cm-table-widget-cell[data-active="true"]')).toBeNull();
    expect(document.activeElement?.classList.contains("cm-table-widget-input")).toBe(false);

    controller.destroy();
    host.remove();
  });

  it("focuses the following table instead of the previous table when ArrowDown enters a repeated cell coordinate", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Tables",
      "",
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files. |",
      "",
      "Right aligned columns",
      "",
      "| Right | Amount |",
      "| ---: | ---: |",
      "| foo | 10 |"
    ].join("\n");
    const activeTableStarts: number[] = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        if (state.tableCursor?.mode === "inside") {
          activeTableStarts.push(state.tableCursor.tableStartOffset);
        }
      }
    });
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const paragraphStart = source.indexOf("Right aligned columns");
    const followingTableStart = source.indexOf("| Right | Amount |");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    view!.dispatch({ selection: { anchor: paragraphStart, head: paragraphStart } });
    await flushMicrotasks();

    dispatchEditorKeydown(view, "ArrowDown");
    await flushMicrotasks();
    await flushMicrotasks();

    const activeCell = host.querySelector<HTMLElement>('.cm-table-widget-cell[data-active="true"]');
    const focusedTable = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".cm-table-widget");

    expect(activeTableStarts.at(-1)).toBe(followingTableStart);
    expect(view!.state.selection.main.anchor).toBe(source.indexOf("Right", followingTableStart));
    expect(activeCell?.closest<HTMLElement>(".cm-table-widget")?.dataset.tableStartOffset).toBe(
      String(followingTableStart)
    );
    expect(focusedTable?.dataset.tableStartOffset).toBe(String(followingTableStart));

    controller.destroy();
    host.remove();
  });

  it("does not route ArrowDown back into a table after clicking the paragraph below it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Tables",
      "",
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files to supply the data that will be passed into templates. |",
      "| engine | engine to be used for processing templates. Handlebars is the default. |",
      "| ext | extension to be used for dest files. |",
      "",
      "Right aligned columns"
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
    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');
    const paragraphLine = getLineElementByText(host, "Right aligned columns");
    const view = getEditorView(host);

    expect(input).toBeInstanceOf(HTMLElement);
    expect(paragraphLine).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    input?.focus();
    input?.setSelectionRange(0, 0);
    paragraphLine?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    paragraphLine?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    paragraphLine?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const keyTarget = document.activeElement instanceof HTMLElement ? document.activeElement : view!.contentDOM;

    keyTarget.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(view!.state.selection.main.anchor).toBe(source.indexOf("Right aligned columns"));
    expect(document.activeElement).not.toBe(input);
    expect(host.querySelector('.cm-table-widget-cell[data-active="true"]')).toBeNull();

    controller.destroy();
    host.remove();
  });

  it("does not let a stale queued table focus pull the caret back from the paragraph below", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "Before",
      "",
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files. |",
      "",
      "Right aligned columns"
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
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");
    const paragraphStart = source.indexOf("Right aligned columns");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view!.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1 } });
    dispatchEditorKeydown(view, "ArrowDown");
    view!.dispatch({ selection: { anchor: paragraphStart, head: paragraphStart } });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(activeBlockTypes.at(-1)).toBe("paragraph");
    expect(view!.state.selection.main.anchor).toBe(paragraphStart);
    expect(host.querySelector('.cm-table-widget-cell[data-active="true"]')).toBeNull();
    expect(document.activeElement?.classList.contains("cm-table-widget-input")).toBe(false);

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

    expect(input).toBeInstanceOf(HTMLElement);
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

    expect(input).toBeInstanceOf(HTMLElement);
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

    expect(input).toBeInstanceOf(HTMLElement);
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

    expect(currentInput).toBeInstanceOf(HTMLElement);
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

  it("moves through visible extra blank rows above a table on ArrowUp", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "## 一级标题",
      "- todo",
      "1. 内容",
      "2. 内容",
      "3. 内容",
      "哇哇哇哇哇",
      "",
      "+++",
      "",
      "",
      "",
      "",
      "",
      "",
      "| header | contentww |   |   |   | column |",
      "| :----- | :-------- | :--- | :--- | :--- | :----- |",
      "|        | 22        |   |   |   |        |",
      "| 11     |           |   |   |   |        |",
      "|        | 嘿嘿        |   |   |   |        |",
      "|        |           |   |   |   |        |",
      "",
      "",
      ""
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const tableAdjacentBlankLineStart = getLineStartOffset(source, 14);
    const previousExtraBlankLineStart = getLineStartOffset(source, 13);

    view!.dispatch({
      selection: {
        anchor: tableAdjacentBlankLineStart,
        head: tableAdjacentBlankLineStart
      }
    });
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

    expect(view!.state.selection.main.anchor).toBe(previousExtraBlankLineStart);

    controller.destroy();
    host.remove();
  });

  it("moves upward through trailing blank lines below a table without jumping above the table", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = [
      "## 一级标题",
      "- todo",
      "1. 内容",
      "2. 内容",
      "3. 内容",
      "哇哇哇哇哇",
      "",
      "+++",
      "",
      "| header | contentww |   |   |   | column |",
      "| :----- | :-------- | :--- | :--- | :--- | :----- |",
      "|        | 22        |   |   |   |        |",
      "| 11     |           |   |   |   |        |",
      "|        | 嘿嘿        |   |   |   |        |",
      "|        |           |   |   |   |        |",
      "",
      "",
      ""
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const lastBlankLineStart = getLineStartOffset(source, 18);
    const previousBlankLineStart = getLineStartOffset(source, 17);

    view!.dispatch({
      selection: {
        anchor: lastBlankLineStart,
        head: lastBlankLineStart
      }
    });
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

    expect(view!.state.selection.main.anchor).toBe(previousBlankLineStart);

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
    const originalFocus = HTMLElement.prototype.focus;

    Range.prototype.getClientRects = function getClientRects() {
      return {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* iterator() {}
      } as unknown as DOMRectList;
    };

    HTMLElement.prototype.focus = function focusPatched(this: HTMLElement) {
      if (this.classList.contains("cm-table-widget-input")) {
        this.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
        this.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        return;
      }

      originalFocus.call(this);
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
      HTMLElement.prototype.focus = originalFocus;
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

  it("reactivates each hidden-inline line while ArrowUp moves through the reproduced sequence", async () => {
    const host = document.createElement("div");
    const source = [
      "**Bold**",
      "Normal",
      "*斜体*",
      "## **加粗标题**",
      "## 正常标题",
      "## ***加粗倾斜标题***",
      "- ~~Todo~~",
      "`内联代码`",
      "~~todo~~",
      "+++"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.lastIndexOf("+++"));
    await flushMicrotasks();

    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    const strikeLine = getLineElementByText(host, "~~todo~~");
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("todo", source.indexOf("~~todo~~")));
    expect(getInlineDecorationCount(strikeLine, "cm-inactive-inline-marker")).toBe(0);

    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    const codeLine = getLineElementByText(host, "`内联代码`");
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("内联代码"));
    expect(getInlineDecorationCount(codeLine, "cm-inactive-inline-marker")).toBe(0);

    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    const listLine = getLineElementByText(host, "- ~~Todo~~");
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("Todo"));
    expect(listLine?.classList.contains("cm-inactive-list")).toBe(false);
    expect(getInlineDecorationCount(listLine, "cm-inactive-inline-marker")).toBe(0);

    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    const headingLine = getLineElementByText(host, "加粗倾斜标题");
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("加粗倾斜标题"));
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(false);

    controller.destroy();
  });

  it("restores thematic break rendering after ArrowDown leaves the active separator", async () => {
    const host = document.createElement("div");
    const source = [
      "正常标题",
      "## ***加粗倾斜标题***",
      "- ~~Todo~~",
      "`内联代码`",
      "~~todo~~",
      "+++",
      "# 一级标题",
      "- todo"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("+++") + "+++".length);
    await flushMicrotasks();

    const thematicBreakLine = getLineElementByText(host, "+++");
    expect(thematicBreakLine?.classList.contains("cm-inactive-thematic-break")).toBe(false);

    dispatchEditorKeydown(view, "ArrowDown");
    await flushMicrotasks();

    const headingLine = getLineElementByText(host, "# 一级标题");
    const nextThematicBreakLine = getLineElementByText(host, "+++");
    const selectionAnchor = view?.state.selection.main.anchor ?? -1;
    const headingStart = source.indexOf("一级标题");
    const headingEnd = headingStart + "一级标题".length;

    expect(selectionAnchor).toBeGreaterThanOrEqual(headingStart);
    expect(selectionAnchor).toBeLessThanOrEqual(headingEnd);
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(nextThematicBreakLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);

    controller.destroy();
  });

  it("does not skip from an active list item to a distant heading when ArrowUp is pressed", async () => {
    const host = document.createElement("div");
    const source = [
      "Normal",
      "*斜体*",
      "## **加粗标题**",
      "## 正常标题",
      "## ***加粗倾斜标题***",
      "- ~~Todo~~",
      "`内联代码`",
      "~~todo~~",
      "+++"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("Todo") + "Todo".length);
    await flushMicrotasks();

    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    const selectionAnchor = view?.state.selection.main.anchor ?? -1;
    const headingStart = source.indexOf("加粗倾斜标题");
    const headingEnd = headingStart + "加粗倾斜标题".length;

    expect(selectionAnchor).toBeGreaterThanOrEqual(headingStart);
    expect(selectionAnchor).toBeLessThanOrEqual(headingEnd);

    controller.destroy();
  });

  it("keeps lazy continuation lines rendered when the active cursor stays on the list item line", async () => {
    const host = document.createElement("div");
    const source = [
      "## 正常标题",
      "## ***加粗倾斜标题***",
      "- ~~Todo~~",
      "`内联代码`",
      "~~todo~~",
      "+++",
      "## 一级标题"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(source.indexOf("Todo"));
    await flushMicrotasks();

    const listLine = getLineElementByText(host, "- ~~Todo~~");
    const codeLine = getLineElementByText(host, "`内联代码`");
    const strikeLine = getLineElementByText(host, "~~todo~~");
    const thematicBreakLine = getLineElementByText(host, "+++");

    expect(listLine?.classList.contains("cm-inactive-list")).toBe(false);
    expect(getInlineDecorationCount(listLine, "cm-inactive-inline-marker")).toBe(0);

    expect(getInlineDecorationCount(codeLine, "cm-inactive-inline-marker")).toBeGreaterThan(0);
    expect(getInlineDecorationCount(strikeLine, "cm-inactive-inline-marker")).toBeGreaterThan(0);
    expect(thematicBreakLine?.classList.contains("cm-inactive-thematic-break")).toBe(true);

    controller.destroy();
  });

  it("uses the official complex fixture for blockquote and table vertical navigation", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = complexEditorFixtureSource;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    const blockquoteTailAnchor = source.indexOf("第三条引用内容");
    const tableAboveBlankLineStart = source.indexOf("\n\n| name | qty | note |") + 1;
    const tableHeadAnchor = source.indexOf("name");
    const tableTailAnchor = source.indexOf("ink");

    view!.dispatch({
      selection: {
        anchor: source.indexOf("```ts"),
        head: source.indexOf("```ts")
      }
    });
    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    expect(view!.state.selection.main.anchor).toBe(blockquoteTailAnchor);

    view!.dispatch({
      selection: {
        anchor: tableAboveBlankLineStart - 1,
        head: tableAboveBlankLineStart - 1
      }
    });
    dispatchEditorKeydown(view, "ArrowDown");
    await flushMicrotasks();

    expect(view!.state.selection.main.anchor).toBe(tableHeadAnchor);

    view!.dispatch({
      selection: {
        anchor: source.indexOf("表格下方的普通段落第一行。"),
        head: source.indexOf("表格下方的普通段落第一行。")
      }
    });
    dispatchEditorKeydown(view, "ArrowUp");
    await flushMicrotasks();

    expect(view!.state.selection.main.anchor).toBe(tableTailAnchor);

    controller.destroy();
    host.remove();
  });

  it("uses the official complex fixture for Tab, Shift-Tab, Enter, and Backspace structure edits", async () => {
    const host = document.createElement("div");
    const source = complexEditorFixtureSource;
    const indentedSource = source.replace(
      "1. 有序列表第一项\n2. 有序列表第二项\n3. \n4. 有序列表第四项",
      "1. 有序列表第一项\n  1. 有序列表第二项\n2. \n3. 有序列表第四项"
    );
    const orderedContinuationSource = source.replace(
      "3. \n4. 有序列表第四项",
      "3. \n4. \n5. 有序列表第四项"
    );

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
      pressEnter: () => void;
      pressTab: (shiftKey?: boolean) => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("有序列表第二项"));
    advancedController.pressTab();
    expect(controller.getContent()).toBe(indentedSource);

    advancedController.setSelection(indentedSource.indexOf("有序列表第二项"));
    advancedController.pressTab(true);
    expect(controller.getContent()).toBe(source);

    advancedController.setSelection(source.indexOf("3. \n4. 有序列表第四项") + "3. ".length);
    advancedController.pressEnter();
    expect(controller.getContent()).toBe(orderedContinuationSource);
    expect(view!.state.selection.main.anchor).toBe(
      orderedContinuationSource.indexOf("4. \n5. 有序列表第四项") + "4. ".length
    );

    controller.replaceDocument(source);
    advancedController.setSelection(source.indexOf("第三条引用内容"));
    advancedController.pressBackspace();
    expect(controller.getContent()).toBe(source);
    expect(view!.state.selection.main.anchor).toBe(source.indexOf("> 第三条引用内容") - 1);

    controller.destroy();
  });
});
