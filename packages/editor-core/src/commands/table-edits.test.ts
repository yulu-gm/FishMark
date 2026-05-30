import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { deriveTableCursorState } from "../table-cursor-state";
import { readTableContext } from "./table-context";
import {
  computeExitTableBelow,
  computeInsertTableRowBelow,
  computeMoveToNextTableCell,
  computeMoveToPreviousTableCell
} from "./table-edits";

const buildTableContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  activeState.tableCursor = deriveTableCursorState(doc, { anchor, head }, activeState.blockMap, null);

  return readTableContext(state, activeState);
};

describe("table edit planners", () => {
  it("computes next-cell navigation on Tab", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const ctx = buildTableContext(doc, doc.indexOf("pen") + 1);
    const edit = computeMoveToNextTableCell(ctx);

    expect(edit).toMatchObject({
      selectionTarget: { row: 1, column: 1 },
      changes: null
    });
  });

  it("computes previous-cell navigation on Shift-Tab", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const ctx = buildTableContext(doc, doc.indexOf("2"));
    const edit = computeMoveToPreviousTableCell(ctx);

    expect(edit).toMatchObject({
      selectionTarget: { row: 1, column: 0 },
      changes: null
    });
  });

  it("computes insert-row-below as one full-table markdown replacement", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const ctx = buildTableContext(doc, doc.indexOf("pen") + 1);
    const edit = computeInsertTableRowBelow(ctx);

    expect(edit?.changes).toEqual({
      from: 0,
      to: doc.length,
      insert: ["| name | qty |", "| :--- | ---: |", "| pen  |   2 |", "|      |     |"].join("\n")
    });
    expect(edit?.selectionTarget).toEqual({ row: 2, column: 0 });
  });

  it("computes a structural blank and editable line when exiting below a trailing table", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const ctx = buildTableContext(doc, doc.indexOf("2"));
    const edit = computeExitTableBelow(ctx);

    expect(edit).toMatchObject({
      changes: null,
      selectionTarget: {
        kind: "outside",
        anchor: doc.length + 2,
        insert: { from: doc.length, to: doc.length, insert: "\n\n" }
      }
    });
  });

  it("extends a single trailing blank below a table into an editable line", () => {
    const table = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const doc = `${table}\n`;
    const ctx = buildTableContext(doc, doc.indexOf("2"));
    const edit = computeExitTableBelow(ctx);

    expect(edit).toMatchObject({
      changes: null,
      selectionTarget: {
        kind: "outside",
        anchor: doc.length + 1,
        insert: { from: doc.length, to: doc.length, insert: "\n" }
      }
    });
  });
});
