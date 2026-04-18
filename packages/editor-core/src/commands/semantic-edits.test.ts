import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import { computeStrongToggle } from "./semantic-edits";

const buildContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  return readSemanticContext(state, activeState);
};

describe("computeStrongToggle", () => {
  it("wraps a non-empty selection with ** markers and keeps the selection on the content", () => {
    const doc = "alpha bold beta";
    const from = doc.indexOf("bold");
    const to = from + 4;
    const result = computeStrongToggle(buildContext(doc, from, to));

    expect(result).not.toBeNull();
    expect(result!.changes).toEqual({ from, to, insert: "**bold**" });
    expect(result!.selection).toEqual({ anchor: from + 2, head: to + 2 });
  });

  it("inserts an empty pair and parks the cursor between markers when the selection is empty", () => {
    const doc = "alpha ";
    const result = computeStrongToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: doc.length, to: doc.length, insert: "****" });
    expect(result!.selection).toEqual({ anchor: doc.length + 2, head: doc.length + 2 });
  });

  it("unwraps a strong node when the cursor sits inside the empty pair", () => {
    const doc = "alpha **** beta";
    const inner = doc.indexOf("****") + 2;
    const result = computeStrongToggle(buildContext(doc, inner));

    expect(result!.changes).toEqual({ from: inner - 2, to: inner + 2, insert: "" });
    expect(result!.selection).toEqual({ anchor: inner - 2, head: inner - 2 });
  });

  it("unwraps a strong node when the selection covers its full content", () => {
    const doc = "alpha **bold** beta";
    const contentFrom = doc.indexOf("bold");
    const contentTo = contentFrom + 4;
    const result = computeStrongToggle(buildContext(doc, contentFrom, contentTo));

    expect(result!.changes).toEqual({ from: contentFrom - 2, to: contentTo + 2, insert: "bold" });
    expect(result!.selection).toEqual({ anchor: contentFrom - 2, head: contentTo - 2 });
  });
});
