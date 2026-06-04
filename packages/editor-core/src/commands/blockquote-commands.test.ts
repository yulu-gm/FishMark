// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { runBlockquoteEnter } from "./blockquote-commands";

const createHarness = (init: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: init.doc,
    selection: { anchor: init.anchor, head: init.head ?? init.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });

  return {
    view,
    runEnter: () => runBlockquoteEnter(view),
    text: () => view.state.doc.toString(),
    selectionHead: () => view.state.selection.main.head,
    destroy: () => view.destroy()
  };
};

describe("runBlockquoteEnter", () => {
  it("creates an internal structural separator and a new quoted block from content lines", () => {
    const harness = createHarness({ doc: "> alpha", anchor: "> alpha".length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> alpha", ">", "> "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("keeps nested quote depth when creating the next quoted block", () => {
    const source = "> > alpha";
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> > alpha", "> > ", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("exits a blockquote from an empty quoted line", () => {
    const source = ["> alpha", ">", "> "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> alpha", ">", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("outdents an empty nested quoted line one level at a time", () => {
    const source = ["> 11", "> > 222", "> > > 33333", "> > > "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", "> "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });
});
