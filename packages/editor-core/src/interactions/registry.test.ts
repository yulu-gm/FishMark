// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument, type ActiveBlockState } from "../active-block";
import { deriveTableCursorState } from "../table-cursor-state";
import { resolveArrowDown, resolveArrowUp, resolvePointerSelectionAnchor } from "./registry";

const views: EditorView[] = [];

function createVerticalNavigationHarness(source: string, anchor: number): {
  activeState: ActiveBlockState;
  view: EditorView;
} {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: source
    }),
    parent
  });
  const selection = { anchor, head: anchor };
  const markdownDocument = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromMarkdownDocument(markdownDocument, selection);

  activeState.tableCursor = deriveTableCursorState(source, selection, markdownDocument, null);
  view.dispatch({ selection });
  views.push(view);

  return {
    activeState,
    view
  };
}

describe("block interaction registry", () => {
  afterEach(() => {
    for (const view of views.splice(0)) {
      view.dom.remove();
      view.destroy();
    }
  });

  it("handles ArrowDown as a no-op from a paragraph below a table when there is no lower block", () => {
    const source = [
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files. |",
      "",
      "Right aligned columns"
    ].join("\n");
    const paragraphStart = source.indexOf("Right aligned columns");
    const { activeState, view } = createVerticalNavigationHarness(source, paragraphStart);

    expect(resolveArrowDown(view, activeState)).toEqual({
      anchor: paragraphStart,
      goalColumn: undefined
    });
  });

  it("handles ArrowDown from the first paragraph line below a table before default geometry navigation", () => {
    const source = [
      "| Option | Description |",
      "| --- | --- |",
      "| data | path to data files. |",
      "",
      "Right aligned columns",
      "Next paragraph line"
    ].join("\n");
    const paragraphStart = source.indexOf("Right aligned columns");
    const { activeState, view } = createVerticalNavigationHarness(source, paragraphStart);

    expect(resolveArrowDown(view, activeState)).toEqual({
      anchor: source.indexOf("Next paragraph line"),
      goalColumn: 0
    });
  });

  it("moves ArrowDown from a paragraph below one table into the following table", () => {
    const source = [
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
    const paragraphStart = source.indexOf("Right aligned columns");
    const followingTableStart = source.indexOf("| Right | Amount |");
    const { activeState, view } = createVerticalNavigationHarness(source, paragraphStart);

    expect(resolveArrowDown(view, activeState)).toEqual({
      anchor: source.indexOf("Right", followingTableStart),
      goalColumn: undefined
    });
  });

  it("lets native ArrowUp geometry enter a visible whitespace-only physical line", () => {
    const source = ["A", "   ", "B"].join("\n");
    const paragraphStart = source.indexOf("B");
    const { activeState, view } = createVerticalNavigationHarness(source, paragraphStart);

    expect(resolveArrowUp(view, activeState)).toBeNull();
  });

  it("uses elementFromPoint to resolve pointer selection when drag events target the document", () => {
    const source = ["Paragraph", "- item"].join("\n");
    const { activeState, view } = createVerticalNavigationHarness(source, 0);
    const listLine = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-line")).find((line) =>
      line.textContent?.includes("- item")
    );

    expect(listLine).toBeInstanceOf(HTMLElement);
    listLine!.classList.add("cm-inactive-list", "cm-inactive-list-unordered", "cm-inactive-list-depth-0");
    listLine!.style.paddingLeft = "24px";

    const documentWithElementFromPoint = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = documentWithElementFromPoint.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => listLine
    });

    try {
      const event = new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 1,
        clientY: 1
      });

      expect(resolvePointerSelectionAnchor(view, activeState, event)).toBe(source.indexOf("- item"));
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, "elementFromPoint", {
          configurable: true,
          value: originalElementFromPoint
        });
      } else {
        Reflect.deleteProperty(documentWithElementFromPoint, "elementFromPoint");
      }
    }
  });
});
