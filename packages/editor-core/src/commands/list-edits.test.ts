import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import type { SemanticContext } from "./semantic-context";
import { readSemanticContext } from "./semantic-context";
import {
  computeBackspaceOrderedListMarker,
  computeNormalizedOrderedListDocument,
  computeDeleteOrderedListRange,
  computeIndentListItem,
  computeInsertOrderedListItemBelow,
  computeMoveListItemDown,
  computeMoveListItemUp,
  computeOrderedListEnter,
  computeOutdentListItem,
  type ListEdit,
  normalizeOrderedListScopes
} from "./list-edits";

const buildContext = (doc: string, anchor: number, head = anchor): SemanticContext => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );

  return readSemanticContext(state, activeState);
};

const applyEdit = (doc: string, result: ListEdit | null) => {
  if (!result) {
    return doc;
  }

  return `${doc.slice(0, result.changes.from)}${result.changes.insert}${doc.slice(result.changes.to)}`;
};

describe("list-edits", () => {
  it("inserts a new ordered item below the current item and preserves later sibling numbering", () => {
    const doc = ["5. first", "6. second"].join("\n");
    const context = buildContext(doc, doc.indexOf("first") + 1);
    const result = computeInsertOrderedListItemBelow(context);

    expect(applyEdit(doc, result)).toBe(["5. first", "6. ", "7. second"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 12, head: 12 });
  });

  it.each([
    ["computeInsertOrderedListItemBelow", computeInsertOrderedListItemBelow],
    ["computeDeleteOrderedListRange", computeDeleteOrderedListRange],
    ["computeIndentListItem", computeIndentListItem],
    ["computeOutdentListItem", computeOutdentListItem],
    ["computeMoveListItemUp", computeMoveListItemUp],
    ["computeMoveListItemDown", computeMoveListItemDown]
  ])("%s returns null outside an ordered-list context", (_name, compute) => {
    const context = buildContext("Paragraph", 4);

    expect(compute(context)).toBeNull();
  });

  it("returns null when delete is requested with an empty ordered-list selection", () => {
    const doc = ["5. first", "6. second"].join("\n");
    const context = buildContext(doc, doc.indexOf("first"), doc.indexOf("first"));

    expect(computeDeleteOrderedListRange(context)).toBeNull();
  });

  it("deletes a middle ordered item and renumbers the following sibling", () => {
    const doc = ["5. first", "6. second", "7. third"].join("\n");
    const context = buildContext(doc, "5. first\n".length, doc.indexOf("7. third"));
    const result = computeDeleteOrderedListRange(context);

    expect(applyEdit(doc, result)).toBe(["5. first", "6. third"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 9, head: 9 });
  });

  it("indents an ordered item into a child scope and restarts child numbering from 1", () => {
    const doc = ["5. parent", "6. child", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["5. parent", "  1. child", "6. sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 15, head: 15 });
  });

  it("outdents an ordered item back to the parent scope and keeps following siblings in sequence", () => {
    const doc = ["5. parent", "  6. child", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. child", "7. sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

  it("pressing Enter on an empty ordered child item creates an empty parent sibling item", () => {
    const doc = ["5. parent", "  1. "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeOrderedListEnter(context, true);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. "].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

  it("moves an ordered subtree down together with its continuation lines", () => {
    const doc = ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeMoveListItemDown(context);

    expect(applyEdit(doc, result)).toBe(
      ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n")
    );
    expect(result?.selection).toEqual({ anchor: 24, head: 24 });
  });

  it("moves an ordered subtree up together with its continuation lines", () => {
    const doc = ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeMoveListItemUp(context);

    expect(applyEdit(doc, result)).toBe(
      ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n")
    );
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

  it("normalizes ordered-list scopes without disturbing unrelated nested scopes", () => {
    const doc = ["5. parent", "  3) nested one", "  4) nested two", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("parent"));
    const result = normalizeOrderedListScopes(context);

    expect(applyEdit(doc, result)).toBe(
      ["5. parent", "  3) nested one", "  4) nested two", "6. sibling"].join("\n")
    );
    expect(result?.selection).toEqual({ anchor: 3, head: 3 });
  });

  it("normalizes blank-line-separated ordered runs independently", () => {
    const doc = ["1. one", "2. two", "", "3. three", "4. four"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "", "1. three", "2. four"].join("\n")
    });
  });

  it("normalizes mixed-delimiter ordered runs as separate scopes", () => {
    const doc = ["1. one", "2. two", "5) three", "6) four"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "1) three", "2) four"].join("\n")
    });
  });

  it("restarts numbering after a top-level plain-text line interrupts an ordered run", () => {
    const doc = ["1. one", "2. two", "3. four", "4", "5. six", "6. seven"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "3. four", "4", "1. six", "2. seven"].join("\n")
    });
  });

  it("keeps selection on the current line when backspacing the marker of an empty ordered item", () => {
    const doc = ["1. one", "2. two", "3. four", "4.", "5. six", "6. seven"].join("\n");
    const context = buildContext(doc, ["1. one", "2. two", "3. four", "4."].join("\n").length);
    const result = computeBackspaceOrderedListMarker(context);

    expect(applyEdit(doc, result)).toBe(["1. one", "2. two", "3. four", "4", "1. six", "2. seven"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["1. one", "2. two", "3. four", "4"].join("\n").length,
      head: ["1. one", "2. two", "3. four", "4"].join("\n").length
    });
  });
});
