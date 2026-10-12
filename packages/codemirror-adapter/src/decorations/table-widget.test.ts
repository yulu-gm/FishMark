// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { parseMarkdownDocument, type TableBlock } from "@fishmark/markdown-engine";
import { BlockType, type BlockInfo } from "@codemirror/view";

import {
  TableWidget,
  createTableWidgetDecoration,
  readMountedTableWidgetHeight,
  readTableWidgetHeightEstimate,
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
    activePosition?: TablePosition;
  } = {}
): { readonly widget: TableWidget; readonly dom: HTMLElement } {
  const block = options.block ?? parseTableBlock();
  const decoration = createTableWidgetDecoration(
    block,
    options.activePosition ?? { row: 1, column: 0 },
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

describe("mounted table height estimates", () => {
  function mount(spies = createCallbackSpies()) {
    const { widget, dom } = createWidget(spies);
    const host = document.createElement("div");
    host.appendChild(dom);
    document.body.appendChild(host);
    const view = { dom: host, requestMeasure: vi.fn() };
    const height = vi.spyOn(dom, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 500, 4243.8125));
    const read = (source = TABLE_SOURCE, context: TableWidgetRenderOptions = {}) =>
      readMountedTableWidgetHeight(view, parseTableBlock(source), source, context);
    return { widget, dom, host, view, height, read };
  }

  it("uses the live fractional height independently in two views sharing callbacks", () => {
    const spies = createCallbackSpies();
    const first = mount(spies), second = mount(spies);
    second.height.mockReturnValue(new DOMRect(0, 0, 300, 839.25));
    expect(first.read()).toBe(4243.8125);
    expect(second.read()).toBe(839.25);
    first.height.mockReturnValue(new DOMRect(0, 0, 250, 6800.5));
    expect(first.read()).toBe(6800.5);
    expect(second.read()).toBe(839.25);
    const next = createTableWidgetDecoration(parseTableBlock(), null, spies, TABLE_SOURCE, {}, first.read());
    expect(next.value.spec.widget.estimatedHeight).toBe(6800.5);
  });

  it("rejects another source, range, container, disconnected root or invalid measurement", () => {
    const mounted = mount();
    expect(mounted.read(TABLE_SOURCE.replace("pen", "ink"))).toBe(-1);
    expect(readMountedTableWidgetHeight(mounted.view,
      { ...parseTableBlock(), endOffset: TABLE_SOURCE.length - 1 }, TABLE_SOURCE, {})).toBe(-1);
    expect(mounted.read(TABLE_SOURCE, { containerClassName: "cm-table-widget-blockquote", containerDepth: 1 })).toBe(-1);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      mounted.height.mockReturnValue(new DOMRect(0, 0, 500, invalid));
      expect(mounted.read()).toBe(-1);
    }
    mounted.height.mockReturnValue(new DOMRect(0, 0, 500, 4243.8125));
    mounted.dom.remove();
    expect(mounted.read()).toBe(-1);
    mounted.host.appendChild(mounted.dom);
    expect(mounted.read()).toBe(4243.8125);
  });

  it("keeps the new owner measurement when an old widget is destroyed after DOM transfer", () => {
    const mounted = mount();
    const next = createWidget(createCallbackSpies(), { activePosition: { row: 1, column: 1 } });
    expect(next.widget.updateDOM(mounted.dom)).toBe(true);
    mounted.widget.destroy(mounted.dom);
    expect(mounted.read()).toBe(4243.8125);
    next.widget.destroy(mounted.dom);
    expect(mounted.read()).toBe(-1);
  });

  it("retains this view's known block height after viewport virtualization and prefers live geometry", () => {
    const mounted = mount();
    const block = parseTableBlock();
    const previous = {
      from: block.startOffset, to: block.endOffset, length: block.endOffset - block.startOffset,
      top: 0, bottom: 6800.5, height: 6800.5, type: BlockType.WidgetRange,
      widget: mounted.widget, widgetLineBreaks: 0
    } satisfies BlockInfo;
    const view = { ...mounted.view, contentHeight: 6800.5, documentPadding: { top: 0, bottom: 0 },
      lineBlockAt: vi.fn<() => BlockInfo>(() => previous) };
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(4243.8125);
    expect(view.lineBlockAt).not.toHaveBeenCalled();
    mounted.dom.remove();
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(6800.5);
    expect(view.lineBlockAt).toHaveBeenCalledWith(block.startOffset);
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE.replace("pen", "ink"), {})).toBe(-1);
    expect(readTableWidgetHeightEstimate(view, { ...block, startOffset: 1 }, TABLE_SOURCE, {})).toBe(-1);
    expect(readTableWidgetHeightEstimate(view, { ...block, endOffset: block.endOffset - 1 }, TABLE_SOURCE, {})).toBe(-1);
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, { containerDepth: 1 })).toBe(-1);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      view.lineBlockAt.mockReturnValue({ ...previous, height: invalid });
      expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(-1);
    }
    view.lineBlockAt.mockReturnValue({ ...previous, type: BlockType.Text });
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(-1);
    view.lineBlockAt.mockReturnValue({ ...previous, widget: null });
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(-1);
    view.lineBlockAt.mockReturnValue(previous);
    for (const compressed of [6999999, 7000000, 7000000.00001, Number.NaN, Number.POSITIVE_INFINITY]) {
      view.contentHeight = compressed;
      expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(-1);
    }
    view.contentHeight = 6999998.5 + 24;
    view.documentPadding = { top: 12, bottom: 12 };
    expect(readTableWidgetHeightEstimate(view, block, TABLE_SOURCE, {})).toBe(6800.5);
  });
});

describe("table cell native history DOM", () => {
  it("retains column ratios and updates the whole-table editable width floor without replacing cells", () => {
    const spies = createCallbackSpies(), { dom } = createWidget(spies);
    const editor = readCell(dom, 1, 0), columns = dom.querySelector("colgroup");
    const widths = () => Array.from(dom.querySelectorAll("col")).map(column => column.style.width);
    const floor = () => Number(dom.style.getPropertyValue("--fishmark-table-min-width-columns"));
    expect(widths()).toEqual(["50%", "50%"]);
    expect(floor()).toBe(2);
    const source = TABLE_SOURCE.replace("pen", "x".repeat(100));
    expect(new TableWidget(parseTableBlock(source), { row: 1, column: 0 }, spies, source).updateDOM(dom)).toBe(true);
    expect(widths()).toEqual(["77.78%", "22.22%"]);
    expect(floor() * 22.22).toBeCloseTo(100);
    expect(readCell(dom, 1, 0)).toBe(editor);
    expect(dom.querySelector("colgroup")).toBe(columns);
    expect(new TableWidget(parseTableBlock(), { row: 1, column: 0 }, spies, TABLE_SOURCE).updateDOM(dom)).toBe(true);
    expect(widths()).toEqual(["50%", "50%"]);
    expect(floor()).toBe(2);
  });

  it("keeps inert height reservations outside editable history and reuses them until canonical content changes", () => {
    const source = TABLE_SOURCE.replace("pen", "**中文** [link](https://example.test)");
    const block = parseTableBlock(source), spies = createCallbackSpies();
    const { dom } = createWidget(spies, { source, block });
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0), original = Array.from(editor.childNodes), layout = editor.parentElement!;
    const plain = layout.querySelector<HTMLElement>(".cm-table-widget-height-source")!;
    const preview = layout.querySelector<HTMLElement>(".cm-table-widget-height-preview")!;
    expect(editor.contains(plain)).toBe(false);
    expect(editor.contains(preview)).toBe(false);
    for (const reservation of [plain, preview]) {
      expect(reservation.getAttribute("aria-hidden")).toBe("true");
      expect(reservation.contentEditable).toBe("false");
      expect(reservation.inert).toBe(true);
      expect(reservation.hasAttribute("data-table-cell")).toBe(false);
    }
    const plainNode = plain.firstChild, previewNode = preview.firstChild;
    new TableWidget(block, { row: 1, column: 1 }, spies, source).updateDOM(dom);
    new TableWidget(block, { row: 1, column: 0 }, spies, source).updateDOM(dom);
    expect(plain.firstChild).toBe(plainNode);
    expect(preview.firstChild).toBe(previewNode);
    expect(Array.from(editor.childNodes)).toEqual(original);
    const changed = source.replace("中文", "修改");
    createWidget(spies, { source: changed, block: parseTableBlock(changed) }).widget.updateDOM(dom);
    expect(plain.textContent).toBe("**修改** [link](https://example.test)");
    expect(preview.querySelector(".cm-inactive-inline-strong")?.textContent).toBe("修改");
    expect(readCell(dom, 1, 0)).toBe(editor);
  });

  it.each(["Alpha", "**中文**", "`code`"])("restores the same editable nodes after previewing %s", (text) => {
    const source = `| Name | Value |\n| --- | --- |\n| ${text} | Beta |`;
    const spies = createCallbackSpies();
    const { dom } = createWidget(spies, { source, block: parseTableBlock(source) });
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0);
    const originalNodes = Array.from(editor.childNodes);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const inactive = createWidget(spies, { source, block: parseTableBlock(source), activePosition: { row: 1, column: 1 } });
      expect(inactive.widget.updateDOM(dom)).toBe(true);
      expect(editor.textContent).toBe(text);
      if (text === "**中文**") expect(editor.querySelector(".cm-inactive-inline-strong")?.textContent).toBe("中文");
      const active = createWidget(spies, { source, block: parseTableBlock(source) });
      expect(active.widget.updateDOM(dom)).toBe(true);
      expect(Array.from(editor.childNodes)).toEqual(originalNodes);
      originalNodes.forEach((node, index) => expect(editor.childNodes[index]).toBe(node));
      expect(editor.querySelector(".cm-inactive-inline-marker")).toBeNull();
    }
  });

  it("does not restore parked text after a document history update changes that cell", () => {
    const spies = createCallbackSpies();
    const { dom } = createWidget(spies);
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0), previousNode = editor.firstChild;
    createWidget(spies, { activePosition: { row: 1, column: 1 } }).widget.updateDOM(dom);
    const source = TABLE_SOURCE.replace("pen", "pencil");
    createWidget(spies, { source, block: parseTableBlock(source), activePosition: { row: 1, column: 1 } }).widget.updateDOM(dom);
    createWidget(spies, { source, block: parseTableBlock(source) }).widget.updateDOM(dom);
    expect(editor.textContent).toBe("pencil");
    expect(editor.firstChild).not.toBe(previousNode);
  });

  it("rejects parked nodes mutated while detached rather than overwriting canonical source", () => {
    const spies = createCallbackSpies();
    const { dom } = createWidget(spies);
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0), original = editor.firstChild!;
    createWidget(spies, { activePosition: { row: 1, column: 1 } }).widget.updateDOM(dom);
    original.textContent = "stale browser mutation";
    createWidget(spies).widget.updateDOM(dom);
    expect(editor.textContent).toBe("pen");
    expect(editor.firstChild).not.toBe(original);
  });

  it("restores the native target's original nodes before history input while another cell is active", () => {
    const spies = createCallbackSpies();
    const { dom } = createWidget(spies);
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0), original = editor.firstChild!;
    createWidget(spies, { activePosition: { row: 1, column: 1 } }).widget.updateDOM(dom);
    editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "historyUndo" }));
    expect(editor.firstChild).toBe(original);
    original.textContent = "pencil";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" }));
    expect(spies.updateCell.mock.calls[0]?.[1]).toBe("pencil");
  });

  it("retains rich inactive preview and its parked nodes when native history changes nothing", () => {
    const source = TABLE_SOURCE.replace("pen", "**中文**"), spies = createCallbackSpies();
    const { dom } = createWidget(spies, { source, block: parseTableBlock(source) });
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0), original = editor.firstChild;
    createWidget(spies, { source, block: parseTableBlock(source), activePosition: { row: 1, column: 1 } }).widget.updateDOM(dom);
    const preview = editor.querySelector(".cm-inactive-inline-strong");
    editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "historyUndo" }));
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" }));
    expect(spies.updateCell).not.toHaveBeenCalled();
    expect(editor.querySelector(".cm-inactive-inline-strong")).toBe(preview);
    createWidget(spies, { source, block: parseTableBlock(source) }).widget.updateDOM(dom);
    expect(editor.firstChild).toBe(original);
  });

  it.each(["historyUndo", "historyRedo"])("does not commit unchanged %s input, but commits actual text restoration", (inputType) => {
    const spies = createCallbackSpies();
    const { dom } = createWidget(spies);
    document.body.appendChild(dom);
    const editor = readCell(dom, 1, 0);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
    expect(spies.updateCell).not.toHaveBeenCalled();
    editor.textContent = "pencil";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
    expect(spies.updateCell).toHaveBeenCalledTimes(1);
    expect(spies.updateCell.mock.calls[0]?.[1]).toBe("pencil");
  });
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
