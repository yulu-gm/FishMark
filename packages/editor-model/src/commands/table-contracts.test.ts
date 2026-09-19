import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planTableExitBelow, planTableInsertRowBelow, planTableNextCell, planTablePreviousCell, tablePositionAt } from "./table";

const TABLE = "| name | qty |\n| --- | ---: |\n| pen | 2 |";
function context(source: string, anchor: number) {
  return createEditorSemanticContext({
    snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)),
    selection: { anchor, head: anchor }
  });
}

// Retained source and selection contracts from editor-core's retired table-edit helpers.
describe("table command contracts", () => {
  it("moves Tab to the next body cell without changing Markdown", () => {
    const plan = planTableNextCell(context(TABLE, TABLE.indexOf("pen") + 1));
    expect(plan?.edits).toEqual([]);
    expect(tablePositionAt(context(TABLE, plan!.selection.anchor))).toMatchObject({ row: 1, column: 1 });
  });

  it("moves Shift-Tab to the previous body cell without changing Markdown", () => {
    const plan = planTablePreviousCell(context(TABLE, TABLE.indexOf("2")));
    expect(plan?.edits).toEqual([]);
    expect(tablePositionAt(context(TABLE, plan!.selection.anchor))).toMatchObject({ row: 1, column: 0 });
  });

  it("inserts one aligned row and selects its first cell", () => {
    const plan = planTableInsertRowBelow(context(TABLE, TABLE.indexOf("pen") + 1));
    const expected = "| name | qty |\n| :--- | ---: |\n| pen  |   2 |\n|      |     |";
    expect(plan?.edits).toEqual([{ from: 0, to: TABLE.length, insert: expected }]);
    expect(tablePositionAt(context(expected, plan!.selection.anchor))).toMatchObject({ row: 2, column: 0 });
  });

  it.each(["", "\n"])("creates an editable line after a table ending in %j", (suffix) => {
    const source = TABLE + suffix;
    const plan = planTableExitBelow(context(source, source.indexOf("2")));
    expect(plan?.edits).toEqual([{ from: source.length, to: source.length, insert: suffix === "" ? "\n\n" : "\n" }]);
    expect(plan?.selection).toEqual({ anchor: TABLE.length + 2, head: TABLE.length + 2 });
  });
});
