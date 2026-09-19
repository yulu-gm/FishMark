import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { planStrongToggle as computeStrongToggle, planEmphasisToggle as computeEmphasisToggle,
  planHeadingToggle as computeHeadingToggle, planBulletListToggle as computeBulletListToggle,
  planBlockquoteToggle as computeBlockquoteToggle } from "./formatting";
import { planCodeFenceToggle as computeCodeFenceToggle } from "./code-fence";

// Preserve the retired semantic-edit text/selection contracts through the model's public plans.
function buildContext(source: string, anchor: number, head = anchor) {
  return createEditorSemanticContext({
    snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)),
    selection: { anchor, head }
  });
}
function applyEdits(source: string, edits: readonly { from: number; to: number; insert: string }[]) {
  let text = source;
  for (const edit of [...edits].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return text;
}

describe("computeStrongToggle", () => {
  it("wraps a non-empty selection with ** markers and keeps the selection on the content", () => {
    const doc = "alpha bold beta";
    const from = doc.indexOf("bold");
    const to = from + 4;
    const result = computeStrongToggle(buildContext(doc, from, to));

    expect(result).not.toBeNull();
    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from, to, insert: "**bold**" }]));
    expect(result!.selection).toEqual({ anchor: from + 2, head: to + 2 });
  });

  it("inserts an empty pair and parks the cursor between markers when the selection is empty", () => {
    const doc = "alpha ";
    const result = computeStrongToggle(buildContext(doc, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: doc.length, to: doc.length, insert: "****" }]));
    expect(result!.selection).toEqual({ anchor: doc.length + 2, head: doc.length + 2 });
  });

  it("unwraps a strong node when the cursor sits inside the empty pair", () => {
    const doc = "alpha **** beta";
    const inner = doc.indexOf("****") + 2;
    const result = computeStrongToggle(buildContext(doc, inner));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: inner - 2, to: inner + 2, insert: "" }]));
    expect(result!.selection).toEqual({ anchor: inner - 2, head: inner - 2 });
  });

  it("unwraps a strong node when the selection covers its full content", () => {
    const doc = "alpha **bold** beta";
    const contentFrom = doc.indexOf("bold");
    const contentTo = contentFrom + 4;
    const result = computeStrongToggle(buildContext(doc, contentFrom, contentTo));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: contentFrom - 2, to: contentTo + 2, insert: "bold" }]));
    expect(result!.selection).toEqual({ anchor: contentFrom - 2, head: contentTo - 2 });
  });

  it("unwraps a strong node inside a list item when the selection covers its full content", () => {
    const doc = "- **bold**";
    const contentFrom = doc.indexOf("bold");
    const contentTo = contentFrom + 4;
    const result = computeStrongToggle(buildContext(doc, contentFrom, contentTo));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: contentFrom - 2, to: contentTo + 2, insert: "bold" }]));
    expect(result!.selection).toEqual({ anchor: contentFrom - 2, head: contentTo - 2 });
  });
});

describe("computeEmphasisToggle", () => {
  it("wraps a non-empty selection with single-asterisk markers", () => {
    const doc = "alpha word beta";
    const from = doc.indexOf("word");
    const to = from + 4;
    const result = computeEmphasisToggle(buildContext(doc, from, to));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from, to, insert: "*word*" }]));
    expect(result!.selection).toEqual({ anchor: from + 1, head: to + 1 });
  });

  it("inserts an empty pair and parks the cursor between markers", () => {
    const doc = "alpha ";
    const result = computeEmphasisToggle(buildContext(doc, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: doc.length, to: doc.length, insert: "**" }]));
    expect(result!.selection).toEqual({ anchor: doc.length + 1, head: doc.length + 1 });
  });

  it("unwraps an emphasis selection when the selection covers the content exactly", () => {
    const doc = "alpha *word* beta";
    const contentFrom = doc.indexOf("word");
    const contentTo = contentFrom + 4;
    const result = computeEmphasisToggle(buildContext(doc, contentFrom, contentTo));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: contentFrom - 1, to: contentTo + 1, insert: "word" }]));
    expect(result!.selection).toEqual({ anchor: contentFrom - 1, head: contentTo - 1 });
  });

  it("unwraps an emphasis selection inside a blockquote when the selection covers the content exactly", () => {
    const doc = "> *word*";
    const contentFrom = doc.indexOf("word");
    const contentTo = contentFrom + 4;
    const result = computeEmphasisToggle(buildContext(doc, contentFrom, contentTo));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: contentFrom - 1, to: contentTo + 1, insert: "word" }]));
    expect(result!.selection).toEqual({ anchor: contentFrom - 1, head: contentTo - 1 });
  });
});

describe("computeHeadingToggle", () => {
  it("turns a paragraph line into the requested heading level", () => {
    const doc = "Paragraph";
    const result = computeHeadingToggle(buildContext(doc, 0), 2);

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: 0, insert: "## " }]));
    expect(result!.selection).toEqual({ anchor: 3, head: 3 });
  });

  it("removes the heading marker when toggling to the same level", () => {
    const doc = "## Title";
    const result = computeHeadingToggle(buildContext(doc, 5), 2);

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: 3, insert: "" }]));
    expect(result!.selection).toEqual({ anchor: 2, head: 2 });
  });

  it("rewrites the heading marker when switching between levels", () => {
    const doc = "# Title";
    const result = computeHeadingToggle(buildContext(doc, 4), 3);

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: 2, insert: "### " }]));
    expect(result!.selection).toEqual({ anchor: 6, head: 6 });
  });

  it("applies the heading level to every line covered by a multi-line selection", () => {
    const doc = ["alpha", "beta"].join("\n");
    const from = 0;
    const to = doc.length;
    const result = computeHeadingToggle(buildContext(doc, from, to), 2);

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "## alpha\n## beta"
    }]));
    expect(result!.selection).toEqual({ anchor: 0, head: doc.length + 6 });
  });
});

describe("computeBulletListToggle", () => {
  it("prefixes a paragraph line with `- `", () => {
    const doc = "alpha";
    const result = computeBulletListToggle(buildContext(doc, 2));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: doc.length, insert: "- alpha" }]));
    expect(result!.selection).toEqual({ anchor: 4, head: 4 });
  });

  it("removes the bullet marker when every covered line already starts with one", () => {
    const doc = ["- alpha", "- beta"].join("\n");
    const result = computeBulletListToggle(buildContext(doc, 0, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    }]));
  });

  it("preserves indent when adding a bullet to an indented paragraph line", () => {
    const doc = "  alpha";
    const result = computeBulletListToggle(buildContext(doc, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: doc.length, insert: "  - alpha" }]));
  });
});

describe("computeBlockquoteToggle", () => {
  it("prefixes a paragraph line with `> `", () => {
    const doc = "alpha";
    const result = computeBlockquoteToggle(buildContext(doc, 2));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{ from: 0, to: doc.length, insert: "> alpha" }]));
  });

  it("removes the blockquote marker when every covered line already starts with `> `", () => {
    const doc = ["> alpha", "> beta"].join("\n");
    const result = computeBlockquoteToggle(buildContext(doc, 0, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    }]));
  });

  it("removes only one blockquote layer from every covered nested line", () => {
    const doc = ["> > alpha", ">> beta"].join("\n");
    const result = computeBlockquoteToggle(buildContext(doc, 0, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "> alpha\n> beta"
    }]));
  });

  it("adds one blockquote layer to already quoted lines when the selection is mixed", () => {
    const doc = ["> alpha", "beta"].join("\n");
    const result = computeBlockquoteToggle(buildContext(doc, 0, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "> > alpha\n> beta"
    }]));
  });
});

describe("computeCodeFenceToggle", () => {
  it("inserts an empty fenced block at the cursor when the selection is empty", () => {
    const doc = "alpha\n";
    const result = computeCodeFenceToggle(buildContext(doc, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: doc.length,
      to: doc.length,
      insert: "```\n\n```"
    }]));
    expect(result!.selection).toEqual({ anchor: doc.length + 4, head: doc.length + 4 });
  });

  it("wraps the covered lines with a code fence", () => {
    const doc = ["alpha", "beta"].join("\n");
    const result = computeCodeFenceToggle(buildContext(doc, 0, doc.length));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "```\nalpha\nbeta\n```"
    }]));
  });

  it("unwraps the active code fence when the cursor sits inside it", () => {
    const doc = "```\nalpha\nbeta\n```";
    const inner = doc.indexOf("alpha");
    const result = computeCodeFenceToggle(buildContext(doc, inner));

    expect(applyEdits(doc, result!.edits)).toBe(applyEdits(doc, [{
      from: 0,
      to: doc.length,
      insert: "alpha\nbeta"
    }]));
  });
});
