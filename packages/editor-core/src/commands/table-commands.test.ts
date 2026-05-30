// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import { deriveTableCursorState } from "../table-cursor-state";
import { runMarkdownTab } from "./codemirror-markdown-commands";
import {
  runTableBackspaceFromLineBelow,
  runTableEnterFromLineBelow,
  runTableInsertRowBelow,
  runTableMoveDown,
  runTableMoveLeft,
  runTableMoveRight,
  runTableMoveUp,
  runTableNextCell
} from "./table-commands";

const createHarness = (doc: string, anchor: number) => {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor }
    }),
    parent: document.createElement("div")
  });
  const activeState = createActiveBlockStateFromMarkdownDocument(
    parseMarkdownDocument(doc),
    { anchor, head: anchor }
  );
  const activeStateWithCursor = {
    ...activeState,
    tableCursor: deriveTableCursorState(doc, { anchor, head: anchor }, activeState.blockMap, null)
  };

  return {
    view,
    activeState: activeStateWithCursor,
    destroy: () => view.destroy()
  };
};

describe("table commands", () => {
  it("dispatches table next-cell navigation from Tab before list indent fallback", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const harness = createHarness(doc, doc.indexOf("pen") + 1);
    const dispatchSpy = vi.fn(harness.view.dispatch.bind(harness.view));

    harness.view.dispatch = dispatchSpy as unknown as typeof harness.view.dispatch;

    expect(runMarkdownTab(harness.view, harness.activeState)).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("2"));

    harness.destroy();
  });

  it("dispatches insert-row-below from Mod-Enter in table context", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const harness = createHarness(doc, doc.indexOf("pen") + 1);
    const dispatchSpy = vi.fn(harness.view.dispatch.bind(harness.view));

    harness.view.dispatch = dispatchSpy as unknown as typeof harness.view.dispatch;

    expect(runTableInsertRowBelow(harness.view, harness.activeState)).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(harness.view.state.doc.toString()).toBe(
      ["| name | qty |", "| :--- | ---: |", "| pen  |   2 |", "|      |     |"].join("\n")
    );

    harness.destroy();
  });

  it("returns false when the selection is outside a table", () => {
    const harness = createHarness("Paragraph", 2);

    expect(runTableNextCell(harness.view, harness.activeState)).toBe(false);

    harness.destroy();
  });

  it("moves up and down within the same table column", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "| ink | 3 |"].join("\n");
    const harness = createHarness(doc, doc.indexOf("2"));

    expect(runTableMoveDown(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("3"));

    const nextActiveState = createActiveBlockStateFromMarkdownDocument(
      parseMarkdownDocument(harness.view.state.doc.toString()),
      {
        anchor: harness.view.state.selection.main.anchor,
        head: harness.view.state.selection.main.anchor
      }
    );
    nextActiveState.tableCursor = deriveTableCursorState(
      harness.view.state.doc.toString(),
      {
        anchor: harness.view.state.selection.main.anchor,
        head: harness.view.state.selection.main.anchor
      },
      nextActiveState.blockMap,
      harness.activeState.tableCursor
    );

    expect(runTableMoveUp(harness.view, nextActiveState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("2"));

    harness.destroy();
  });

  it("exits above the table when moving up from the first row", () => {
    const doc = ["Paragraph", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const harness = createHarness(doc, doc.indexOf("qty"));

    expect(runTableMoveUp(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe("Paragraph".length);

    harness.destroy();
  });

  it("exits below the table by skipping a single structural blank separator", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "", "After"].join("\n");
    const harness = createHarness(doc, doc.indexOf("pen"));

    expect(runTableMoveDown(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("After"));

    harness.destroy();
  });

  it("keeps the first extra blank row reachable below a table", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "", "", "After"].join("\n");
    const extraBlankLineStart = doc.indexOf("\n\n\n") + 2;
    const harness = createHarness(doc, doc.indexOf("pen"));

    expect(runTableMoveDown(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(extraBlankLineStart);

    harness.destroy();
  });

  it("keeps the first extra blank row reachable above a table", () => {
    const doc = ["Before", "", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const extraBlankLineStart = doc.indexOf("\n\n\n") + 2;
    const harness = createHarness(doc, doc.indexOf("qty"));

    expect(runTableMoveUp(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(extraBlankLineStart);

    harness.destroy();
  });

  it("skips structural blank separators around tables when the document uses CRLF", () => {
    const doc = [
      "Before",
      "",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
      "",
      "After"
    ].join("\r\n");
    const downHarness = createHarness(doc, doc.indexOf("pen"));

    expect(runTableMoveDown(downHarness.view, downHarness.activeState)).toBe(true);
    expect(downHarness.view.state.selection.main.anchor).toBe(doc.indexOf("After"));

    downHarness.destroy();

    const upHarness = createHarness(doc, doc.indexOf("qty"));

    expect(runTableMoveUp(upHarness.view, upHarness.activeState)).toBe(true);
    expect(upHarness.view.state.selection.main.anchor).toBe("Before".length);

    upHarness.destroy();
  });

  it("keeps a leading user-authored blank row reachable above a table", () => {
    const doc = ["", "| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const harness = createHarness(doc, doc.indexOf("qty"));

    expect(runTableMoveUp(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(0);

    harness.destroy();
  });

  it("moves left and right across cells only at cell boundaries", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const penStart = doc.indexOf("pen");
    const harness = createHarness(doc, penStart + 1);

    expect(runTableMoveLeft(harness.view, harness.activeState)).toBe(false);
    expect(harness.view.state.selection.main.anchor).toBe(penStart + 1);

    harness.view.dispatch({ selection: { anchor: penStart, head: penStart } });
    const startActiveState = createActiveBlockStateFromMarkdownDocument(
      parseMarkdownDocument(harness.view.state.doc.toString()),
      { anchor: penStart, head: penStart }
    );
    startActiveState.tableCursor = deriveTableCursorState(
      harness.view.state.doc.toString(),
      { anchor: penStart, head: penStart },
      startActiveState.blockMap,
      harness.activeState.tableCursor
    );

    expect(runTableMoveLeft(harness.view, startActiveState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("qty") + "qty".length);

    const qtyEnd = doc.indexOf("qty") + "qty".length;
    harness.view.dispatch({ selection: { anchor: qtyEnd, head: qtyEnd } });
    const endActiveState = createActiveBlockStateFromMarkdownDocument(
      parseMarkdownDocument(harness.view.state.doc.toString()),
      { anchor: qtyEnd, head: qtyEnd }
    );
    endActiveState.tableCursor = deriveTableCursorState(
      harness.view.state.doc.toString(),
      { anchor: qtyEnd, head: qtyEnd },
      endActiveState.blockMap,
      harness.activeState.tableCursor
    );

    expect(runTableMoveRight(harness.view, endActiveState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("pen"));

    harness.destroy();
  });

  it("enters the table from the adjacent line below", () => {
    const doc = ["| name | qty |", "| --- | ---: |", "| pen | 2 |", "", "After"].join("\n");
    const harness = createHarness(doc, doc.lastIndexOf("\n\n") + 1);

    expect(runTableEnterFromLineBelow(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("pen"));

    harness.destroy();
  });

  it("moves Backspace from the editable line below a table to the last cell", () => {
    const doc = ["| A | B | C |", "| --- | --- | --- |", "| 1 | 2 | 3 |", "", ""].join("\n");
    const harness = createHarness(doc, doc.length);

    expect(runTableBackspaceFromLineBelow(harness.view, harness.activeState)).toBe(true);
    expect(harness.view.state.selection.main.anchor).toBe(doc.indexOf("3") + "3".length);

    harness.destroy();
  });

  it("does not steal Backspace from non-empty text below a table", () => {
    const doc = ["| A | B | C |", "| --- | --- | --- |", "| 1 | 2 | 3 |", "", "---"].join("\n");
    const harness = createHarness(doc, doc.length);

    expect(runTableBackspaceFromLineBelow(harness.view, harness.activeState)).toBe(false);
    expect(harness.view.state.selection.main.anchor).toBe(doc.length);

    harness.destroy();
  });
});
