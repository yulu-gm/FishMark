// @vitest-environment jsdom

import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { refreshMarkdownDecorations } from "@fishmark/codemirror-adapter";
import { undo } from "@codemirror/commands";
import { SearchQuery, setSearchQuery } from "./search-runtime";

import { createCodeEditorController, type CodeEditorController, type FindReplaceSnapshot } from "./code-editor";

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
    expect(controller.updateFindReplaceQuery({ search: "alpha", replace: "" })).toMatchObject({
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

  it("selects a result's exact range through the existing table presentation", async () => {
    const { controller, host, input } = await createSearchEditor(source);
    const snapshot = controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    expect(snapshot.matches.map(match => [match.from, match.to, match.line, match.column])).toEqual([
      [source.indexOf("alpha"), source.indexOf("alpha") + 5, 3, 3],
      [source.indexOf("alpha") + 6, source.indexOf("alpha") + 11, 3, 9],
      [source.lastIndexOf("alpha"), source.lastIndexOf("alpha") + 5, 4, 11]
    ]);
    expect(controller.selectFindReplaceMatch(snapshot.matches[2]!).currentMatchIndex).toBe(3);
    await flushView();
    expect(selectedCells(host)[0]?.dataset.tableCell).toBe("2:1");
    expect(controller.getSelection()).toEqual({ anchor: source.lastIndexOf("alpha"), head: source.lastIndexOf("alpha") + 5 });
    expect(document.activeElement).toBe(input);
    expect(controller.getContent()).toBe(source);
  });
});

describe("canonical search results", () => {
  it("publishes query, navigation, edits, replacement, undo and state replacement", async () => {
    const { controller, view } = await createSearchEditor("alpha\nalpha");
    const listener = vi.fn();
    const unsubscribe = controller.subscribeFindReplace(listener);
    controller.updateFindReplaceQuery({ search: "alpha", replace: "beta" });
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0]).toMatchObject({ matchCount: 2, currentMatchIndex: 1 });
    controller.findNextMatch();
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0].currentMatchIndex).toBe(2);
    view.dispatch({ changes: { from: 0, insert: "alpha\n" } });
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0]).toMatchObject({ matchCount: 3, currentMatchIndex: 3 });
    expect(listener.mock.lastCall?.[0].matches[2].line).toBe(3);
    controller.replaceAllMatches();
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0].matches).toEqual([]);
    undo(view);
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0].matchCount).toBe(3);
    controller.replaceDocument("alpha");
    await Promise.resolve();
    expect(listener.mock.lastCall?.[0].matches).toEqual([]);
    const calls = listener.mock.calls.length;
    unsubscribe();
    controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("rejects stale objects after query, source and load identity changes, and during composition", async () => {
    const { controller, view } = await createSearchEditor("alpha alpha");
    const old = controller.updateFindReplaceQuery({ search: "alpha", replace: "" }).matches[1]!;
    controller.updateFindReplaceQuery({ search: "ALPHA", replace: "" });
    controller.selectFindReplaceMatch(old);
    expect(controller.getSelection()).toEqual({ anchor: 0, head: 5 });
    const beforeEdit = controller.updateFindReplaceQuery({ search: "alpha", replace: "" }).matches[1]!;
    view.dispatch({ changes: { from: 0, to: 5, insert: "ALPHA" } });
    controller.selectFindReplaceMatch(beforeEdit);
    expect(controller.getSelection()).not.toEqual({ anchor: 6, head: 11 });
    const beforeIdentity = controller.updateFindReplaceQuery({ search: "alpha", replace: "" }).matches[1]!;
    controller.setDocumentIdentity({ tabId: "new-tab", epoch: 2, loadRevision: 1 });
    controller.selectFindReplaceMatch(beforeIdentity);
    expect(controller.getSelection()).not.toEqual({ anchor: 6, head: 11 });
    const current = controller.updateFindReplaceQuery({ search: "alpha", replace: "" }).matches[1]!;
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const selection = controller.getSelection();
    controller.selectFindReplaceMatch(current);
    expect(controller.getSelection()).toEqual(selection);
  });

  it("projects the current CodeMirror regex cursor including multiline matches", async () => {
    const { controller, view } = await createSearchEditor("alpha\nBETA\nalpha\nbeta");
    controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "alpha\\n(beta)", regexp: true })) });
    const listener = vi.fn<(snapshot: FindReplaceSnapshot) => void>();
    controller.subscribeFindReplace(listener);
    const snapshot = listener.mock.lastCall![0];
    expect(snapshot.matchCount).toBe(2);
    expect(snapshot.matches.map(match => [match.from, match.to])).toEqual([[0, 10], [11, 21]]);
    expect(snapshot.matches[0]!.snippet).toBe("alpha BETA");
    controller.selectFindReplaceMatch(snapshot.matches[1]!);
    expect(controller.getSelection()).toEqual({ anchor: 11, head: 21 });
  });

  it("keeps every canonical match available for large result sets", async () => {
    const { controller } = await createSearchEditor("alpha ".repeat(5001));
    const snapshot = controller.updateFindReplaceQuery({ search: "alpha", replace: "" });
    expect(snapshot.matchCount).toBe(5001);
    expect(snapshot.matches).toHaveLength(5001);
    expect(snapshot.matches.every(match => match.snippet.length <= 102)).toBe(true);
    expect(controller.selectFindReplaceMatch(snapshot.matches[5000]!).currentMatchIndex).toBe(5001);
    expect(controller.getSelection()).toEqual({ anchor: 30000, head: 30005 });
  });
});
