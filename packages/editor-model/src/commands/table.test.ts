import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import {
  planTableDelete,
  planTableDeleteColumn,
  planTableDeleteRow,
  planTableExitBelow,
  planTableInsertColumnRight,
  planTableInsertRowBelow,
  planTableNextCell,
  planTablePreviousCell,
  planTableUpdateCell,
  readTableSnapshot,
  tablePositionAt
} from "./table";

const TABLE = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");

function contextAt(source: string, anchor: number): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head: anchor } });
}

function applyPlan(source: string, plan: ReturnType<typeof planTableNextCell>): string {
  if (plan === null) {
    return source;
  }

  let text = source;

  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return text;
}

describe("table planners", () => {
  it("reads the canonical table model from the tree", () => {
    const snapshot = readTableSnapshot(contextAt(TABLE, TABLE.indexOf("1")));

    expect(snapshot?.columnCount).toBe(2);
    expect(snapshot?.hasHeader).toBe(true);
    expect(snapshot?.header).toEqual(["a", "b"]);
    expect(snapshot?.rows).toEqual([["1", "2"]]);
  });

  it("locates the current cell", () => {
    const position = tablePositionAt(contextAt(TABLE, TABLE.indexOf("2")));

    expect(position?.row).toBe(1);
    expect(position?.column).toBe(1);
  });

  it("moves to the next and previous cell without editing", () => {
    const next = planTableNextCell(contextAt(TABLE, TABLE.indexOf("a")));
    const previous = planTablePreviousCell(contextAt(TABLE, TABLE.indexOf("2")));

    expect(next?.edits).toEqual([]);
    expect(next?.selection.anchor).toBe(TABLE.indexOf("b"));
    expect(previous?.selection.anchor).toBe(TABLE.indexOf("1"));
  });

  it("inserts a row below the current row", () => {
    const plan = planTableInsertRowBelow(contextAt(TABLE, TABLE.indexOf("1")));
    const text = applyPlan(TABLE, plan);

    expect(text.split("\n")).toHaveLength(4);
    expect(readTableSnapshot(contextAt(text, text.indexOf("1")))).toMatchObject({
      rows: [["1", "2"], ["", ""]]
    });
  });

  it("inserts a column to the right and keeps alignments in step", () => {
    const plan = planTableInsertColumnRight(contextAt(TABLE, TABLE.indexOf("a")));
    const text = applyPlan(TABLE, plan);
    const snapshot = readTableSnapshot(contextAt(text, text.indexOf("a")));

    expect(snapshot?.columnCount).toBe(3);
    expect(snapshot?.alignments).toHaveLength(3);
    expect(snapshot?.header).toHaveLength(3);
  });

  it("deletes a row and a column", () => {
    const rowDeleted = applyPlan(TABLE, planTableDeleteRow(contextAt(TABLE, TABLE.indexOf("1"))));
    const columnDeleted = applyPlan(TABLE, planTableDeleteColumn(contextAt(TABLE, TABLE.indexOf("a"))));

    expect(readTableSnapshot(contextAt(rowDeleted, rowDeleted.indexOf("a")))?.rows).toEqual([]);
    // A one-column table is below the parser's table threshold, so only the text is asserted.
    expect(columnDeleted.split("\n")).toHaveLength(3);
    expect(columnDeleted).toContain("| b |");
  });

  it("deletes the whole table explicitly", () => {
    expect(applyPlan(TABLE, planTableDelete(contextAt(TABLE, TABLE.indexOf("a"))))).toBe("");
  });

  it("updates one cell and leaves the rest untouched", () => {
    const plan = planTableUpdateCell(contextAt(TABLE, TABLE.indexOf("1")), { row: 1, column: 0 }, "42");
    const text = applyPlan(TABLE, plan);

    expect(readTableSnapshot(contextAt(text, text.indexOf("42")))?.rows).toEqual([["42", "2"]]);
  });

  it("exits below the table, adding a blank line at the document end", () => {
    const plan = planTableExitBelow(contextAt(TABLE, TABLE.indexOf("2")));

    expect(plan?.edits).toEqual([{ from: TABLE.length, to: TABLE.length, insert: "\n\n" }]);
    expect(plan?.selection.anchor).toBe(TABLE.length + 2);
  });

  it("moves outside a table that has following content", () => {
    const source = [TABLE, "", "after"].join("\n");
    const plan = planTableExitBelow(contextAt(source, source.indexOf("2")));

    expect(plan?.edits).toEqual([]);
    expect(plan?.selection.anchor).toBe(source.indexOf("after"));
  });

  it("keeps a quoted table inside its quote", () => {
    const quoted = ["> | a | b |", "> | --- | --- |", "> | 1 | 2 |"].join("\n");
    const plan = planTableInsertRowBelow(contextAt(quoted, quoted.indexOf("1")));
    const text = applyPlan(quoted, plan);

    expect(text.split("\n")).toHaveLength(4);
    expect(text.startsWith("> |")).toBe(true);
  });
});

