// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createYuloraMarkdownExtensions } from "./markdown";
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
  onBlur?: () => void;
};

const createHarness = (options: HarnessOptions) => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const view = new EditorView({
    state: EditorState.create({
      doc: options.source,
      extensions: createYuloraMarkdownExtensions({
        parseMarkdownDocument,
        onContentChange: options.onContentChange ?? vi.fn(),
        onActiveBlockChange: (state) => {
          options.onActiveBlockChange?.(state.activeBlock?.type ?? null, state.selection.anchor);
        },
        onBlur: options.onBlur
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

describe("createYuloraMarkdownExtensions", () => {
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

  it("does not fire onBlur when focus moves between table cells inside the editor", async () => {
    const onBlur = vi.fn();
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const { host, view, destroy } = createHarness({
      source,
      onBlur
    });

    const firstInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');
    const secondInput = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    expect(firstInput).toBeInstanceOf(HTMLInputElement);
    expect(secondInput).toBeInstanceOf(HTMLInputElement);

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
        extensions: createYuloraMarkdownExtensions({
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

    expect(view.state.doc.toString()).toBe(["1. one", "2. two", "", "1. third", "2. four"].join("\n"));
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
