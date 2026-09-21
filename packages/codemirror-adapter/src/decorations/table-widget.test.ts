// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { parseMarkdownDocument, type TableBlock } from "@fishmark/markdown-engine";

import {
  TableWidget,
  createTableWidgetDecoration,
  type TableWidgetCallbacks,
  type TableWidgetRenderOptions
} from "./table-widget";

// These fixtures build the real widget, then drive it with real DOM events: the assertions are about
// the observable contract (callback args, cancellations, no writes), never about private state.

type TablePosition = {
  readonly row: number;
  readonly column: number;
  readonly tableStartOffset?: number;
  readonly offsetInCell?: number;
};

// The widget consumes a canonical snapshot, never raw text, so the fixture is parsed once and reused.
const TABLE_SOURCE = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");

type PositionCallback = (position: TablePosition, options?: { restoreDomFocus?: boolean }) => void;
type UpdateCallback = (position: TablePosition, text: string) => void;
type CallbackSpies = {
  readonly selectCell: MockedFunction<PositionCallback>;
  readonly updateCell: MockedFunction<UpdateCallback>;
  readonly moveToNextCell: MockedFunction<PositionCallback>;
  readonly moveToPreviousCell: MockedFunction<PositionCallback>;
  readonly moveUp: MockedFunction<PositionCallback>;
  readonly moveDown: MockedFunction<PositionCallback>;
  readonly moveLeft: MockedFunction<PositionCallback>;
  readonly moveRight: MockedFunction<PositionCallback>;
  readonly moveDownOrExit: MockedFunction<PositionCallback>;
  readonly insertRowBelow: MockedFunction<PositionCallback>;
};

// The spies implement the widget's callback DTO exactly, so the fixture can pass them straight
// through without a cast: the test and the widget share one contract.
function createCallbackSpies(): CallbackSpies {
  return {
    selectCell: vi.fn<PositionCallback>(),
    updateCell: vi.fn<UpdateCallback>(),
    moveToNextCell: vi.fn<PositionCallback>(),
    moveToPreviousCell: vi.fn<PositionCallback>(),
    moveUp: vi.fn<PositionCallback>(),
    moveDown: vi.fn<PositionCallback>(),
    moveLeft: vi.fn<PositionCallback>(),
    moveRight: vi.fn<PositionCallback>(),
    moveDownOrExit: vi.fn<PositionCallback>(),
    insertRowBelow: vi.fn<PositionCallback>()
  } satisfies TableWidgetCallbacks;
}

function parseTableBlock(source: string = TABLE_SOURCE): TableBlock {
  const block = parseMarkdownDocument(source).blocks.find((candidate) => candidate.type === "table");

  if (block?.type !== "table") {
    throw new Error("Expected a table block");
  }

  return block;
}

function createWidget(
  spies: CallbackSpies,
  options: {
    block?: TableBlock;
    source?: string;
    renderOptions?: TableWidgetRenderOptions;
  } = {}
): { readonly widget: TableWidget; readonly dom: HTMLElement } {
  const block = options.block ?? parseTableBlock();
  const decoration = createTableWidgetDecoration(
    block,
    { row: 1, column: 0 },
    spies,
    options.source ?? TABLE_SOURCE,
    options.renderOptions ?? {}
  );
  const widget = decoration.value.spec.widget as TableWidget;

  return { widget, dom: widget.toDOM() };
}

function readCell(dom: HTMLElement, row: number, column: number): HTMLElement {
  const editor = dom.querySelector<HTMLElement>(`[data-table-cell="${row}:${column}"]`);

  if (!editor) {
    throw new Error(`Missing cell editor ${row}:${column}`);
  }

  return editor;
}

// `input`/`keydown` handlers read the caret through `document.getSelection()`, which is global state
// in jsdom; the widget's editor facade mirrors the standard textarea `setSelectionRange` API.
function setCellCaret(editor: HTMLElement, offsetInCell: number): void {
  (editor as HTMLElement & { setSelectionRange: (start: number, end: number) => void }).setSelectionRange(
    offsetInCell,
    offsetInCell
  );
}

function expectNoDispatch(spies: CallbackSpies): void {
  Object.entries(spies).forEach(([name, spy]) => {
    expect(spy, `${name} must not fire for a widget that is no longer live`).not.toHaveBeenCalled();
  });
}

// Lets a pending zero-delay composition fallback run.
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
});

describe("table widget cell dispatch ownership", () => {
  it("drops input, composition fallback and keydown from a widget the view already removed", async () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    // The widget was rendered once, then thrown away by the view before the user's events land: its
    // root no longer hangs off the tree the editor is mounted in.
    dom.remove();

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await nextTask();

    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true })
    );
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await nextTask();

    expectNoDispatch(spies);
  });

  it("keeps a pending composition alive when the widget is reused in place", async () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { widget, dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));

    // CodeMirror reuses the DOM for the same widget position: no destroy hook runs, so the queued
    // fallback must still deliver the committed cell text exactly once.
    expect(widget.updateDOM(dom)).toBe(true);
    await nextTask();

    expect(spies.updateCell).toHaveBeenCalledTimes(1);
    expect(spies.updateCell).toHaveBeenCalledWith(
      {
        row: 1,
        column: 0,
        tableStartOffset: 0,
        offsetInCell: "pen".length
      },
      "pen"
    );
  });

  it("cancels a queued composition fallback when the widget is torn down", async () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { widget, dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    // The fallback is now pending. The view tears the widget down before it fires, which is exactly
    // the window in which a stale `tableStartOffset` used to be able to reach the model.
    widget.destroy(dom);

    await nextTask();
    await nextTask();

    expectNoDispatch(spies);
    expect(editor.dataset.tableCellPendingCompositionCommit).toBeUndefined();
  });

  it("drops stale events once this widget instance no longer owns the cell DOM", async () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    setCellCaret(editor, "pen".length);
    // The cell editor is still connected to the document, but nothing about it belongs to a live
    // table widget anymore, so it must not write through the stale `tableStartOffset` it cached.
    document.body.appendChild(editor);

    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true })
    );

    expectNoDispatch(spies);
  });

  it("dispatches for a mounted widget through the same callback contract as before", () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    const expectedPosition: TablePosition = {
      row: 1,
      column: 0,
      tableStartOffset: 0,
      offsetInCell: "pen".length
    };

    expect(spies.updateCell).toHaveBeenCalledTimes(1);
    expect(spies.updateCell).toHaveBeenCalledWith(expectedPosition, "pen");

    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true })
    );

    expect(spies.moveDown).toHaveBeenCalledTimes(1);
    expect(spies.moveDown).toHaveBeenCalledWith(expectedPosition);
    expect(spies.updateCell).toHaveBeenCalledTimes(1);
  });

  it("commits a composition once the fallback fires for a widget that stays mounted", async () => {
    const spies = createCallbackSpies();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { dom } = createWidget(spies);
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    // An input event delivered while the IME is still composing must not commit directly...
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(spies.updateCell).not.toHaveBeenCalled();

    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await nextTask();

    // ...but the fallback must still deliver the IME result exactly once.
    expect(spies.updateCell).toHaveBeenCalledTimes(1);
    expect(spies.updateCell).toHaveBeenCalledWith(
      {
        row: 1,
        column: 0,
        tableStartOffset: 0,
        offsetInCell: "pen".length
      },
      "pen"
    );
  });

  it("keeps the widget's own table offset when the cell DOM is nested in a replaced table", async () => {
    const spies = createCallbackSpies();
    const source = ["Intro paragraph.", "", TABLE_SOURCE].join("\n");
    const block = parseTableBlock(source);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { dom } = createWidget(spies, { block, source });
    host.appendChild(dom);
    const editor = readCell(dom, 1, 0);

    expect(dom.dataset.tableStartOffset).toBe(String(block.startOffset));

    setCellCaret(editor, "pen".length);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    expect(spies.updateCell).toHaveBeenCalledWith(
      {
        row: 1,
        column: 0,
        tableStartOffset: block.startOffset,
        offsetInCell: "pen".length
      },
      "pen"
    );
  });
});
