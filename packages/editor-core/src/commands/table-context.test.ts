import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { deriveTableCursorState } from "../table-cursor-state";
import { readTableContext } from "./table-context";

const buildTableContext = (doc: string, anchor: number, head = anchor) => {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head }
  );
  activeState.tableCursor = deriveTableCursorState(doc, { anchor, head }, activeState.blockMap, null);

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

  it("returns null when the active block is not a table", () => {
    expect(buildTableContext("Paragraph", 2)).toBeNull();
  });
});
