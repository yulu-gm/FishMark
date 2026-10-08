// @vitest-environment jsdom

import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { refreshMarkdownDecorations } from "@fishmark/codemirror-adapter";

import { createCodeEditorController, type CodeEditorController } from "./code-editor";

const rangeGeometryDescriptors = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const name of ["getClientRects", "getBoundingClientRect"]) {
    rangeGeometryDescriptors.set(name, Object.getOwnPropertyDescriptor(Range.prototype, name));
    if (!(name in Range.prototype)) Object.defineProperty(Range.prototype, name, {
      configurable: true,
      value: name === "getClientRects" ? () => [] : () => new DOMRect()
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of rangeGeometryDescriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

const mounted: Array<{ controller: CodeEditorController; host: HTMLElement; input: HTMLInputElement }> = [];
afterEach(() => {
  for (const { controller, host, input } of mounted.splice(0)) {
    controller.destroy();
    host.remove();
    input.remove();
  }
});

async function createSearchEditor(source: string) {
  const host = document.createElement("div");
  const input = document.createElement("input");
  document.body.append(host, input);
  const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn() });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  mounted.push({ controller, host, input });
  await controller.prepareFindReplace();
  input.focus();
  return { controller, view, host, input };
}

const flushView = async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const selectedCells = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>(".cm-table-search-match"));

describe("table search navigation", () => {
  const source = "| Name | Value |\n| --- | --- |\n| alpha alpha | beta |\n| gamma | alpha |\n";

  it("reveals the selected table cell while preserving search focus and the complete match range", async () => {
    const { controller, host, input } = await createSearchEditor(source);
    const first = source.indexOf("alpha");
    expect(controller.updateFindReplaceQuery({ search: "alpha", replace: "" })).toEqual({
      matchCount: 3, currentMatchIndex: 1
    });
    await flushView();
    expect(selectedCells(host)).toHaveLength(1);
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("1:0");
    expect(controller.getSelection()).toEqual({ anchor: first, head: first + 5 });
    expect(document.activeElement).toBe(input);

    expect(controller.findNextMatch().currentMatchIndex).toBe(2);
    await flushView();
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("1:0");
    expect(controller.getSelection()).toEqual({ anchor: first + 6, head: first + 11 });
    expect(controller.findNextMatch().currentMatchIndex).toBe(3);
    await flushView();
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("2:1");
    expect(controller.findPreviousMatch().currentMatchIndex).toBe(2);
    await flushView();
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("1:0");
    expect(document.activeElement).toBe(input);
    expect(controller.getContent()).toBe(source);
  });

  it("resolves a refreshed table from current source offsets and clears presentation when search closes", async () => {
    const { controller, view, host, input } = await createSearchEditor(source);
    controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    controller.findNextMatch();
    controller.findNextMatch();
    await flushView();
    const prefix = "Inserted before table\n\n";
    view.dispatch({ changes: { from: 0, insert: prefix } });
    refreshMarkdownDecorations(view);
    await flushView();
    expect(selectedCells(host)).toHaveLength(1);
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("2:1");
    expect(controller.getSelection()).toEqual({ anchor: prefix.length + source.lastIndexOf("alpha"),
      head: prefix.length + source.lastIndexOf("alpha") + 5 });
    expect(document.activeElement).toBe(input);
    controller.clearFindReplaceQuery();
    await flushView();
    expect(selectedCells(host)).toHaveLength(0);
  });

  it("does not let a queued table caret transfer steal focus or collapse a newer search match", async () => {
    const { controller, view, host, input } = await createSearchEditor(source);
    view.focus();
    view.dispatch({ selection: { anchor: source.indexOf("alpha") } });
    input.focus();
    controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    await flushView();
    expect(selectedCells(host)).toHaveLength(1);
    expect(document.activeElement).toBe(input);
    expect(view.state.selection.main.to - view.state.selection.main.from).toBe(5);
    expect(controller.findNextMatch().currentMatchIndex).toBe(2);
  });

  it("uses the source view and leaves cross-cell matches to source navigation", async () => {
    const { controller, host, input } = await createSearchEditor(source);
    controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    await flushView();
    controller.setViewMode("source");
    await flushView();
    expect(selectedCells(host)).toHaveLength(0);
    expect(controller.findNextMatch().currentMatchIndex).toBe(2);
    controller.setViewMode("wysiwym");
    controller.updateFindReplaceQuery({ search: "alpha | beta", replace: "" });
    await flushView();
    expect(selectedCells(host)).toHaveLength(0);
    expect(document.activeElement).toBe(input);
    expect(controller.getContent()).toBe(source);
  });
});
