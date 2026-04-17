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

  it("renders inactive inline decorations for paragraph content and restores the raw markdown when the block becomes active again", async () => {
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
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strong")).toBe(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-emphasis")).toBe(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-code")).toBe(0);
    expect(getInlineDecorationCount(inactiveLine, "cm-inactive-inline-strikethrough")).toBe(0);

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

  it("removes inactive paragraph decorations when that paragraph becomes active again", async () => {
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

  it("removes inactive blockquote decorations when that blockquote becomes active again", async () => {
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

    expect(firstQuoteLine).not.toBeNull();
    expect(firstQuoteLine?.classList.contains("cm-inactive-blockquote")).toBe(false);
    expect(host.querySelector(".cm-inactive-blockquote-marker")).toBeNull();

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

  it("restores fenced code block markdown when the code block becomes active again", async () => {
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

    view?.dispatch({ selection: { anchor: source.indexOf("const answer") } });

    const openingFenceLine = getLineElementByText(host, "```ts");
    const codeLine = getLineElementByText(host, "const answer = 42;");

    expect(openingFenceLine).not.toBeNull();
    expect(openingFenceLine?.classList.contains("cm-inactive-code-block-fence")).toBe(false);
    expect(codeLine).not.toBeNull();
    expect(codeLine?.classList.contains("cm-inactive-code-block")).toBe(false);

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

  it("reveals the whole fenced code block and places the caret at the end of the last code line when Backspace is pressed from the separator below it", async () => {
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
    expect(host.querySelector(".cm-inactive-code-block")).toBeNull();
    expect(host.querySelector(".cm-inactive-code-block-fence")).toBeNull();

    controller.destroy();
  });

  it("deletes code content instead of the closing fence when Backspace is pressed twice from below a fenced code block", async () => {
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
    expect(host.querySelector(".cm-inactive-code-block")).toBeNull();
    expect(host.querySelector(".cm-inactive-code-block-fence")).toBeNull();
    expect(getLineElementByText(host, "code bloc")).not.toBeNull();

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
});
