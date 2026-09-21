import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";

import { createActiveBlockState, deriveTableCursorState } from "@fishmark/editor-model";
import { readTableContext } from "./table-context";

const snapshotFor = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

const buildTableContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const snapshot = snapshotFor(doc);
  const activeState = createActiveBlockState(snapshot, { anchor, head });
  activeState.tableCursor = deriveTableCursorState(snapshot, { anchor, head }, null);

  return readTableContext(state, activeState);
};

describe("readTableContext", () => {
  it("reads the active table cell context from the active block", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const ctx = buildTableContext(doc, doc.indexOf("pen") + 1);

    expect(ctx).toMatchObject({
      position: { row: 1, column: 0 },
      columnCount: 2,
      cell: {
        text: "pen"
      },
      model: {
        header: ["name", "qty"],
        rows: [["pen", "2"]]
      }
    });
  });

  it("reads table context for quote-internal table cells", () => {
    const doc = ["> | name | qty |", "> | --- | ---: |", "> | pen | 2 |"].join("\n");
    const context = buildTableContext(doc, doc.indexOf("pen"));

    expect(context).toMatchObject({
      block: {
        type: "table",
        startOffset: 0
      },
      cell: {
        text: "pen",
        rowIndex: 1,
        columnIndex: 0
      },
      position: {
        mode: "inside",
        tableStartOffset: 0,
        row: 1,
        column: 0,
        offsetInCell: 0
      },
      columnCount: 2
    });
  });

  it("returns null when the active block is not a table", () => {
    expect(buildTableContext("Paragraph", 2)).toBeNull();
  });
});
