// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading
} from "./toggle-block-commands";

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
    runHeading: (level: 1 | 2 | 3 | 4) => toggleHeading(level)(view, activeState()),
    runBullet: () => toggleBulletList(view, activeState()),
    runQuote: () => toggleBlockquote(view, activeState()),
    runFence: () => toggleCodeFence(view, activeState()),
    text: () => view.state.doc.toString(),
    destroy: () => view.destroy()
  };
};

describe("toggleHeading", () => {
  it("turns a paragraph line into the requested level", () => {
    const harness = createHarness({ doc: "Paragraph", anchor: 0 });
    expect(harness.runHeading(2)).toBe(true);
    expect(harness.text()).toBe("## Paragraph");
    harness.destroy();
  });

  it("removes the heading marker when toggled to the same level", () => {
    const harness = createHarness({ doc: "## Title", anchor: 5 });
    expect(harness.runHeading(2)).toBe(true);
    expect(harness.text()).toBe("Title");
    harness.destroy();
  });
});

describe("toggleBulletList", () => {
  it("toggles a paragraph into a bullet list line", () => {
    const harness = createHarness({ doc: "alpha", anchor: 2 });
    expect(harness.runBullet()).toBe(true);
    expect(harness.text()).toBe("- alpha");
    harness.destroy();
  });
});

describe("toggleBlockquote", () => {
  it("toggles a paragraph into a blockquote line", () => {
    const harness = createHarness({ doc: "alpha", anchor: 2 });
    expect(harness.runQuote()).toBe(true);
    expect(harness.text()).toBe("> alpha");
    harness.destroy();
  });
});

describe("toggleCodeFence", () => {
  it("inserts an empty fence at the cursor", () => {
    const harness = createHarness({ doc: "alpha\n", anchor: 6 });
    expect(harness.runFence()).toBe(true);
    expect(harness.text()).toBe("alpha\n```\n\n```");
    harness.destroy();
  });
});
