import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import {
  computeBulletListToggle,
  computeEmphasisToggle,
  computeHeadingToggle,
  computeStrongToggle
} from "./semantic-edits";

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

describe("computeEmphasisToggle", () => {
  it("wraps a non-empty selection with single-asterisk markers", () => {
    const doc = "alpha word beta";
    const from = doc.indexOf("word");
    const to = from + 4;
    const result = computeEmphasisToggle(buildContext(doc, from, to));

    expect(result!.changes).toEqual({ from, to, insert: "*word*" });
    expect(result!.selection).toEqual({ anchor: from + 1, head: to + 1 });
  });

  it("inserts an empty pair and parks the cursor between markers", () => {
    const doc = "alpha ";
    const result = computeEmphasisToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: doc.length, to: doc.length, insert: "**" });
    expect(result!.selection).toEqual({ anchor: doc.length + 1, head: doc.length + 1 });
  });

  it("unwraps an emphasis selection when the selection covers the content exactly", () => {
    const doc = "alpha *word* beta";
    const contentFrom = doc.indexOf("word");
    const contentTo = contentFrom + 4;
    const result = computeEmphasisToggle(buildContext(doc, contentFrom, contentTo));

    expect(result!.changes).toEqual({ from: contentFrom - 1, to: contentTo + 1, insert: "word" });
    expect(result!.selection).toEqual({ anchor: contentFrom - 1, head: contentTo - 1 });
  });
});

describe("computeHeadingToggle", () => {
  it("turns a paragraph line into the requested heading level", () => {
    const doc = "Paragraph";
    const result = computeHeadingToggle(buildContext(doc, 0), 2);

    expect(result!.changes).toEqual({ from: 0, to: 0, insert: "## " });
    expect(result!.selection).toEqual({ anchor: 3, head: 3 });
  });

  it("removes the heading marker when toggling to the same level", () => {
    const doc = "## Title";
    const result = computeHeadingToggle(buildContext(doc, 5), 2);

    expect(result!.changes).toEqual({ from: 0, to: 3, insert: "" });
    expect(result!.selection).toEqual({ anchor: 2, head: 2 });
  });

  it("rewrites the heading marker when switching between levels", () => {
    const doc = "# Title";
    const result = computeHeadingToggle(buildContext(doc, 4), 3);

    expect(result!.changes).toEqual({ from: 0, to: 2, insert: "### " });
    expect(result!.selection).toEqual({ anchor: 6, head: 6 });
  });

  it("applies the heading level to every line covered by a multi-line selection", () => {
    const doc = ["alpha", "beta"].join("\n");
    const from = 0;
    const to = doc.length;
    const result = computeHeadingToggle(buildContext(doc, from, to), 2);

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "## alpha\n## beta"
    });
    expect(result!.selection).toEqual({ anchor: 0, head: doc.length + 6 });
  });
});

describe("computeBulletListToggle", () => {
  it("prefixes a paragraph line with `- `", () => {
    const doc = "alpha";
    const result = computeBulletListToggle(buildContext(doc, 2));

    expect(result!.changes).toEqual({ from: 0, to: doc.length, insert: "- alpha" });
    expect(result!.selection).toEqual({ anchor: 4, head: 4 });
  });

  it("removes the bullet marker when every covered line already starts with one", () => {
    const doc = ["- alpha", "- beta"].join("\n");
    const result = computeBulletListToggle(buildContext(doc, 0, doc.length));

    expect(result!.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    });
  });

  it("preserves indent when adding a bullet to an indented paragraph line", () => {
    const doc = "  alpha";
    const result = computeBulletListToggle(buildContext(doc, doc.length));

    expect(result!.changes).toEqual({ from: 0, to: doc.length, insert: "  - alpha" });
  });
});
