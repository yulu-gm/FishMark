// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { toggleEmphasis, toggleStrong } from "./toggle-inline-commands";

const createHarness = (init: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: init.doc,
    selection: { anchor: init.anchor, head: init.head ?? init.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });
  const activeState = () =>
    createActiveBlockStateFromMarkdownDocument(parseMarkdownDocument(view.state.doc.toString()), {
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    });
  return {
    view,
    run: (fn: typeof toggleStrong) => fn(view, activeState()),
    text: () => view.state.doc.toString(),
    selection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    }),
    destroy: () => view.destroy()
  };
};

describe("toggleStrong", () => {
  it("wraps a non-empty selection with ** and keeps the selection on the content", () => {
    const harness = createHarness({ doc: "alpha bold beta", anchor: 6, head: 10 });

    expect(harness.run(toggleStrong)).toBe(true);
    expect(harness.text()).toBe("alpha **bold** beta");
    expect(harness.selection()).toEqual({ anchor: 8, head: 12 });

    harness.destroy();
  });

  it("inserts an empty pair when there is no selection", () => {
    const harness = createHarness({ doc: "alpha ", anchor: 6 });

    expect(harness.run(toggleStrong)).toBe(true);
    expect(harness.text()).toBe("alpha ****");
    expect(harness.selection()).toEqual({ anchor: 8, head: 8 });

    harness.destroy();
  });
});

describe("toggleEmphasis", () => {
  it("wraps a non-empty selection with single asterisks", () => {
    const harness = createHarness({ doc: "alpha word beta", anchor: 6, head: 10 });

    expect(harness.run(toggleEmphasis)).toBe(true);
    expect(harness.text()).toBe("alpha *word* beta");
    expect(harness.selection()).toEqual({ anchor: 7, head: 11 });

    harness.destroy();
  });
});
