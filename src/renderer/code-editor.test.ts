// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Transaction } from "@codemirror/state";
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
const markdownRenderCss = readFileSync(
  resolve(process.cwd(), "src/renderer/styles/markdown-render.css"),
  "utf8"
);

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

  it("toggles source mode without changing content, selection, or onChange state", async () => {
    const host = document.createElement("div");
    const source = [
      "# Heading",
      "",
      "[link](https://example.com) and **bold** with *emphasis*",
      "![alt](./image.png)",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- [x] Task",
      "",
      "> **Quote**",
      "",
      "Math $x^2$",
      "",
      "$$",
      "a + b",
      "$$",
      "",
      "Footnote[^note]",
      "",
      "[^note]: Footnote **body**",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "  A[Start] --> B[End]",
      "```",
      "",
      "---"
    ].join("\n");
    const onChange = vi.fn();
    const selectionAnchor = source.indexOf("bold");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange
    });

    controller.setSelection(selectionAnchor);
    const beforeSelection = controller.getSelection();

    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();

    controller.setViewMode("source");
    await flushMicrotasks();

    const headingLine = getLineElementByText(host, "# Heading");
    const taskLine = getLineElementByText(host, "- [x] Task");

    expect(controller.getContent()).toBe(source);
    expect(controller.getSelection()).toEqual(beforeSelection);
    expect(onChange).not.toHaveBeenCalled();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(false);
    expect(headingLine?.textContent).toContain("# Heading");
    expect(taskLine?.textContent).toContain("- [x] Task");
    expect(host.querySelector(".cm-inactive-heading-marker")).toBeNull();
    expect(host.querySelector(".cm-inactive-inline-marker")).toBeNull();
    expect(host.querySelector(".cm-markdown-image-preview")).toBeNull();
    expect(host.querySelector(".cm-table-widget")).toBeNull();
    expect(host.querySelector(".cm-inactive-blockquote")).toBeNull();
    expect(host.querySelector(".cm-math-preview")).toBeNull();
    expect(host.querySelector(".cm-mermaid-preview")).toBeNull();
    expect(host.querySelector(".cm-inactive-inline-footnote-reference")).toBeNull();
    expect(host.querySelector(".cm-inactive-footnote-definition")).toBeNull();
    expect(host.querySelector(".cm-inactive-code-block")).toBeNull();
    expect(host.querySelector(".cm-inactive-thematic-break")).toBeNull();

    controller.setViewMode("wysiwym");
    await flushMicrotasks();

    expect(controller.getContent()).toBe(source);
    expect(controller.getSelection()).toEqual(beforeSelection);
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector(".cm-inactive-heading-marker")).not.toBeNull();
    expect(host.querySelector(".cm-math-preview")).not.toBeNull();
    expect(host.querySelector(".cm-mermaid-preview")).not.toBeNull();
    expect(host.querySelector(".cm-inactive-inline-footnote-reference")).not.toBeNull();
    expect(host.querySelector(".cm-table-widget")).not.toBeNull();

    controller.destroy();
  });

  it("renders inactive footnote references and Mermaid fences as preview widgets", async () => {
    const host = document.createElement("div");
    const source = [
      "普通脚注引用[^first]，重复引用[^first]，第二个引用[^second]，未定义引用[^missing]。",
      "",
      "```mermaid",
      "graph TD",
      "  A[Start] --> B[End]",
      "```",
      "",
      "[^first]: 这是第一条脚注定义。",
      "[^second]: 这是第二条脚注定义。"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("graph TD") } });
    await flushMicrotasks();

    const footnoteLine = getLineElementByText(host, "普通脚注引用");
    const footnotePreviews = Array.from(host.querySelectorAll<HTMLElement>(".cm-footnote-reference-preview"));

    expect(footnotePreviews.map((preview) => preview.textContent)).toEqual(["first", "first", "second"]);
    expect(footnotePreviews.map((preview) => preview.tagName)).toEqual(["SUP", "SUP", "SUP"]);
    expect(footnotePreviews.map((preview) => preview.dataset.footnoteIdentifier)).toEqual(["first", "first", "second"]);
    expect(footnoteLine?.textContent).toContain(
      "普通脚注引用first，重复引用first，第二个引用second，未定义引用[^missing]。"
    );
    expect(footnoteLine?.textContent).not.toContain("[^first]");
    expect(host.querySelector(".cm-mermaid-preview")).not.toBeNull();
    expect(host.textContent).not.toContain("```mermaid");
    expect(host.querySelector(".cm-inactive-footnote-definition")).not.toBeNull();

    controller.destroy();
  });

  it("jumps from an inactive footnote reference to its definition on Ctrl-click", async () => {
    const host = document.createElement("div");
    const source = [
      "普通脚注引用[^first]，重复引用[^first]。",
      "",
      "Paragraph",
      "",
      "[^first]: 这是脚注定义。"
    ].join("\n");
    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const paragraphOffset = source.indexOf("Paragraph");
    const definitionContentOffset = source.indexOf("这是脚注定义");

    view?.dispatch({ selection: { anchor: paragraphOffset, head: paragraphOffset } });
    await flushMicrotasks();

    const footnotePreview = host.querySelector<HTMLElement>(".cm-footnote-reference-preview");

    expect(footnotePreview).toBeInstanceOf(HTMLElement);
    expect(footnotePreview?.textContent).toBe("first");
    expect(footnotePreview?.tagName).toBe("SUP");
    footnotePreview?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );

    expect(view?.state.selection.main.anchor).toBe(definitionContentOffset);
    expect(view?.state.selection.main.head).toBe(definitionContentOffset);
    expect(controller.getContent()).toBe(source);

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

  it("finds and replaces matches while preserving undo history", () => {
    const host = document.createElement("div");
    const changes: string[] = [];
    const controller = createCodeEditorController({
      parent: host,
      initialContent: "alpha beta\nBeta alpha\n",
      onChange: (content) => changes.push(content)
    });
    const view = getEditorView(host);

    const firstSnapshot = controller.updateFindReplaceQuery({
      search: "beta",
      replace: "gamma"
    });

    expect(firstSnapshot).toEqual({
      matchCount: 2,
      currentMatchIndex: 1
    });
    expect(controller.getSelection()).toEqual({
      anchor: "alpha ".length,
      head: "alpha beta".length
    });

    expect(controller.findNextMatch()).toEqual({
      matchCount: 2,
      currentMatchIndex: 2
    });

    expect(controller.replaceCurrentMatch()).toEqual({
      matchCount: 1,
      currentMatchIndex: 1
    });
    expect(controller.getContent()).toBe("alpha beta\ngamma alpha\n");

    expect(controller.replaceAllMatches()).toEqual({
      matchCount: 0,
      currentMatchIndex: null
    });
    expect(controller.getContent()).toBe("alpha gamma\ngamma alpha\n");

    dispatchEditorKeydown(view, "z", { ctrlKey: true });
    expect(controller.getContent()).toBe("alpha beta\ngamma alpha\n");
    expect(changes.at(-1)).toBe("alpha beta\ngamma alpha\n");

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
      .fn<(input: { documentPath: string | null }) => Promise<string | null>>()
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

  it("falls back to main clipboard image import when the DOM paste payload has no pasteable text", async () => {
    const host = document.createElement("div");
    const importClipboardImage = vi
      .fn<(input: { documentPath: string | null }) => Promise<string | null>>()
      .mockResolvedValue("![image](D:/FishMark/temp/pasted.png)");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn(),
      importClipboardImage
    });

    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true
    });

    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [],
        types: [],
        getData: () => ""
      }
    });

    editorRoot?.dispatchEvent(pasteEvent);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(importClipboardImage).toHaveBeenCalledWith({
      documentPath: null
    });
    expect(controller.getContent()).toBe("![image](D:/FishMark/temp/pasted.png)");

    controller.destroy();
  });

  it("does not intercept normal text paste while checking for clipboard images", () => {
    const host = document.createElement("div");
    const importClipboardImage = vi.fn<(input: { documentPath: string | null }) => Promise<string | null>>();

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "Paragraph",
      onChange: vi.fn(),
      importClipboardImage
    });

    const editorRoot = host.querySelector(".cm-editor");
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true
    });

    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [],
        types: ["text/plain"],
        getData: (type: string) => (type === "text/plain" ? "copied text" : "")
      }
    });

    editorRoot?.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(importClipboardImage).not.toHaveBeenCalled();

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

  it("keeps an active empty paragraph block visible while editing", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "Paragraph two"].join("\n");
    const activeBlankLineStart = "Paragraph one\n\n".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    host.querySelector(".cm-editor")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    view?.dispatch({ selection: { anchor: "Paragraph one".length } });
    dispatchEditorKeydown(view, "Enter");
    await flushMicrotasks();

    const blankLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === ""
    );
    const activeBlankLine = blankLines.find((line) => !line.classList.contains("cm-inactive-blank-line"));

    expect(activeBlankLine).not.toBeNull();
    expect(activeBlankLine?.classList.contains("cm-inactive-blank-line")).toBe(false);
    expect(view?.state.selection.main.anchor).toBe(activeBlankLineStart);

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

  it("marks active empty and whitespace-only physical lines with editable surface classes", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "", "   ", "Paragraph two"].join("\n");
    const structuralEmptyLineStart = source.indexOf("\n\n\n") + 1;
    const emptyLineStart = structuralEmptyLineStart + 1;
    const whitespaceLineStart = source.indexOf("   ");

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
    view?.dispatch({ selection: { anchor: emptyLineStart } });
    await flushMicrotasks();

    const emptyLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find((line) =>
      line.textContent === "" && line.classList.contains("cm-fm-line-extra-blank")
    );

    expect(emptyLine?.classList.contains("cm-fm-line")).toBe(true);
    expect(emptyLine?.classList.contains("cm-fm-line-empty")).toBe(true);
    expect(emptyLine?.classList.contains("cm-fm-line-active")).toBe(true);
    expect(emptyLine?.classList.contains("cm-inactive-blank-line")).toBe(false);

    view?.dispatch({ selection: { anchor: whitespaceLineStart + 1 } });
    await flushMicrotasks();

    const whitespaceLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "   "
    );

    expect(whitespaceLine?.classList.contains("cm-fm-line")).toBe(true);
    expect(whitespaceLine?.classList.contains("cm-fm-line-whitespace")).toBe(true);
    expect(whitespaceLine?.classList.contains("cm-fm-line-active")).toBe(true);
    expect(whitespaceLine?.classList.contains("cm-inactive-blank-line")).toBe(false);

    controller.destroy();
  });

  it("keeps the selection after inserted spaces on an empty physical line", async () => {
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

    advancedController.setSelection(0);
    advancedController.insertText(" ");
    await flushMicrotasks();

    expect(controller.getContent()).toBe(" ");
    expect(controller.getSelection()).toEqual({ anchor: 1, head: 1 });

    controller.destroy();
  });

  it("deletes one real whitespace character from inside a whitespace-only physical line", async () => {
    const host = document.createElement("div");
    const source = "   ";
    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      pressBackspace: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };

    advancedController.setSelection(2);
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe("  ");
    expect(controller.getSelection()).toEqual({ anchor: 1, head: 1 });

    controller.destroy();
  });

  it("deletes one real whitespace character from the end of a whitespace-only physical line", async () => {
    const host = document.createElement("div");
    const source = "   ";
    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      pressBackspace: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe("  ");
    expect(controller.getSelection()).toEqual({ anchor: 2, head: 2 });

    controller.destroy();
  });

  it("keeps active physical blank and whitespace line CSS in the normal editable line box", () => {
    expect(markdownRenderCss).toMatch(
      /\.document-editor \.cm-line\.cm-fm-line-active\.cm-fm-line-empty\s*\{[^}]*min-height:\s*1\.[^;}]+em;[^}]*line-height:\s*1\.[^;}]+;[^}]*white-space:\s*pre-wrap;/su
    );
    expect(markdownRenderCss).toMatch(
      /\.document-editor \.cm-line\.cm-fm-line-active\.cm-fm-line-whitespace\s*\{[^}]*min-height:\s*1\.[^;}]+em;[^}]*line-height:\s*1\.[^;}]+;[^}]*white-space:\s*pre-wrap;/su
    );
  });

  it("skips the collapsed structural blank row on ArrowDown from the previous block", async () => {
    const host = document.createElement("div");
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const blankLineStart = source.indexOf("\n\n") + 1;

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

    expect(view?.state.selection.main.anchor).toBe(source.length);
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

  it("applies active list line classes with generated markers while editing a list item", async () => {
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
    expect(activeListLine?.querySelector(".cm-active-list-source-prefix")).toBeNull();
    expect(activeListLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");
    expect(activeListLine?.querySelector(".cm-active-list-padding-anchor")?.textContent).toBe(" ");

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
    expect(activeChildListLine?.querySelector(".cm-active-list-padding-anchor")?.textContent).toBe(" ");

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

  it("keeps a paragraph line stable when a trailing bare dash is active", async () => {
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
    expect(dashLine?.classList.contains("cm-active-paragraph")).toBe(true);
    expect(dashLine?.classList.contains("cm-active-list")).toBe(false);
    expect(dashLine?.querySelector(".cm-active-list-marker")).toBeNull();

    controller.destroy();
  });

  it("commits a trailing dash as a list marker only after marker padding is typed", async () => {
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

    advancedController.setSelection(0);
    advancedController.insertText("-");
    await flushMicrotasks();

    const dashLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "-"
    );

    expect(controller.getContent()).toBe("-");
    expect(dashLine?.classList.contains("cm-active-list")).toBe(false);
    expect(dashLine?.querySelector(".cm-active-list-marker")).toBeNull();

    advancedController.insertText(" ");
    await flushMicrotasks();

    const listLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "- "
    );

    expect(controller.getContent()).toBe("- ");
    expect(listLine?.classList.contains("cm-active-list")).toBe(true);
    expect(listLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");

    advancedController.insertText("中文");

    expect(controller.getContent()).toBe("- 中文");
    expect(controller.getSelection()).toEqual({ anchor: "- 中文".length, head: "- 中文".length });

    controller.destroy();
  });

  it("commits a trailing ordered marker only after marker padding is typed", async () => {
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

    advancedController.setSelection(0);
    advancedController.insertText("1.");
    await flushMicrotasks();

    const bareOrderedLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "1."
    );

    expect(controller.getContent()).toBe("1.");
    expect(bareOrderedLine?.classList.contains("cm-active-list")).toBe(false);
    expect(bareOrderedLine?.querySelector(".cm-active-list-marker")).toBeNull();

    advancedController.insertText(" ");
    await flushMicrotasks();

    const orderedListLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "1. "
    );

    expect(controller.getContent()).toBe("1. ");
    expect(orderedListLine?.classList.contains("cm-active-list")).toBe(true);
    expect(orderedListLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("1.");

    advancedController.insertText("中文");

    expect(controller.getContent()).toBe("1. 中文");
    expect(controller.getSelection()).toEqual({ anchor: "1. 中文".length, head: "1. 中文".length });

    controller.destroy();
  });

  it("keeps a bare blockquote marker visually unparsed until text commits it", async () => {
    const host = document.createElement("div");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });
    const advancedController = controller as typeof controller & {
      insertText: (text: string) => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    advancedController.setSelection(0);
    advancedController.insertText(">");
    await flushMicrotasks();

    const bareQuoteLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ">"
    );

    expect(controller.getContent()).toBe(">");
    expect(controller.getSelection()).toEqual({ anchor: 1, head: 1 });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(bareQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(false);
    expect(bareQuoteLine?.classList.contains("cm-inactive-blockquote-separator")).toBe(false);
    expect(bareQuoteLine?.querySelector(".cm-inactive-blockquote-marker")).toBeNull();
    expect(bareQuoteLine?.querySelector(".cm-active-blockquote-marker")).toBeNull();

    advancedController.insertText("quote");
    await flushMicrotasks();

    const committedQuoteLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ">quote"
    );

    expect(controller.getContent()).toBe(">quote");
    expect(controller.getSelection()).toEqual({ anchor: ">quote".length, head: ">quote".length });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(committedQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(committedQuoteLine?.querySelector(".cm-active-blockquote-marker")?.textContent).toBe(">");
    expect(committedQuoteLine?.querySelector(".cm-active-blockquote-padding-anchor")).toBeNull();

    controller.destroy();
  });

  it("commits a blockquote marker when Enter is pressed after the bare marker", async () => {
    const host = document.createElement("div");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "",
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });
    const advancedController = controller as typeof controller & {
      insertText: (text: string) => void;
      pressEnter: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    advancedController.setSelection(0);
    advancedController.insertText(">");
    await flushMicrotasks();
    advancedController.pressEnter();
    await flushMicrotasks();

    const expected = "> \n> ";
    const committedQuoteLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === "> "
    );

    expect(controller.getContent()).toBe(expected);
    expect(controller.getSelection()).toEqual({ anchor: expected.length, head: expected.length });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(committedQuoteLines).toHaveLength(2);
    expect(committedQuoteLines.at(-1)?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(committedQuoteLines.at(-1)?.querySelector(".cm-active-blockquote-marker")?.textContent).toBe(">");
    expect(committedQuoteLines.at(-1)?.querySelector(".cm-active-blockquote-padding-anchor")?.textContent).toBe(" ");

    controller.destroy();
  });

  it("keeps a nested blockquote marker visually unparsed until text commits it", async () => {
    const host = document.createElement("div");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "> ",
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });
    const advancedController = controller as typeof controller & {
      insertText: (text: string) => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    advancedController.setSelection(2);
    advancedController.insertText(">");
    await flushMicrotasks();

    const uncommittedNestedLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "> >"
    );

    expect(controller.getContent()).toBe("> >");
    expect(controller.getSelection()).toEqual({ anchor: 3, head: 3 });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(uncommittedNestedLine?.classList.contains("cm-inactive-blockquote-depth-1")).toBe(true);
    expect(uncommittedNestedLine?.classList.contains("cm-inactive-blockquote-depth-2")).toBe(false);
    expect(uncommittedNestedLine?.classList.contains("cm-inactive-blockquote-separator")).toBe(false);
    expect(uncommittedNestedLine?.querySelector(".cm-active-blockquote-marker")?.textContent).toBe("> ");
    expect(uncommittedNestedLine?.querySelector(".cm-active-blockquote-padding-anchor")).toBeNull();

    advancedController.insertText("child");
    await flushMicrotasks();

    const committedNestedLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "> >child"
    );

    expect(controller.getContent()).toBe("> >child");
    expect(controller.getSelection()).toEqual({ anchor: "> >child".length, head: "> >child".length });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(committedNestedLine?.classList.contains("cm-inactive-blockquote-depth-2")).toBe(true);
    expect(committedNestedLine?.querySelector(".cm-active-blockquote-marker")?.textContent).toBe("> >");
    expect(committedNestedLine?.querySelector(".cm-active-blockquote-padding-anchor")).toBeNull();

    controller.destroy();
  });

  it("commits a nested blockquote marker when Enter is pressed after the nested bare marker", async () => {
    const host = document.createElement("div");
    const activeBlockTypes: Array<string | null> = [];

    const controller = createCodeEditorController({
      parent: host,
      initialContent: "> ",
      onChange: vi.fn(),
      onActiveBlockChange: (state) => {
        activeBlockTypes.push(state.activeBlock?.type ?? null);
      }
    });
    const advancedController = controller as typeof controller & {
      insertText: (text: string) => void;
      pressEnter: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    advancedController.setSelection(2);
    advancedController.insertText(">");
    await flushMicrotasks();
    advancedController.pressEnter();
    await flushMicrotasks();

    const expected = "> > \n> > ";
    const committedNestedLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === "> > "
    );

    expect(controller.getContent()).toBe(expected);
    expect(controller.getSelection()).toEqual({ anchor: expected.length, head: expected.length });
    expect(activeBlockTypes.at(-1)).toBe("blockquote");
    expect(committedNestedLines).toHaveLength(2);
    expect(committedNestedLines.at(-1)?.classList.contains("cm-inactive-blockquote-depth-2")).toBe(true);
    expect(committedNestedLines.at(-1)?.querySelector(".cm-active-blockquote-marker")?.textContent).toBe("> >");
    expect(committedNestedLines.at(-1)?.querySelector(".cm-active-blockquote-padding-anchor")?.textContent).toBe(" ");

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

  it("renders a bare quote separator line inside an inactive blockquote", () => {
    const host = document.createElement("div");
    const source = [
      "> Target paragraph",
      ">",
      "> Explanation paragraph",
      "",
      "Plain paragraph"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });

    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.indexOf("Plain paragraph") } });

    const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
    const firstQuoteLine = getLineElementByText(host, "> Target paragraph");
    const separatorLine = lines.find((line) => line.textContent === ">") ?? null;
    const finalQuoteLine = getLineElementByText(host, "> Explanation paragraph");
    const quoteMarkers = host.querySelectorAll(".cm-inactive-blockquote-marker");

    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote-start")).toBe(true);
    expect(separatorLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(separatorLine?.classList.contains("cm-inactive-blockquote-start")).toBe(false);
    expect(separatorLine?.classList.contains("cm-inactive-blockquote-end")).toBe(false);
    expect(finalQuoteLine?.classList.contains("cm-inactive-blockquote-end")).toBe(true);
    expect(quoteMarkers).toHaveLength(3);
    expect(Array.from(quoteMarkers, (marker) => marker.textContent)).toEqual(["> ", ">", "> "]);

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
    expect(host.querySelectorAll(".cm-inactive-blockquote-marker")).toHaveLength(1);
    expect(host.querySelectorAll(".cm-active-blockquote-marker")).toHaveLength(1);

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

    expect(controller.getContent()).toBe(["> quote", ">", "> "].join("\n"));
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(controller.getContent().length);

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

    expect(controller.getContent()).toBe(["> > quote", "> > ", "> > "].join("\n"));
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(controller.getContent().length);

    controller.destroy();
  });

  it("continues a non-empty quote list item on Enter", () => {
    const host = document.createElement("div");
    const source = "> - item";
    const expected = ["> - item", "> - "].join("\n");

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

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

    controller.destroy();
  });

  it("upgrades an empty quote child list item to the parent list on Enter", () => {
    const host = document.createElement("div");
    const source = ["> - parent", ">   - "].join("\n");
    const expected = ["> - parent", "> - "].join("\n");

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

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

    controller.destroy();
  });

  it("keeps ordered numbering when an empty nested quote list item upgrades on Enter", () => {
    const host = document.createElement("div");
    const source = [
      "> 1. 111",
      "> 2. 333",
      ">   1. 222",
      ">     1. 1.1",
      ">     2. "
    ].join("\n");
    const expected = [
      "> 1. 111",
      "> 2. 333",
      ">   1. 222",
      ">     1. 1.1",
      ">   2. "
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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

    controller.destroy();
  });

  it("promotes an empty ordered quote list child on Enter and keeps parent numbering", () => {
    const host = document.createElement("div");
    const source = [
      "> 1. 111",
      "> 2. 333",
      ">    1. 222",
      ">       1. 1.1",
      ">       2."
    ].join("\n");
    const expected = [
      "> 1. 111",
      "> 2. 333",
      ">    1. 222",
      ">    2."
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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

    controller.destroy();
  });

  it("exits an empty top-level quote list item to quote body on Enter", () => {
    const host = document.createElement("div");
    const source = ["> - parent", "> - "].join("\n");
    const expected = ["> - parent", ">", "> "].join("\n");

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

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

    controller.destroy();
  });

  it("keeps only the current quote list line active while editing a quote list item", async () => {
    const host = document.createElement("div");
    const source = ["> - parent", "> - child", "> - sibling"].join("\n");

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
    view?.dispatch({ selection: { anchor: source.indexOf("child") } });
    await flushMicrotasks();

    const parentLine = getLineElementByText(host, "parent");
    const childLine = getLineElementByText(host, "child");
    const siblingLine = getLineElementByText(host, "sibling");

    expect(parentLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(parentLine?.querySelector(".cm-inactive-list-marker")?.textContent).toBe("-");
    expect(childLine?.classList.contains("cm-active-list")).toBe(true);
    expect(childLine?.querySelector(".cm-active-list-marker")?.textContent).toBe("-");
    expect(siblingLine?.classList.contains("cm-inactive-list")).toBe(true);
    expect(siblingLine?.querySelector(".cm-inactive-list-marker")?.textContent).toBe("-");

    controller.destroy();
  });

  it("removes a non-empty quote list marker on Backspace at content start", () => {
    const host = document.createElement("div");
    const source = ["> - 内容", "> - 内容2"].join("\n");
    const expected = ["> - 内容", "> 内容2"].join("\n");

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
    expect(view?.state.selection.main.anchor).toBe(expected.indexOf("内容2"));
    expect(view?.state.selection.main.head).toBe(expected.indexOf("内容2"));

    controller.destroy();
  });

  it("removes an empty nested quote list marker before clearing its indentation on Backspace", () => {
    const host = document.createElement("div");
    const source = ["> - parent", ">   - "].join("\n");
    const afterMarkerRemoval = ["> - parent", ">   "].join("\n");
    const afterFirstIndentRemoval = ["> - parent", ">  "].join("\n");
    const afterIndentRemoval = ["> - parent", "> "].join("\n");

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterMarkerRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterMarkerRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterMarkerRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterFirstIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterFirstIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterFirstIndentRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterIndentRemoval.length);

    controller.destroy();
  });

  it("breaks ordered quote list rendering from the current item on Backspace at content start", () => {
    const host = document.createElement("div");
    const source = ["> 1. 内容", "> 2. 内容2", "> 3. 内容3"].join("\n");
    const expected = ["> 1. 内容", ">", "> 2.内容2", "> 3. 内容3"].join("\n");

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

  it("indents and outdents quote list items with the same Tab commands as body lists", () => {
    const host = document.createElement("div");
    const source = ["> - parent", "> - child"].join("\n");
    const indented = ["> - parent", ">   - child"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressTab: (shiftKey?: boolean) => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.indexOf("child"));
    advancedController.pressTab();

    expect(controller.getContent()).toBe(indented);
    expect(view?.state.selection.main.anchor).toBe(indented.indexOf("child"));
    expect(view?.state.selection.main.head).toBe(indented.indexOf("child"));

    advancedController.pressTab(true);

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("child"));
    expect(view?.state.selection.main.head).toBe(source.indexOf("child"));

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

  it("creates an independent empty paragraph block on Enter at paragraph end", () => {
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
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("Alpha\n\n");
    expect(view?.state.selection.main.anchor).toBe("Alpha\n\n".length);
    expect(view?.state.selection.main.head).toBe("Alpha\n\n".length);

    controller.destroy();
  });

  it("creates a visible empty paragraph block on Enter at heading end and returns with one Backspace", async () => {
    const host = document.createElement("div");
    const source = "# Title";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
      pressEnter: () => void;
    };
    const editorRoot = host.querySelector(".cm-editor");
    const view = getEditorView(host);

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    await flushMicrotasks();

    const blankLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === ""
    );
    const activeBlankLine = blankLines.find((line) => !line.classList.contains("cm-inactive-blank-line"));

    expect(controller.getContent()).toBe(`${source}\n\n`);
    expect(view?.state.selection.main.anchor).toBe(`${source}\n\n`.length);
    expect(activeBlankLine).toBeDefined();

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.length);
    expect(view?.state.selection.main.head).toBe(source.length);

    controller.destroy();
  });

  it("keeps a heading visible after Enter when it sits above an ordered list gap", async () => {
    const host = document.createElement("div");
    const source = [
      "",
      "### Todo",
      "",
      "1. 脚注",
      "",
      "2. latex",
      "3. mermaid",
      "4. 源码模式",
      "-----",
      "",
      "### 其他待定功能",
      "",
      "1. 页面分栏"
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
    const editorRoot = host.querySelector(".cm-editor");
    const view = getEditorView(host);
    const headingEnd = source.indexOf("### Todo") + "### Todo".length;

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.setSelection(headingEnd);
    advancedController.pressEnter();
    await flushMicrotasks();

    const headingLine = getLineElementByText(host, "### Todo");
    const headingMarker = host.querySelector(".cm-inactive-heading-marker");
    const activeBlankLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === "" && line.classList.contains("cm-fm-line-active")
    );

    expect(controller.getContent()).toContain("### Todo\n\n\n\n1. 脚注");
    expect(headingLine).not.toBeNull();
    expect(headingLine?.classList.contains("cm-inactive-heading")).toBe(true);
    expect(headingLine?.classList.contains("cm-inactive-blank-line")).toBe(false);
    expect(headingMarker?.textContent).toBe("### ");
    expect(headingLine?.textContent).toContain("Todo");
    expect(activeBlankLine).toBeDefined();

    controller.destroy();
  });

  it("removes one repeated empty paragraph with one Backspace from consecutive trailing blank lines", async () => {
    const host = document.createElement("div");
    const source = "# Title";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
      pressEnter: () => void;
    };
    const editorRoot = host.querySelector(".cm-editor");
    const view = getEditorView(host);

    expect(editorRoot).toBeInstanceOf(HTMLElement);
    expect(view).not.toBeNull();

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();
    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    advancedController.pressEnter();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`${source}\n\n\n\n`);
    expect(view?.state.selection.main.anchor).toBe(`${source}\n\n\n\n`.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(`${source}\n\n`);
    expect(view?.state.selection.main.anchor).toBe(`${source}\n\n`.length);
    expect(view?.state.selection.main.head).toBe(`${source}\n\n`.length);

    controller.destroy();
  });

  it("creates a visible active empty paragraph block before an existing next line", () => {
    const host = document.createElement("div");
    const source = ["AAAAA", "BBBBB"].join("\n");
    const activeEmptyBlockStartAfterInsert = "AAAAA\n\n".length;

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

    expect(controller.getContent()).toBe(["AAAAA", "", "", "", "BBBBB"].join("\n"));
    expect(view?.state.selection.main.anchor).toBe(activeEmptyBlockStartAfterInsert);
    expect(view?.state.selection.main.head).toBe(activeEmptyBlockStartAfterInsert);

    controller.destroy();
  });

  it("creates an active empty paragraph block on Enter at an existing block start", () => {
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

    expect(controller.getContent()).toBe(["Alpha", "", "", "", "Beta"].join("\n"));
    expect(view?.state.selection.main.anchor).toBe("Alpha\n\n\n".length);
    expect(view?.state.selection.main.head).toBe("Alpha\n\n\n".length);

    controller.destroy();
  });

  it("creates an empty following block on Enter after an active thematic break", () => {
    const host = document.createElement("div");
    const source = "+++";

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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("+++\n\n");
    expect(view?.state.selection.main.anchor).toBe("+++\n\n".length);
    expect(view?.state.selection.main.head).toBe("+++\n\n".length);

    controller.destroy();
  });

  it("keeps a bare blockquote marker plain while focused and hides it after the cursor leaves the line", async () => {
    const host = document.createElement("div");
    const initialContent = [">", "", "Paragraph"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    advancedController.setSelection(1);
    await flushMicrotasks();

    const activeQuoteLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ">"
    );
    expect(controller.getContent()).toBe(initialContent);
    expect(activeQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(false);
    expect(activeQuoteLine?.classList.contains("cm-inactive-blockquote-separator")).toBe(false);
    expect(activeQuoteLine?.querySelector(".cm-inactive-blockquote-marker")).toBeNull();
    expect(activeQuoteLine?.querySelector(".cm-active-blockquote-marker")).toBeNull();

    advancedController.setSelection(initialContent.indexOf("Paragraph"));
    await flushMicrotasks();

    const inactiveQuoteLine = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).find(
      (line) => line.textContent === ">"
    );
    expect(controller.getContent()).toBe(initialContent);
    expect(inactiveQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(true);
    expect(inactiveQuoteLine?.querySelector(".cm-inactive-blockquote-marker")?.textContent).toBe(">");
    expect(inactiveQuoteLine?.querySelector(".cm-active-blockquote-marker")).toBeNull();

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

  it("outdents an empty nested blockquote line one level on Enter", () => {
    const host = document.createElement("div");
    const source = ["> > quote", "> > "].join("\n");
    const expected = ["> > quote", "> "].join("\n");

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

    expect(controller.getContent()).toBe(expected);
    expect(getEditorView(host)?.state.selection.main.anchor).toBe(expected.length);

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
    expect(host.querySelectorAll(".cm-inactive-blockquote-marker")).toHaveLength(1);
    expect(host.querySelectorAll(".cm-active-blockquote-marker")).toHaveLength(1);

    controller.destroy();
  });

  it("keeps the caret out of a quote-internal structural separator", async () => {
    const host = document.createElement("div");
    const source = ["> 11", ">", "> > 1"].join("\n");
    const separatorAnchor = source.indexOf("\n>\n") + 2;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    advancedController.setSelection(separatorAnchor);
    await flushMicrotasks();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.indexOf("\n>\n"));
    expect(view?.state.selection.main.head).toBe(source.indexOf("\n>\n"));

    controller.destroy();
  });

  it("keeps ArrowUp out of a quote-internal structural separator", async () => {
    const host = document.createElement("div");
    const source = ["> 1", ">", "> 222"].join("\n");
    const separatorAnchor = source.indexOf("\n>\n") + 2;
    // ArrowUp preserves the visible column, so the shorter previous quote line lands at line end.
    const expectedAnchor = source.indexOf("1") + "1".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    try {
      editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await flushMicrotasks();
      controller.setSelection(source.indexOf("222"));
      controller.pressArrowUp();
      await flushMicrotasks();

      expect(view?.state.selection.main.anchor).toBe(expectedAnchor);
      expect(view?.state.selection.main.head).toBe(expectedAnchor);
      expect(view?.state.selection.main.anchor).not.toBe(separatorAnchor);
    } finally {
      controller.destroy();
    }
  });

  it("deletes a quote-internal structural separator on Backspace from the next quote line start", async () => {
    const host = document.createElement("div");
    const source = ["> 11", ">", "> > 1"].join("\n");
    const expected = ["> 11", "> > 1"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const advancedController = controller as typeof controller & {
      pressBackspace: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    advancedController.setSelection(source.lastIndexOf("1"));
    await flushMicrotasks();
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.lastIndexOf("1"));
    expect(view?.state.selection.main.head).toBe(expected.lastIndexOf("1"));

    controller.destroy();
  });

  it("deletes a bare quote separator on Backspace at the following content start", async () => {
    const host = document.createElement("div");
    const source = ["> 11", ">", "> 222"].join("\n");
    const expected = "> 11222";

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const advancedController = controller as typeof controller & {
      pressBackspace: () => void;
      setSelection: (anchor: number, head?: number) => void;
    };
    const editorRoot = host.querySelector(".cm-editor");

    expect(view).not.toBeNull();
    expect(editorRoot).toBeInstanceOf(HTMLElement);

    editorRoot?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    advancedController.setSelection(source.indexOf("222"));
    await flushMicrotasks();
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe("> 11".length);
    expect(view?.state.selection.main.head).toBe("> 11".length);

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

  it("removes the blockquote marker when Backspace is pressed at the content start", () => {
    const host = document.createElement("div");
    const source = "> quote";

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

    expect(view).not.toBeNull();

    advancedController.setSelection("> ".length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("quote");
    expect(view?.state.selection.main.anchor).toBe(0);
    expect(view?.state.selection.main.head).toBe(0);

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

  it("deletes the marker for a first ordered item after paragraph text on Backspace at content start", () => {
    const host = document.createElement("div");
    const source = ["Intro", "1. first"].join("\n");
    const expected = ["Intro", "first"].join("\n");

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

    advancedController.setSelection(source.indexOf("first"));
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.indexOf("first"));
    expect(view?.state.selection.main.head).toBe(expected.indexOf("first"));

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

  it("splits a list item at the cursor and moves right-side text into the new sibling", () => {
    const host = document.createElement("div");
    const source = ["1. AlphaBeta", "2. Gamma"].join("\n");
    const expected = ["1. Alpha", "2. Beta", "3. Gamma"].join("\n");

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
    const cursor = source.indexOf("Beta");
    const expectedCursor = expected.indexOf("Beta");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

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

  it("upgrades an empty top-level ordered list item before later siblings to a body blank block", () => {
    const host = document.createElement("div");
    const source = ["1. Todo", "2. ", "3. Todo2", "4. Todo3"].join("\n");
    const expected = ["1. Todo", "", "3. Todo2", "4. Todo3"].join("\n");

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
    const expectedCursor = expected.indexOf("\n\n3. Todo2") + 1;

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

    expect(controller.getContent()).toBe("1. Todo\n\n");
    expect(view?.state.selection.main.anchor).toBe("1. Todo\n\n".length);
    expect(view?.state.selection.main.head).toBe("1. Todo\n\n".length);

    controller.destroy();
  });

  it("keeps input.list-exit when exiting a trailing empty top-level ordered item", () => {
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
    const userEvents: (string | undefined)[] = [];

    expect(view).not.toBeNull();

    const dispatch = view!.dispatch.bind(view) as (...transactions: unknown[]) => void;
    view!.dispatch = ((...transactions: unknown[]) => {
      dispatch(...transactions);

      for (const transaction of transactions) {
        if (transaction instanceof Transaction) {
          userEvents.push(transaction.annotation(Transaction.userEvent));
          continue;
        }

        if (!Array.isArray(transaction)) {
          userEvents.push((transaction as { userEvent?: string }).userEvent);
        }
      }
    }) as EditorView["dispatch"];

    advancedController.setSelection(emptyItemCursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe("1. Todo\n\n");
    expect(userEvents).toContain("input.list-exit");

    controller.destroy();
  });

  it("keeps the caret on the blank body line when exiting a trailing empty top-level item after nested children", () => {
    const host = document.createElement("div");
    const source = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC",
      "- "
    ].join("\n");
    const expected = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC",
      "",
      ""
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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.length);
    expect(view?.state.selection.main.head).toBe(expected.length);

    controller.destroy();
  });

  it("keeps the caret on the visible blank line when exiting an empty top-level item before following content", () => {
    const host = document.createElement("div");
    const source = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC",
      "- ",
      "",
      "After"
    ].join("\n");
    const expected = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC",
      "",
      "After"
    ].join("\n");
    const expectedBlankLineStart = expected.indexOf("\n\nAfter") + 1;

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

    advancedController.setSelection(source.indexOf("- \n\nAfter") + "- ".length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedBlankLineStart);
    expect(view?.state.selection.main.head).toBe(expectedBlankLineStart);

    controller.destroy();
  });

  it("keeps the caret below a deep nested list after repeated Enter exits", () => {
    const host = document.createElement("div");
    const source = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC"
    ].join("\n");
    const expected = [
      "# Test",
      "- List Content 1",
      "- List Content 2",
      "  - Child List Content",
      "    - CC",
      "",
      ""
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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    advancedController.pressEnter();
    advancedController.pressEnter();
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.length);
    expect(view?.state.selection.main.head).toBe(expected.length);

    controller.destroy();
  });

  it("starts body text at the left edge on a whitespace-only line after a list", async () => {
    const host = document.createElement("div");
    const source = [
      "- 1",
      "- 2",
      "1. 111",
      "2. 222",
      "  1. 333",
      "  2. 222",
      "    1. 111",
      "    2. 22",
      "3. 222",
      "   "
    ].join("\n");
    const expected = [
      "- 1",
      "- 2",
      "1. 111",
      "2. 222",
      "  1. 333",
      "  2. 222",
      "    1. 111",
      "    2. 22",
      "3. 222",
      "正文"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.length);

    advancedController.insertText("正文");

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.length);

    const bodyLine = getLineElementByText(host, "正文");
    expect(bodyLine?.classList.contains("cm-active-list")).toBe(false);
    expect(bodyLine?.classList.contains("cm-active-list-continuation")).toBe(false);

    controller.destroy();
  });

  it("keeps following body lines detached after typing below a list", async () => {
    const host = document.createElement("div");
    const source = ["- 11111", "- 22222", "  "].join("\n");
    const expected = ["- 11111", "- 22222", "111111", "1111"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.length);

    advancedController.insertText("111111");
    await flushMicrotasks();
    advancedController.pressEnter();
    await flushMicrotasks();
    advancedController.insertText("1111");

    expect(controller.getContent()).toBe(expected);

    const firstBodyLine = getLineElementByText(host, "111111");
    const secondBodyLine = getLineElementByText(host, "1111");

    expect(firstBodyLine?.classList.contains("cm-active-list")).toBe(false);
    expect(firstBodyLine?.classList.contains("cm-active-list-continuation")).toBe(false);
    expect(secondBodyLine?.classList.contains("cm-active-list")).toBe(false);
    expect(secondBodyLine?.classList.contains("cm-active-list-continuation")).toBe(false);

    controller.destroy();
  });

  it("keeps text typed after double Enter out of the previous list item", async () => {
    const host = document.createElement("div");
    const source = ["- 11111", "- 22222"].join("\n");
    const expectedAfterExit = ["- 11111", "- 22222", "", ""].join("\n");
    const expected = ["- 11111", "- 22222", "", "111111", "", "1111"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      insertText: (text: string) => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`${source}\n- `);

    advancedController.pressEnter();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(expectedAfterExit);
    expect(view?.state.selection.main.anchor).toBe(expectedAfterExit.length);

    advancedController.insertText("111111");
    await flushMicrotasks();
    advancedController.pressEnter();
    await flushMicrotasks();
    advancedController.insertText("1111");

    expect(controller.getContent()).toBe(expected);

    const firstBodyLine = getLineElementByText(host, "111111");
    const secondBodyLine = getLineElementByText(host, "1111");

    expect(firstBodyLine?.classList.contains("cm-active-list")).toBe(false);
    expect(firstBodyLine?.classList.contains("cm-active-list-continuation")).toBe(false);
    expect(secondBodyLine?.classList.contains("cm-active-list")).toBe(false);
    expect(secondBodyLine?.classList.contains("cm-active-list-continuation")).toBe(false);

    controller.destroy();
  });

  it("returns to the previous list item with one Backspace after exiting a list", async () => {
    const host = document.createElement("div");
    const source = ["- 11111", "- 22222"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressBackspace: () => void;
      pressEnter: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressEnter();
    await flushMicrotasks();
    advancedController.pressEnter();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`${source}\n\n`);
    expect(view?.state.selection.main.anchor).toBe(`${source}\n\n`.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(source);
    expect(view?.state.selection.main.anchor).toBe(source.length);
    expect(view?.state.selection.main.head).toBe(source.length);

    controller.destroy();
  });

  it("removes only one visible empty paragraph below an ordered list on Backspace", async () => {
    const host = document.createElement("div");
    const source = "1. 1\n\n\n\n";
    const previousVisibleEmptyLineStart = "1. 1\n\n".length;

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe("1. 1\n\n");
    expect(view?.state.selection.main.anchor).toBe(previousVisibleEmptyLineStart);
    expect(view?.state.selection.main.head).toBe(previousVisibleEmptyLineStart);

    controller.destroy();
  });

  it("returns to the whitespace-only line below an ordered list on Backspace", async () => {
    const host = document.createElement("div");
    const source = "1. 1\n   \n\n";
    const whitespaceLineEnd = "1. 1\n   ".length;

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();
    await flushMicrotasks();

    expect(controller.getContent()).toBe("1. 1\n   ");
    expect(view?.state.selection.main.anchor).toBe(whitespaceLineEnd);
    expect(view?.state.selection.main.head).toBe(whitespaceLineEnd);

    controller.destroy();
  });

  it("moves between visible empty paragraphs below an ordered list with one vertical arrow press", async () => {
    const host = document.createElement("div");
    const source = "1. 1\n\n\n\n";
    const previousVisibleEmptyLineStart = "1. 1\n\n".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressArrowDown: () => void;
      pressArrowUp: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressArrowUp();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(previousVisibleEmptyLineStart);

    advancedController.pressArrowDown();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.length);

    controller.destroy();
  });

  it("moves through the whitespace-only line below an ordered list with one vertical arrow press", async () => {
    const host = document.createElement("div");
    const source = "1. 1\n   \n\n";
    const whitespaceLineEnd = "1. 1\n   ".length;

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const advancedController = controller as typeof controller & {
      setSelection: (anchor: number, head?: number) => void;
      pressArrowDown: () => void;
      pressArrowUp: () => void;
    };
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    advancedController.setSelection(source.length);
    advancedController.pressArrowUp();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(whitespaceLineEnd);

    advancedController.pressArrowDown();
    await flushMicrotasks();

    expect(view?.state.selection.main.anchor).toBe(source.length);

    controller.destroy();
  });

  it("removes an empty top-level unordered marker on Backspace and keeps an empty line", () => {
    const host = document.createElement("div");
    const source = "- ";

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("");
    expect(view?.state.selection.main.anchor).toBe(0);
    expect(view?.state.selection.main.head).toBe(0);

    const line = host.querySelector<HTMLElement>(".cm-line");
    expect(line?.classList.contains("cm-active-list")).toBe(false);

    controller.destroy();
  });

  it("removes an empty top-level ordered marker on Backspace and keeps an empty line", () => {
    const host = document.createElement("div");
    const source = "1. ";

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe("");
    expect(view?.state.selection.main.anchor).toBe(0);
    expect(view?.state.selection.main.head).toBe(0);

    const line = host.querySelector<HTMLElement>(".cm-line");
    expect(line?.classList.contains("cm-active-list")).toBe(false);

    controller.destroy();
  });

  it("removes an empty nested unordered marker before clearing its indentation on Backspace", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - "].join("\n");
    const afterMarkerRemoval = ["- parent", "  "].join("\n");
    const afterFirstIndentRemoval = ["- parent", " "].join("\n");
    const afterIndentRemoval = "- parent\n";

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterMarkerRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterMarkerRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterMarkerRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterFirstIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterFirstIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterFirstIndentRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterIndentRemoval.length);

    controller.destroy();
  });

  it("removes an empty nested ordered marker before clearing its indentation on Backspace", () => {
    const host = document.createElement("div");
    const source = ["1. parent", "  1. "].join("\n");
    const afterMarkerRemoval = ["1. parent", "  "].join("\n");
    const afterFirstIndentRemoval = ["1. parent", " "].join("\n");
    const afterIndentRemoval = "1. parent\n";

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

    advancedController.setSelection(source.length);
    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterMarkerRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterMarkerRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterMarkerRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterFirstIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterFirstIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterFirstIndentRemoval.length);

    advancedController.pressBackspace();

    expect(controller.getContent()).toBe(afterIndentRemoval);
    expect(view?.state.selection.main.anchor).toBe(afterIndentRemoval.length);
    expect(view?.state.selection.main.head).toBe(afterIndentRemoval.length);

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

  it("upgrades a nested ordered item at content start without creating a blank line", () => {
    const host = document.createElement("div");
    const source = ["1. Parent", "  1. Child", "2. After"].join("\n");
    const expected = ["1. Parent", "2. Child", "3. After"].join("\n");

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
    const cursor = source.indexOf("Child");
    const expectedCursor = expected.indexOf("Child");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("upgrades a nested list item with children at content start", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - child", "    - grandchild", "- after"].join("\n");
    const expected = ["- parent", "- child", "  - grandchild", "- after"].join("\n");

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

  it("upgrades a top-level ordered item at content start into body text with a structural separator", () => {
    const host = document.createElement("div");
    const source = ["1. Previous", "2. Body"].join("\n");
    const expected = ["1. Previous", "", "Body"].join("\n");

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
    const cursor = source.indexOf("Body");
    const expectedCursor = expected.indexOf("Body");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expectedCursor);
    expect(view?.state.selection.main.head).toBe(expectedCursor);

    controller.destroy();
  });

  it("upgrades a top-level list item with children to body text", () => {
    const host = document.createElement("div");
    const source = ["- parent", "  - child", "- after"].join("\n");
    const expected = ["parent", "", "- child", "- after"].join("\n");

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
    const cursor = source.indexOf("parent");

    expect(view).not.toBeNull();

    advancedController.setSelection(cursor);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(0);
    expect(view?.state.selection.main.head).toBe(0);

    controller.destroy();
  });

  it("separates later top-level list siblings when upgrading a middle item to body text", () => {
    const host = document.createElement("div");
    const source = ["1. Previous", "2. Body", "3. After"].join("\n");
    const expected = ["1. Previous", "", "Body", "", "3. After"].join("\n");

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
    const cursor = source.indexOf("Body");
    const expectedCursor = expected.indexOf("Body");

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

    expect(controller.getContent()).toBe("- parent\n\n");
    expect(controller.getSelection()).toEqual({
      anchor: "- parent\n\n".length,
      head: "- parent\n\n".length
    });

    controller.destroy();
  });

  it("upgrades an empty nested ordered item on Enter without adding a blank line", () => {
    const host = document.createElement("div");
    const source = ["1. Parent", "  1. "].join("\n");
    const expected = ["1. Parent", "2. "].join("\n");

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

    advancedController.setSelection(source.length);
    advancedController.pressEnter();

    expect(controller.getContent()).toBe(expected);
    expect(view?.state.selection.main.anchor).toBe(expected.length);
    expect(view?.state.selection.main.head).toBe(expected.length);

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

  it("removes an empty ordered marker in the middle of a run without moving the caret to another item", () => {
    const host = document.createElement("div");
    const source = ["1. 1", "2. 2", "3. 4", "4. ", "5. 6", "6. 7"].join("\n");
    const expected = ["1. 1", "2. 2", "3. 4", "", "5. 6", "6. 7"].join("\n");

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
    const expectedCursor = getLineStartOffset(expected, 4);

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

  it("keeps a structural separator when exiting an empty task item at EOF", () => {
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

    expect(controller.getContent()).toBe("- [ ] todo\n\n");

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

  it("renders footnote labels inside inactive table cell previews", () => {
    const host = document.createElement("div");
    const source = [
      "| note | missing |",
      "| --- | --- |",
      "| [^first] | [^missing] |",
      "",
      "[^first]: table footnote"
    ].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const definedPreview = host.querySelector<HTMLElement>('[data-table-cell-preview="1:0"]');
    const missingPreview = host.querySelector<HTMLElement>('[data-table-cell-preview="1:1"]');

    expect(definedPreview?.querySelector(".cm-inactive-inline-footnote-reference")?.textContent).toBe("first");
    expect(definedPreview?.querySelectorAll(".cm-inactive-inline-marker")).toHaveLength(2);
    expect(missingPreview?.textContent).toBe("[^missing]");

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

  it("creates a structural separator and editable line when Enter exits from the last row at document end", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| A | B | C |", "| --- | --- | --- |", "|   |   |   |"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);
    const input = host.querySelector<HTMLInputElement>('[data-table-cell="1:2"]');

    expect(view).not.toBeNull();
    expect(input).toBeInstanceOf(HTMLElement);

    input?.focus();
    input?.setSelectionRange(0, 0);
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const blankLines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line")).filter(
      (line) => line.textContent === ""
    );

    expect(controller.getContent()).toBe(`${source}\n\n`);
    expect(document.activeElement).not.toBe(input);
    expect(view?.state.selection.main.anchor).toBe(controller.getContent().length);
    expect(blankLines).toHaveLength(2);
    expect(blankLines[0]?.classList.contains("cm-inactive-blank-line")).toBe(true);
    expect(blankLines[1]?.classList.contains("cm-inactive-blank-line")).toBe(false);

    dispatchEditorKeydown(view, "Backspace");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(`${source}\n\n`);
    expect(document.activeElement).toBe(host.querySelector('[data-table-cell="1:2"]'));

    controller.destroy();
    host.remove();
  });

  it("keeps Backspace editing text below a table instead of jumping into the last cell", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = ["| A | B | C |", "| --- | --- | --- |", "|   |   |   |", "", "---"].join("\n");

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn()
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view?.dispatch({ selection: { anchor: source.length, head: source.length } });
    await flushMicrotasks();

    dispatchEditorKeydown(view, "Backspace");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(controller.getContent()).toBe(source.slice(0, -1));
    expect(document.activeElement?.classList.contains("cm-table-widget-input")).toBe(false);

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
    const tableStart = getLineStartOffset(source, 15);
    const hiddenSeparatorBeforeTable = getLineStartOffset(source, 13);
    const previousVisibleBlankLineStart = getLineStartOffset(source, 12);

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

    expect(view!.state.selection.main.anchor).toBe(previousVisibleBlankLineStart);
    expect(view!.state.selection.main.anchor).not.toBe(hiddenSeparatorBeforeTable);
    expect(view!.state.selection.main.anchor).not.toBe(tableAdjacentBlankLineStart);

    view!.dispatch({
      selection: {
        anchor: tableStart,
        head: tableStart
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

    expect(view!.state.selection.main.anchor).toBe(previousVisibleBlankLineStart);
    expect(view!.state.selection.main.anchor).not.toBe(tableAdjacentBlankLineStart);

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
    const orderedExitSource = source.replace(
      "3. \n4. 有序列表第四项",
      "\n4. 有序列表第四项"
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
    expect(controller.getContent()).toBe(orderedExitSource);
    expect(view!.state.selection.main.anchor).toBe(
      orderedExitSource.indexOf("\n\n4. 有序列表第四项") + 1
    );

    controller.replaceDocument(source);
    advancedController.setSelection(source.indexOf("第三条引用内容"));
    advancedController.pressBackspace();
    expect(controller.getContent()).toBe(source);
    expect(view!.state.selection.main.anchor).toBe(source.indexOf("> 第三条引用内容") - 1);

    controller.destroy();
  });
});
