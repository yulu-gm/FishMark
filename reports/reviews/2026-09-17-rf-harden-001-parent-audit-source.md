# Parent independent audit source

Executed separately; not part of the permanent test suite.

```typescript
import { it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { applyEditorPlan, editorStructureCacheField, readEditorStructureCache } from "../../../editor-core/src/commands/editor-model-bridge";
import * as fullParser from "../parse/full-document-parser";
import { createDocumentStructureCache } from "./document-structure-cache";
import { applyIncrementalEdit } from "./incremental-document-parser";
import { parseFullDocumentTree } from "../parse/full-document-parser";
import { flattenMarkdownTree } from "../model/document-tree";

const cases = [
  { name: "join paragraphs by deleting separator", source: "alpha\n\nbeta\n\ngamma\n", from: 6, to: 7, insert: "" },
  { name: "insert unclosed fence at separator", source: "alpha\n\nbeta\n\ngamma\n", from: 6, to: 6, insert: "```\n" },
  { name: "change reference destination", source: "[x][ref]\n\n[ref]: /old\n\nafter\n", from: 17, to: 21, insert: "/new" },
  { name: "insert before table", source: "alpha\n\n| a | b |\n| --- | --- |\n| c | d |\n\nafter\n", from: 2, to: 2, insert: "XYZ" }
];
for (const c of cases) it(c.name, () => {
  const result = applyIncrementalEdit(createDocumentStructureCache(c.source), { fromOffset: c.from, toOffset: c.to, insertedText: c.insert });
  const fresh = parseFullDocumentTree(result.cache.source);
  const snap = (tree: typeof fresh) => ({ nodes: flattenMarkdownTree(tree), references: [...tree.referenceDefinitions], footnotes: [...tree.footnoteDefinitions] });
  expect(snap(result.cache.tree)).toEqual(snap(fresh));
});

it("rejects an old plan before dispatch", () => {
  const state = EditorState.create({ doc: "abc", extensions: [editorStructureCacheField] });
  const newer = state.update({ changes: { from: 0, insert: "X" } }).state;
  const dispatch = vi.fn();
  const view = { state: newer, dispatch } as unknown as Parameters<typeof applyEditorPlan>[0];
  try {
    applyEditorPlan(view, { revision: 1, commandId: "insert-text", edits: [{ from: 1, to: 1, insert: "!" }], selection: { anchor: 2, head: 2 }, intent: "edit" });
  } catch { /* Rejection is acceptable; dispatch is not. */ }
  expect(dispatch).not.toHaveBeenCalled();
});

it("keeps cache revision monotonic across multi-range transactions", () => {
  let state = EditorState.create({ doc: "abcdef", extensions: [editorStructureCacheField] });
  state = state.update({ changes: { from: 6, insert: "!" } }).state;
  state = state.update({ changes: { from: 7, insert: "?" } }).state;
  const before = readEditorStructureCache(state).revision;
  state = state.update({ changes: [{ from: 0, to: 1, insert: "X" }, { from: 3, to: 4, insert: "Y" }] }).state;
  expect(readEditorStructureCache(state).revision).toBeGreaterThan(before);
});

it("measures full-parser calls inside an ordinary incremental edit", () => {
  const source = "alpha\n\nbeta\n\ngamma\n";
  const cache = createDocumentStructureCache(source);
  const spy = vi.spyOn(fullParser, "parseFullDocumentTree");
  try {
    const result = applyIncrementalEdit(cache, { fromOffset: 2, toOffset: 2, insertedText: "X" });
    console.info("REVIEW_FULL_PARSE_CALLS", JSON.stringify({ sourceLength: result.cache.source.length, parsedLengths: spy.mock.calls.map(call => call[0].length), stats: result.stats }));
    expect(spy.mock.calls.some(call => call[0] === result.cache.source)).toBe(false);
  } finally { spy.mockRestore(); }
});

const parentSources = [
  "alpha", "alpha\n", "alpha\n\nbeta", "中文文本\n\n下段",
  "alpha\n\n| a | b |\n| --- | --- |\n| c | d |\n",
  "alpha\n\n> - one\n> - two\n", "alpha\n\n```ts\nconst x=1\n```\n",
  "alpha\n\n[ref]: /old\n\n[x][ref]\n", "alpha\n\n[^n]: note\n\nx[^n]\n",
  "alpha\n\n![x](foo)\n", "alpha\n\n# title\n", "alpha\n\nalpha"
];
it.each(parentSources)("parent differential insertion/deletion and sequence: %j", (source) => {
  const edits = [
    ...[0, 2, Math.min(5, source.length), source.length].flatMap(from =>
      ["X", " ", "!", "\n", "`"].map(insert => ({ fromOffset: from, toOffset: from, insertedText: insert }))),
    { fromOffset: 0, toOffset: 1, insertedText: "" },
    { fromOffset: 0, toOffset: Math.min(5, source.length), insertedText: "" }
  ];
  for (const edit of edits) {
    const result = applyIncrementalEdit(createDocumentStructureCache(source), edit);
    expect(result.cache.tree, JSON.stringify(edit)).toEqual(parseFullDocumentTree(result.cache.source));
  }
  let cache = createDocumentStructureCache(source);
  for (const insert of ["X", " ", "!", "\n", "`", "中文", "", "ABC"]) {
    const at = Math.min(2, cache.source.length);
    const result = applyIncrementalEdit(cache, { fromOffset: at, toOffset: at, insertedText: insert });
    cache = result.cache;
    expect(cache.tree, `sequence ${insert}`).toEqual(parseFullDocumentTree(cache.source));
  }
});

```
