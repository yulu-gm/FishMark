// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createYuloraMarkdownExtensions } from "./markdown";
import { TEXT_EDITING_SHORTCUTS } from "./markdown-shortcuts";

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
});
