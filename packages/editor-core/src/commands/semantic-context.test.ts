import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { readSemanticContext } from "./semantic-context";

const buildContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  return readSemanticContext(state, activeState);
};

describe("readSemanticContext", () => {
  it("captures a non-empty selection range from EditorState", () => {
    const doc = ["alpha", "beta"].join("\n");
    const ctx = buildContext(doc, 0, doc.length);

    expect(ctx.selection).toEqual({ from: 0, to: doc.length, empty: false });
    expect(ctx.source).toBe(doc);
    expect(ctx.activeState).toBeDefined();
  });

  it("normalizes from/to so an empty selection still reports the cursor offset", () => {
    const doc = "paragraph";
    const ctx = buildContext(doc, 4);

    expect(ctx.selection).toEqual({ from: 4, to: 4, empty: true });
  });
});
