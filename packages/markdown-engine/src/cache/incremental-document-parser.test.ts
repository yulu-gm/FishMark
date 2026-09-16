import { describe, expect, it } from "vitest";

import { flattenMarkdownTree, type MarkdownDocumentTree } from "../model/document-tree";
import { parseFullDocumentTree } from "../parse/full-document-parser";
import { createDocumentStructureCache } from "./document-structure-cache";
import { applyIncrementalEdit } from "./incremental-document-parser";
import type { TextEdit } from "./invalidation-range";

function snapshot(tree: MarkdownDocumentTree) {
  return flattenMarkdownTree(tree).map((node) => ({
    id: node.id,
    kind: node.kind,
    path: [...node.path],
    source: { ...node.source },
    content: { ...node.content },
    markers: node.markers.map((marker) => ({ kind: marker.kind, range: { ...marker.range } })),
    inline: "inline" in node ? node.inline ?? null : null
  }));
}

function applyAll(source: string, edits: readonly TextEdit[]) {
  let cache = createDocumentStructureCache(source);
  const stats = [];
  for (const edit of edits) {
    const result = applyIncrementalEdit(cache, edit);
    cache = result.cache;
    stats.push(result.stats);
  }
  return { source: cache.source, tree: cache.tree, stats };
}

const corpus: readonly { readonly name: string; readonly source: string; readonly edits: readonly TextEdit[] }[] = [
  {
    name: "paragraph text insertion",
    source: "# Title\n\nFirst paragraph here.\n\nSecond paragraph.\n",
    edits: [{ fromOffset: 20, toOffset: 20, insertedText: " extra" }]
  },
  {
    name: "delete a whole top-level block",
    source: "alpha\n\nbeta\n\ngamma\n",
    edits: [{ fromOffset: 6, toOffset: 12, insertedText: "" }]
  },
  {
    name: "edit inside a nested blockquote list",
    source: "> - one\n> - two\n\nafter\n",
    edits: [{ fromOffset: 6, toOffset: 9, insertedText: "TWO" }]
  },
  {
    name: "type inside a code fence",
    source: "before\n\n```js\nconst a = 1;\n```\n\nafter\n",
    edits: [{ fromOffset: 20, toOffset: 20, insertedText: "x" }]
  },
  {
    name: "insert a new block between blocks",
    source: "one\n\ntwo\n",
    edits: [{ fromOffset: 5, toOffset: 5, insertedText: "# Heading\n\n" }]
  }
];

describe("applyIncrementalEdit", () => {
  it.each(corpus)("stays structurally identical to a fresh parse: $name", ({ source, edits }) => {
    const incremental = applyAll(source, edits);
    const fresh = parseFullDocumentTree(incremental.source);

    expect(snapshot(incremental.tree)).toEqual(snapshot(fresh));
  });

  it("reuses the unaffected region instead of reparsing the whole document", () => {
    const source = "# Title\n\nalpha\n\nbeta\n\ngamma\n\ndelta\n";
    const cache = createDocumentStructureCache(source);
    const result = applyIncrementalEdit(cache, {
      fromOffset: source.indexOf("beta"),
      toOffset: source.indexOf("beta"),
      insertedText: "B"
    });

    expect(result.stats.fallbackReason).toBeNull();
    expect(result.stats.window).not.toBeNull();
    expect(result.stats.reusedNodes).toBeGreaterThan(0);
    expect(result.stats.reparsedNodes).toBeLessThan(
      flattenMarkdownTree(parseFullDocumentTree(source)).length
    );
  });

  it("falls back to a full parse when no safe invalidation window exists", () => {
    const cache = createDocumentStructureCache("alpha\n\nbeta\n");
    const result = applyIncrementalEdit(cache, {
      fromOffset: 2,
      toOffset: 999,
      insertedText: "x"
    });

    expect(result.stats.fallbackReason).toBe("no-safe-window");
    expect(result.stats.window).toBeNull();
    expect(snapshot(result.cache.tree)).toEqual(
      snapshot(parseFullDocumentTree(result.cache.source))
    );
  });

  it("keeps an unchanged tree when no edit is applied", () => {
    const cache = createDocumentStructureCache("stable\n");
    expect(cache.tree).toBe(cache.tree);
    expect(cache.revision).toBe(1);
  });
});
