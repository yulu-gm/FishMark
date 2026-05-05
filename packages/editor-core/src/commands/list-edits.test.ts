import { EditorState, type Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

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
  computeUpgradeEmptyLeftListItemEnter,
  mapTextOffsetThroughChanges,
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

const applyChanges = (
  doc: string,
  changes: readonly { from: number; to: number; insert: string | Text }[]
) => {
  let cursor = 0;
  let result = "";

  for (const change of [...changes].sort((left, right) => left.from - right.from)) {
    result += doc.slice(cursor, change.from);
    result += change.insert.toString();
    cursor = change.to;
  }

  return `${result}${doc.slice(cursor)}`;
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
    ["computeMoveListItemUp", computeMoveListItemUp],
    ["computeMoveListItemDown", computeMoveListItemDown]
  ])("%s returns null outside an ordered-list context", (_name, compute) => {
    const context = buildContext("Paragraph", 4);

    expect(compute(context)).toBeNull();
  });

  it.each([
    ["computeIndentListItem", computeIndentListItem],
    ["computeOutdentListItem", computeOutdentListItem]
  ])("%s returns null outside a list context", (_name, compute) => {
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

  it("indents a nested unordered item into a third-level child list", () => {
    const doc = ["- parent", "  - child", "  - leaf", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("leaf"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- parent", "  - child", "    - leaf", "- sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("leaf") + 2, head: doc.indexOf("leaf") + 2 });
  });

  it("keeps unordered indentation edits scoped to the changed subtree", () => {
    const doc = ["- parent", "  - child", "  - leaf", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("leaf"));
    const result = computeIndentListItem(context);
    const changedLineStart = doc.indexOf("  - leaf");
    const changedLineEnd = changedLineStart + "  - leaf".length;

    expect(result?.changes.from).toBeGreaterThanOrEqual(changedLineStart);
    expect(result?.changes.to).toBeLessThanOrEqual(changedLineEnd);
    expect(result?.changes.from).not.toBe(0);
    expect(result?.changes.to).not.toBe(doc.length);
  });

  it("indents a nested task item into a third-level task list", () => {
    const doc = ["- [ ] parent", "  - [x] done", "  - [ ] next"].join("\n");
    const context = buildContext(doc, doc.indexOf("next"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- [ ] parent", "  - [x] done", "    - [ ] next"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("next") + 2, head: doc.indexOf("next") + 2 });
  });

  it("does not indent the first item in its current list scope", () => {
    const doc = ["- parent", "  - child", "  - leaf"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));

    expect(computeIndentListItem(context)).toBeNull();
  });

  it("outdents an ordered item back to the parent scope and keeps following siblings in sequence", () => {
    const doc = ["5. parent", "  6. child", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. child", "7. sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

  it("outdents an unordered item subtree into the parent scope", () => {
    const doc = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- parent", "- child", "  - leaf", "  continuation", "- sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("child") - 2, head: doc.indexOf("child") - 2 });
  });

  it("keeps unordered outdent edits scoped to the changed subtree", () => {
    const doc = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);
    const changedSubtreeStart = doc.indexOf("  - child");
    const changedSubtreeEnd = doc.indexOf("\n- sibling");

    expect(result?.changes.from).toBeGreaterThanOrEqual(changedSubtreeStart);
    expect(result?.changes.to).toBeLessThanOrEqual(changedSubtreeEnd);
    expect(result?.changes.from).not.toBe(0);
    expect(result?.changes.to).not.toBe(doc.length);
  });

  it("does not outdent a top-level unordered item", () => {
    const doc = ["- parent", "  - child"].join("\n");
    const context = buildContext(doc, doc.indexOf("parent"));

    expect(computeOutdentListItem(context)).toBeNull();
  });

  it("pressing Enter on an empty ordered child item creates an empty parent sibling item", () => {
    const doc = ["5. parent", "  1. "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeOrderedListEnter(context, true);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. "].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

  it("upgrades a top-level list item to body text when its left split content is empty", () => {
    const doc = ["1. one", "2. two", "3. tail"].join("\n");
    const context = buildContext(doc, doc.indexOf("tail"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("tail"));

    expect(applyEdit(doc, result)).toBe(["1. one", "2. two", "", "tail"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["1. one", "2. two", "", ""].join("\n").length,
      head: ["1. one", "2. two", "", ""].join("\n").length
    });
  });

  it("upgrades a single top-level list item to body text without a leading separator", () => {
    const doc = "1. tail";
    const context = buildContext(doc, doc.indexOf("tail"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("tail"));

    expect(applyEdit(doc, result)).toBe("tail");
    expect(result?.selection).toEqual({
      anchor: 0,
      head: 0
    });
  });

  it("upgrades a nested item to the parent list when its left split content is empty", () => {
    const doc = ["- parent", "  - child"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("child"));

    expect(applyEdit(doc, result)).toBe(["- parent", "- child"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["- parent", "- "].join("\n").length,
      head: ["- parent", "- "].join("\n").length
    });
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
    const doc = ["1. one", "9. two", "", "3. three", "9. four"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "", "3. three", "4. four"].join("\n")
    });
  });

  it("normalizes mixed-delimiter ordered runs as separate scopes", () => {
    const doc = ["1. one", "9. two", "5) three", "9) four"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "5) three", "6) four"].join("\n")
    });
  });

  it("restarts numbering after a top-level plain-text line interrupts an ordered run", () => {
    const doc = ["1. one", "2. two", "3. four", "4", "5. six", "6. seven"].join("\n");

    expect(computeNormalizedOrderedListDocument(doc)).toMatchObject({
      source: ["1. one", "2. two", "3. four", "4", "1. six", "2. seven"].join("\n")
    });
  });

  it("keeps offsets inside unchanged ordered-list content when normalizing document markers", () => {
    const doc = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massaYou can use sequential numbers...",
      "2. ...or keep all the numbers as `1.`",
      "",
      "Start numbering with offset:"
    ].join("\n");
    const expected = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massaYou can use sequential numbers...",
      "4. ...or keep all the numbers as `1.`",
      "",
      "Start numbering with offset:"
    ].join("\n");
    const cursor = doc.indexOf("You can");
    const result = computeNormalizedOrderedListDocument(doc);

    expect(result).not.toBeNull();
    expect(result?.source).toBe(expected);
    expect(applyChanges(doc, result?.changes ?? [])).toBe(expected);
    expect(mapTextOffsetThroughChanges(cursor, result?.changes ?? [])).toBe(cursor);
  });

  it("keeps offsets at split ordered item content when normalizing document markers", () => {
    const doc = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massa",
      "4. You ",
      "5. can use sequential numbers...",
      "5. ...or keep all the numbers as `1.`"
    ].join("\n");
    const expected = [
      "Ordered",
      "",
      "1. Lorem ipsum dolor sit amet",
      "2. Consectetur adipiscing elit",
      "3. Integer molestie lorem at massa",
      "4. You ",
      "5. can use sequential numbers...",
      "6. ...or keep all the numbers as `1.`"
    ].join("\n");
    const cursor = doc.indexOf("can use");
    const result = computeNormalizedOrderedListDocument(doc);

    expect(result).not.toBeNull();
    expect(result?.source).toBe(expected);
    expect(applyChanges(doc, result?.changes ?? [])).toBe(expected);
    expect(mapTextOffsetThroughChanges(cursor, result?.changes ?? [])).toBe(cursor);
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

  it("breaks ordered list rendering at the current item content start on Backspace", () => {
    const doc = ["1. 内容", "2. 内容2", "3. 内容3"].join("\n");
    const cursor = doc.indexOf("内容2");
    const context = buildContext(doc, cursor);
    const result = computeBackspaceOrderedListMarker(context);
    const expected = ["1. 内容", "", "2.内容2", "3. 内容3"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.indexOf("2.") + "2.".length,
      head: expected.indexOf("2.") + "2.".length
    });
  });
});
