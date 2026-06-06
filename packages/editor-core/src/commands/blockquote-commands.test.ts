// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { runBlockquoteBackspace, runBlockquoteEnter } from "./blockquote-commands";

const createHarness = (init: { doc: string; anchor: number; head?: number }) => {
  const state = EditorState.create({
    doc: init.doc,
    selection: { anchor: init.anchor, head: init.head ?? init.anchor }
  });
  const view = new EditorView({ state, parent: document.createElement("div") });

  return {
    view,
    runBackspace: () =>
      runBlockquoteBackspace(
        view,
        createActiveBlockStateFromMarkdownDocument(parseMarkdownDocument(view.state.doc.toString()), {
          anchor: view.state.selection.main.anchor,
          head: view.state.selection.main.head
        })
      ),
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

  it("exits only one nested quote level from an empty quoted line", () => {
    const source = ["> 11", "> > 222", "> > >"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });
});

describe("runBlockquoteBackspace", () => {
  it("joins same-depth quote text across a quote-internal structural separator from the next quote line start", () => {
    const source = ["> 11", ">", "> 222"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.indexOf("222") });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe("> 11222");
    expect(harness.selectionHead()).toBe("> 11".length);

    harness.destroy();
  });

  it("deletes a quote-internal structural separator from the next quote line start", () => {
    const source = ["> 11", ">", "> > 1"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.lastIndexOf("1") });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 1"].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().lastIndexOf("1"));

    harness.destroy();
  });

  it("deletes a quote-internal structural separator when Backspace starts from that separator", () => {
    const source = ["> 11", ">", "> > 1"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.indexOf("\n>\n") + 2 });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 1"].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().lastIndexOf("1"));

    harness.destroy();
  });
});
