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

  it("preserves original table spelling across cell input and its inverse", () => {
    const source = "|  A\\|B  | C |\n| --- | :---: |\n| x | y |";
    const edited = applyPlan(source, planTableUpdateCell(contextAt(source, source.indexOf("A")),
      { row: 0, column: 0, offsetInCell: 4 }, "A|BX"));
    expect(edited).toBe(source.replace("A\\|B", "A\\|BX"));
    const restored = applyPlan(edited, planTableUpdateCell(contextAt(edited, edited.indexOf("A")),
      { row: 0, column: 0, offsetInCell: 3 }, "A|B"));
    expect(restored).toBe(source);
  });

  it("escapes a newly typed pipe without changing the delimiter row", () => {
    const edited = applyPlan(TABLE, planTableUpdateCell(contextAt(TABLE, TABLE.indexOf("a")),
      { row: 0, column: 0, offsetInCell: 3 }, "a|b"));
    expect(edited).toBe(TABLE.replace("a |", "a\\|b |"));
    expect(readTableSnapshot(contextAt(edited, edited.indexOf("a")))?.header[0]).toBe("a|b");
  });

  it("round-trips literal backslashes and pipes in cell input", () => {
    const edited = applyPlan(TABLE, planTableUpdateCell(contextAt(TABLE, TABLE.indexOf("a")),
      { row: 0, column: 0, offsetInCell: 3 }, "a\\|"));
    expect(readTableSnapshot(contextAt(edited, edited.indexOf("a")))?.header[0]).toBe("a\\|");
  });

  it.each([
    ["| a | b |\n| --- | --- | --- |\n| x | y | z |", 0, 2, "| a | b | NEW |\n| --- | --- | --- |\n| x | y | z |"],
    ["a | b | c\n--- | --- | ---\nx | y", 1, 2, "a | b | c\n--- | --- | ---\nx | y | NEW"],
    ["| a | b |\n| --- | --- | --- | --- |\n| w | x | y | z |", 0, 3, "| a | b |  | NEW |\n| --- | --- | --- | --- |\n| w | x | y | z |"],
    ["> | a | b | c |\n> | --- | --- | --- |\n> | x | y |", 1, 2, "> | a | b | c |\n> | --- | --- | --- |\n> | x | y | NEW |"],
    ["| a | b | c |\r\n| --- | --- | --- |\r\n| x | y |", 1, 2, "| a | b | c |\r\n| --- | --- | --- |\r\n| x | y | NEW |"]
  ] as const)("materializes only the missing cell separators: %s", (source, row, column, expected) => {
    const plan = planTableUpdateCell(contextAt(source, source.indexOf("a")), { row, column, offsetInCell: 3 }, "NEW");
    expect(applyPlan(source, plan)).toBe(expected);
    expect(plan?.edits).toHaveLength(1);
    expect(plan?.edits[0]?.from).toBe(plan?.edits[0]?.to);
  });

  it("preserves escaped siblings and escapes new pipes when materializing a missing cell", () => {
    const source = "| a | b | c |\n| :---: | ---: | --- |\n|  x\\|q  |  y  |";
    const target = { row: 1, column: 2, offsetInCell: 3 };
    const edited = applyPlan(source, planTableUpdateCell(contextAt(source, 0), target, "N|W"));
    expect(edited).toBe(source + " N\\|W |");
    expect(readTableSnapshot(contextAt(edited, 0))?.rows[0]).toEqual(["x|q", "y", "N|W"]);
    expect(planTableUpdateCell(contextAt(source, 0), target, "")?.edits).toEqual([]);
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

