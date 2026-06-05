// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createFishMarkMarkdownExtensions } from "./markdown";
import { clearCodeHighlightCache } from "../decorations/code-highlight-cache";
import {
  clearCodeHighlightLanguageLoaderState,
  waitForPendingCodeHighlightLanguageLoads
} from "../decorations/code-highlight-language-loader";
import {
  TABLE_EDITING_SHORTCUT_GROUP,
  TEXT_EDITING_SHORTCUTS
} from "./markdown-shortcuts";

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

type HarnessOptions = {
  source: string;
  onContentChange?: (doc: string) => void;
  onActiveBlockChange?: (blockType: string | null, anchor: number) => void;
  onBlockDecorationsBuilt?: () => void;
  onOpenLink?: (href: string) => void;
  onBlur?: () => void;
  parseMarkdownDocument?: typeof parseMarkdownDocument;
  parseOrderedListNormalizationBlockMap?: typeof parseMarkdownDocument;
};

const createHarness = (options: HarnessOptions) => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const view = new EditorView({
    state: EditorState.create({
      doc: options.source,
      extensions: createFishMarkMarkdownExtensions({
        parseMarkdownDocument: options.parseMarkdownDocument ?? parseMarkdownDocument,
        parseOrderedListNormalizationBlockMap: options.parseOrderedListNormalizationBlockMap,
        onContentChange: options.onContentChange ?? vi.fn(),
        onActiveBlockChange: (state) => {
          options.onActiveBlockChange?.(state.activeBlock?.type ?? null, state.selection.anchor);
        },
        onBlockDecorationsBuilt: options.onBlockDecorationsBuilt,
        onOpenLink: options.onOpenLink,
        onBlur: options.onBlur
      } as Parameters<typeof createFishMarkMarkdownExtensions>[0] & {
        onBlockDecorationsBuilt?: () => void;
        onOpenLink?: (href: string) => void;
      })
    }),
    parent: host
  });

  return {
    host,
    view,
    destroy() {
      view.destroy();
      host.remove();
    }
  };
};

describe("createFishMarkMarkdownExtensions", () => {
  it("calls onContentChange when the document changes", () => {
    const onContentChange = vi.fn();
    const { view, destroy } = createHarness({
      source: "# Title\n",
      onContentChange
    });

    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: "Paragraph"
      }
    });

    expect(onContentChange).toHaveBeenCalledWith("# Title\nParagraph");

    destroy();
  });

  it("reports active-block changes on mount and selection updates", () => {
    const activeBlocks: Array<{ blockType: string | null; anchor: number }> = [];
    const source = ["# Title", "", "Paragraph"].join("\n");
    const { view, destroy } = createHarness({
      source,
      onActiveBlockChange: (blockType, anchor) => {
        activeBlocks.push({ blockType, anchor });
      }
    });

    expect(activeBlocks).toEqual([{ blockType: "heading", anchor: 0 }]);

    view.dispatch({
      selection: {
        anchor: source.indexOf("Paragraph")
      }
    });

    expect(activeBlocks).toEqual([
      { blockType: "heading", anchor: 0 },
      { blockType: "paragraph", anchor: source.indexOf("Paragraph") }
    ]);

    destroy();
  });

  it("uses at most one Markdown document parse for a single document change", () => {
    const source = "# Title\n\nParagraph";
    const parseSpy = vi.fn(parseMarkdownDocument);
    const { view, destroy } = createHarness({
      source,
      parseMarkdownDocument: parseSpy
    });

    parseSpy.mockClear();

    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: " updated"
      }
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);

    destroy();
  });

  it("does not parse the Markdown document again for selection-only updates", () => {
    const source = "# Title\n\nParagraph";
    const parseSpy = vi.fn(parseMarkdownDocument);
    const { view, destroy } = createHarness({
      source,
      parseMarkdownDocument: parseSpy
    });

    parseSpy.mockClear();

    view.dispatch({
      selection: {
        anchor: source.indexOf("Paragraph")
      }
    });

    expect(parseSpy).not.toHaveBeenCalled();

    destroy();
  });

  it("does not parse ordered-list normalization block maps for non-list document changes", () => {
    const source = "Paragraph";
    const parseOrderedListNormalizationBlockMap = vi.fn(parseMarkdownDocument);
    const { view, destroy } = createHarness({
      source,
      parseOrderedListNormalizationBlockMap
    });

    view.dispatch({
      changes: {
        from: source.length,
        insert: " updated"
      }
    });

    expect(parseOrderedListNormalizationBlockMap).not.toHaveBeenCalled();

    destroy();
  });

  it("updates active block presentation without rebuilding all decorations on selection-only block changes", async () => {
    const source = "# Title\n\nParagraph";
    const onBlockDecorationsBuilt = vi.fn();
    const { host, view, destroy } = createHarness({
      source,
      onBlockDecorationsBuilt
    });
    view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    expect(host.querySelector(".cm-inactive-heading-marker")).toBeNull();

    onBlockDecorationsBuilt.mockClear();

    view.dispatch({
      selection: {
        anchor: source.indexOf("Paragraph")
      }
    });

    expect(host.querySelector(".cm-inactive-heading-marker")).toBeInstanceOf(HTMLElement);
    expect(host.querySelector(".cm-active-paragraph")).toBeInstanceOf(HTMLElement);
    expect(onBlockDecorationsBuilt).not.toHaveBeenCalled();

    destroy();
  });

  it("updates active list line presentation without rebuilding all decorations on selection-only line changes", async () => {
    const source = ["- first", "  continued", "- second"].join("\n");
    const onBlockDecorationsBuilt = vi.fn();
    const { host, view, destroy } = createHarness({
      source,
      onBlockDecorationsBuilt
    });
    view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    onBlockDecorationsBuilt.mockClear();

    view.dispatch({
      selection: {
        anchor: source.indexOf("continued")
      }
    });

    const activeContinuation = Array.from(host.querySelectorAll<HTMLElement>(".cm-active-list-source-prefix"))
      .some((element) => element.textContent === "  ");

    expect(activeContinuation).toBe(true);
    expect(onBlockDecorationsBuilt).not.toHaveBeenCalled();

    destroy();
  });

  it("updates physical active line classes on selection-only line changes", async () => {
    const source = ["First", "Second"].join("\n");
    const onBlockDecorationsBuilt = vi.fn();
    const { host, view, destroy } = createHarness({
      source,
      onBlockDecorationsBuilt
    });
    view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    onBlockDecorationsBuilt.mockClear();

    view.dispatch({
      selection: {
        anchor: source.indexOf("Second")
      }
    });

    const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));

    expect(lines[0]?.classList.contains("cm-fm-line-active")).toBe(false);
    expect(lines[1]?.classList.contains("cm-fm-line-active")).toBe(true);
    expect(onBlockDecorationsBuilt).not.toHaveBeenCalled();

    destroy();
  });

  it("refreshes decorations after a lazy code fence parser chunk loads", async () => {
    clearCodeHighlightCache();
    clearCodeHighlightLanguageLoaderState();
    const source = ["```js", "const answer = 42;", "```"].join("\n");
    const onBlockDecorationsBuilt = vi.fn();
    const { destroy } = createHarness({
      source,
      onBlockDecorationsBuilt
    });
    const initialBuildCount = onBlockDecorationsBuilt.mock.calls.length;

    await waitForPendingCodeHighlightLanguageLoads();
    await flushMicrotasks();

    expect(onBlockDecorationsBuilt.mock.calls.length).toBeGreaterThan(initialBuildCount);

    destroy();
  });

  it("defers derived-state recompute until compositionend", () => {
    const activeBlocks: Array<{ blockType: string | null; anchor: number }> = [];
    const source = "Paragraph";
    const { view, destroy } = createHarness({
      source,
      onActiveBlockChange: (blockType, anchor) => {
        activeBlocks.push({ blockType, anchor });
      }
    });

    dispatchCompositionEvent(view.dom, "compositionstart", "x");

    view.dispatch({
      changes: {
        from: source.length,
        insert: "x"
      },
      selection: {
        anchor: source.length + 1
      }
    });

    expect(view.state.doc.toString()).toBe("Paragraphx");
    expect(activeBlocks).toEqual([{ blockType: "paragraph", anchor: 0 }]);

    dispatchCompositionEvent(view.dom, "compositionend", "x");

    expect(activeBlocks).toEqual([
      { blockType: "paragraph", anchor: 0 },
      { blockType: "paragraph", anchor: source.length + 1 }
    ]);

    destroy();
  });

  it("keeps direct Chinese insert after a bare dash as paragraph text", () => {
    const source = "-";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    view.dispatch({
      changes: {
        from: source.length,
        insert: "中"
      },
      selection: {
        anchor: source.length + 1,
        head: source.length + 1
      }
    });

    expect(view.state.doc.toString()).toBe("-中");
    expect(view.state.selection.main.anchor).toBe("-中".length);
    expect(view.state.selection.main.head).toBe("-中".length);

    destroy();
  });

  it("keeps direct Chinese insert after a bare ordered marker as paragraph text", () => {
    const source = "1.";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    view.dispatch({
      changes: {
        from: source.length,
        insert: "中"
      },
      selection: {
        anchor: source.length + 1,
        head: source.length + 1
      }
    });

    expect(view.state.doc.toString()).toBe("1.中");
    expect(view.state.selection.main.anchor).toBe("1.中".length);
    expect(view.state.selection.main.head).toBe("1.中".length);

    destroy();
  });

  it("deletes a committed unordered marker in one Backspace at the content start", () => {
    const source = "- content";
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("content");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("content");
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);

    destroy();
  });

  it("deletes a committed ordered marker in one Backspace at the content start", () => {
    const source = "1. content";
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("content");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("content");
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);

    destroy();
  });

  it("deletes a committed task marker in one Backspace at the content start", () => {
    const source = "- [ ] content";
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("content");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("content");
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);

    destroy();
  });

  it("deletes a committed empty task marker in one Backspace", () => {
    const source = "- [ ] ";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("");
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);

    destroy();
  });

  it("deletes a committed empty checked task marker in one Backspace", () => {
    const source = "- [x] ";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe("");
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);

    destroy();
  });

  it("deletes a middle unordered marker without exposing raw marker source", () => {
    const source = ["- first", "- second"].join("\n");
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("second");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(["- first", "second"].join("\n"));
    expect(view.state.doc.toString()).not.toContain("-second");
    expect(view.state.selection.main.anchor).toBe(["- first", ""].join("\n").length);
    expect(view.state.selection.main.head).toBe(["- first", ""].join("\n").length);

    destroy();
  });

  it("detaches a middle ordered item while preserving its visible marker text", () => {
    const source = ["1. first", "2. second", "3. third"].join("\n");
    const expected = ["1. first", "", "2.second", "3. third"].join("\n");
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("second");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(expected);
    expect(view.state.selection.main.anchor).toBe(expected.indexOf("2.") + "2.".length);
    expect(view.state.selection.main.head).toBe(expected.indexOf("2.") + "2.".length);

    destroy();
  });

  it("deletes a middle task marker without exposing raw marker source", () => {
    const source = ["- [ ] first", "- [x] second", "- [ ] third"].join("\n");
    const { view, destroy } = createHarness({ source });
    const contentStart = source.indexOf("second");

    view.dispatch({
      selection: {
        anchor: contentStart,
        head: contentStart
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(["- [ ] first", "second", "- [ ] third"].join("\n"));
    expect(view.state.doc.toString()).not.toContain("- [x]second");
    expect(view.state.selection.main.anchor).toBe(["- [ ] first", ""].join("\n").length);
    expect(view.state.selection.main.head).toBe(["- [ ] first", ""].join("\n").length);

    destroy();
  });

  it("refreshes inactive decorations across blur and focus transitions", async () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const onBlur = vi.fn();
    const { host, view, destroy } = createHarness({
      source,
      onBlur
    });

    const getHeadingMarker = () => host.querySelector(".cm-inactive-heading-marker");

    view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    view.dispatch({
      selection: {
        anchor: source.indexOf("Title")
      }
    });

    expect(getHeadingMarker()).toBeNull();

    view.dom.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await flushMicrotasks();

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(getHeadingMarker()).not.toBeNull();

    view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await flushMicrotasks();

    expect(getHeadingMarker()).toBeNull();

    destroy();
  });

  it("opens an inactive link on Mod-click without moving the editor selection", () => {
    const source = ["[FishMark](https://fishmark.app)", "", "Paragraph"].join("\n");
    const onOpenLink = vi.fn();
    const { host, view, destroy } = createHarness({
      source,
      onOpenLink
    });
    const paragraphOffset = source.indexOf("Paragraph");

    view.dispatch({ selection: { anchor: paragraphOffset, head: paragraphOffset } });
    const inactiveLink = host.querySelector<HTMLElement>(".cm-inactive-inline-link");

    expect(inactiveLink).toBeInstanceOf(HTMLElement);

    inactiveLink?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );

    expect(onOpenLink).toHaveBeenCalledWith("https://fishmark.app");
    expect(view.state.selection.main.anchor).toBe(paragraphOffset);

    destroy();
  });

  it("opens the link under the cursor on Mod-Enter", () => {
    const source = "[FishMark](https://fishmark.app)";
    const onOpenLink = vi.fn();
    const { view, destroy } = createHarness({
      source,
      onOpenLink
    });

    view.dispatch({ selection: { anchor: source.indexOf("Mark") } });
    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        ctrlKey: true
      })
    );

    expect(handled).toBe(false);
    expect(onOpenLink).toHaveBeenCalledWith("https://fishmark.app");

    destroy();
  });

  it("does not fire onBlur when focus moves between table cells inside the editor", async () => {
    const onBlur = vi.fn();
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const { host, view, destroy } = createHarness({
      source,
      onBlur
    });

    const firstInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const secondInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    expect(firstInput).toBeInstanceOf(HTMLElement);
    expect(secondInput).toBeInstanceOf(HTMLElement);

    firstInput?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    firstInput?.dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: secondInput
      })
    );
    secondInput?.dispatchEvent(
      new FocusEvent("focusin", {
        bubbles: true,
        relatedTarget: firstInput
      })
    );
    await flushMicrotasks();

    expect(onBlur).not.toHaveBeenCalled();

    view.dom.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await flushMicrotasks();
    expect(onBlur).toHaveBeenCalledTimes(1);

    destroy();
  });

  it("toggles strong on Mod-b", () => {
    const source = "alpha bold beta";
    const { view, destroy } = createHarness({ source });
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    const strongShortcut = TEXT_EDITING_SHORTCUTS.find(
      ({ id }) => id === "toggle-strong"
    );

    expect(strongShortcut).toBeDefined();

    const keyEvent = new KeyboardEvent("keydown", {
      key: strongShortcut?.key.slice(-1).toLowerCase() ?? "b",
      code: "KeyB",
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    });
    view.contentDOM.dispatchEvent(keyEvent);

    expect(view.state.doc.toString()).toBe("alpha **bold** beta");

    destroy();
  });

  it("toggles a heading on Mod-2", () => {
    const source = "Paragraph";
    const { view, destroy } = createHarness({ source });
    view.dispatch({ selection: { anchor: 0 } });
    const headingShortcut = TEXT_EDITING_SHORTCUTS.find(
      ({ id }) => id === "toggle-heading-2"
    );

    expect(headingShortcut).toBeDefined();

    const keyEvent = new KeyboardEvent("keydown", {
      key: headingShortcut?.key.slice(-1) ?? "2",
      code: "Digit2",
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    });
    view.contentDOM.dispatchEvent(keyEvent);

    expect(view.state.doc.toString()).toBe("## Paragraph");

    destroy();
  });

  it("registers table shortcut bindings from the grouped catalog", () => {
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const { view, destroy } = createHarness({ source });

    const tableShortcutKeys = TABLE_EDITING_SHORTCUT_GROUP.shortcuts.map(({ key }) => key);

    tableShortcutKeys.forEach((key) => {
      const handled = view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: key === "Tab" ? "Tab" : key === "Shift-Tab" ? "Tab" : "Enter",
          code: key === "Mod-Enter" ? "Enter" : "Tab",
          bubbles: true,
          cancelable: true,
          ctrlKey: key === "Mod-Enter",
          shiftKey: key === "Shift-Tab"
        })
      );

      expect(handled).toBe(false);
    });

    destroy();
  });

  it("enters the adjacent table from the line above on ArrowDown", async () => {
    const source = ["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const activeBlocks: Array<{ blockType: string | null; anchor: number }> = [];
    const { host, view, destroy } = createHarness({
      source,
      onActiveBlockChange: (blockType, anchor) => {
        activeBlocks.push({ blockType, anchor });
      }
    });

    view.dispatch({ selection: { anchor: source.indexOf("\n\n") + 1 } });

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();

    const input = host.querySelector<HTMLInputElement>('[data-table-cell="0:0"]');

    expect(activeBlocks.at(-1)).toEqual({
      blockType: "table",
      anchor: view.state.selection.main.anchor
    });
    expect(document.activeElement).toBe(input);

    destroy();
  });

  it("moves ArrowDown from a paragraph end across a collapsed structural blank to the next paragraph end", async () => {
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: "Paragraph one".length,
        head: "Paragraph one".length
      }
    });

    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        bubbles: true,
        cancelable: true
      })
    );
    await flushMicrotasks();

    expect(view.state.selection.main.anchor).toBe(source.length);
    expect(view.state.selection.main.head).toBe(source.length);

    destroy();
  });

  it("keeps selection out of a quote-internal structural separator", () => {
    const source = ["> 11", ">", "> > 1"].join("\n");
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.indexOf("\n>\n") + 2,
        head: source.indexOf("\n>\n") + 2
      }
    });

    expect(view.state.selection.main.anchor).toBe(source.indexOf("\n>\n"));
    expect(view.state.selection.main.head).toBe(source.indexOf("\n>\n"));

    destroy();
  });

  it("normalizes ArrowUp away from a quote-internal structural separator", async () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const { view, destroy } = createHarness({ source });
    const separatorAnchor = source.indexOf("\n>\n") + 2;
    // ArrowUp preserves the visible column, so the shorter previous quote line lands at line end.
    const expectedAnchor = source.indexOf("1") + "1".length;

    try {
      view.dispatch({
        selection: {
          anchor: source.indexOf("222"),
          head: source.indexOf("222")
        }
      });

      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          bubbles: true,
          cancelable: true
        })
      );
      await flushMicrotasks();

      expect(view.state.selection.main.anchor).toBe(expectedAnchor);
      expect(view.state.selection.main.head).toBe(expectedAnchor);
      expect(view.state.selection.main.anchor).not.toBe(separatorAnchor);
    } finally {
      destroy();
    }
  });

  it("moves ArrowDown across a quote-internal structural separator", async () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const { view, destroy } = createHarness({ source });
    const separatorAnchor = source.indexOf("\n>\n") + 2;

    try {
      view.dispatch({
        selection: {
          anchor: source.indexOf("1"),
          head: source.indexOf("1")
        }
      });

      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true
        })
      );
      await flushMicrotasks();

      expect(view.state.selection.main.anchor).toBe(source.indexOf("222"));
      expect(view.state.selection.main.anchor).not.toBe(separatorAnchor);
    } finally {
      destroy();
    }
  });

  it("moves vertically across a multi-line quote-internal structural separator", async () => {
    const source = ["> one", "> two", ">", "> three"].join("\n");
    const { view, destroy } = createHarness({ source });
    const separatorAnchor = source.indexOf("\n>\n") + 2;
    const twoAnchor = source.indexOf("two");
    const twoLineEndAnchor = twoAnchor + "two".length;
    const threeAnchor = source.indexOf("three");

    try {
      view.dispatch({
        selection: {
          anchor: twoAnchor,
          head: twoAnchor
        }
      });

      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: true,
          cancelable: true
        })
      );
      await flushMicrotasks();

      expect(view.state.selection.main.anchor).toBe(threeAnchor);
      expect(view.state.selection.main.head).toBe(threeAnchor);
      expect(view.state.selection.main.anchor).not.toBe(separatorAnchor);

      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          bubbles: true,
          cancelable: true
        })
      );
      await flushMicrotasks();

      expect(view.state.selection.main.anchor).toBe(twoLineEndAnchor);
      expect(view.state.selection.main.head).toBe(twoLineEndAnchor);
      expect(view.state.selection.main.anchor).not.toBe(separatorAnchor);
    } finally {
      destroy();
    }
  });

  it("keeps a trailing editable empty quote line selectable", () => {
    const source = ["> alpha", ">", "> "].join("\n");
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    expect(view.state.selection.main.anchor).toBe(source.length);
    expect(view.state.selection.main.head).toBe(source.length);

    destroy();
  });

  it.each(["input.type", "input.type.compose"])(
    "does not run structural blank normalization for %s transactions",
    (userEvent) => {
      const source = ["Paragraph one", "", "Paragraph two"].join("\n");
      const { view, destroy } = createHarness({ source });
      const blankLineStartAfterInsert = "xParagraph one\n".length;

      view.dispatch({
        changes: {
          from: 0,
          insert: "x"
        },
        selection: {
          anchor: blankLineStartAfterInsert,
          head: blankLineStartAfterInsert
        },
        userEvent
      });

      expect(view.state.doc.toString()).toBe(`x${source}`);
      expect(view.state.selection.main.anchor).toBe(blankLineStartAfterInsert);
      expect(view.state.selection.main.head).toBe(blankLineStartAfterInsert);

      destroy();
    }
  );

  it("repairs hidden inline marker selection after a single-line paste transaction", () => {
    const source = "**bold**";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      changes: {
        from: source.length,
        insert: "!"
      },
      selection: {
        anchor: 1,
        head: 1
      },
      userEvent: "input.paste"
    });

    expect(view.state.doc.toString()).toBe("**bold**!");
    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(2);

    destroy();
  });

  it("materializes a draft pipe-table header when Enter is pressed at line end", () => {
    const source = "| a | b | c |";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(
      ["| a | b | c |", "| :--- | :--- | :--- |", "|   |   |   |"].join("\n")
    );

    destroy();
  });

  it("materializes a compact draft pipe-table header without spaces when Enter is pressed", () => {
    const source = "|A|B|C|";
    const { view, destroy } = createHarness({ source });

    view.dispatch({
      selection: {
        anchor: source.length
      }
    });

    const handled = view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(
      ["| A | B | C |", "| :--- | :--- | :--- |", "|   |   |   |"].join("\n")
    );

    destroy();
  });

  it("normalizes ordered-list numbering through minimal document changes instead of replacing the whole document", () => {
    const source = ["1. one", "2. two", "", "3. three", "4. four"].join("\n");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const transactions: import("@codemirror/state").Transaction[] = [];

    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: createFishMarkMarkdownExtensions({
          parseMarkdownDocument,
          onContentChange: vi.fn()
        })
      }),
      parent: host,
      dispatchTransactions: (trs, editorView) => {
        transactions.push(...trs);
        editorView.update(trs);
      }
    });

    view.dispatch({
      changes: {
        from: source.indexOf("three"),
        to: source.indexOf("three") + "three".length,
        insert: "third"
      }
    });

    const changedRanges: Array<{ fromA: number; toA: number; fromB: number; toB: number }> = [];
    const normalizationTransaction = [...transactions].reverse().find((transaction) => transaction.docChanged);

    normalizationTransaction?.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      changedRanges.push({ fromA, toA, fromB, toB });
    }, true);

    expect(view.state.doc.toString()).toBe(["1. one", "2. two", "", "3. third", "4. four"].join("\n"));
    expect(changedRanges).not.toEqual([
      {
        fromA: 0,
        toA: normalizationTransaction?.startState.doc.length ?? source.length,
        fromB: 0,
        toB: normalizationTransaction?.newDoc.length ?? view.state.doc.length
      }
    ]);

    view.destroy();
    host.remove();
  });
});
