// @vitest-environment jsdom

import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

import { createCodeEditorController } from "./code-editor";

const getEditorView = (host: HTMLElement) => {
  const editorRoot = host.querySelector(".cm-editor");

  expect(editorRoot).not.toBeNull();

  return editorRoot instanceof HTMLElement ? EditorView.findFromDOM(editorRoot) : null;
};

const dispatchEditorKeydown = (
  view: EditorView | null,
  key: string,
  options: Pick<KeyboardEventInit, "altKey" | "ctrlKey" | "metaKey" | "shiftKey"> = {}
) => {
  view?.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }));
};

const flushMicrotasks = async () => {
  await Promise.resolve();
};

type TableCellEditorElement = HTMLElement & {
  value: string;
};

describe("table editing in createCodeEditorController", () => {
  it("keeps edits made in an auto-materialized table after focus moves to another cell", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const source = "| A | B |";
    const onBlur = vi.fn();

    const controller = createCodeEditorController({
      parent: host,
      initialContent: source,
      onChange: vi.fn(),
      onBlur
    });
    const view = getEditorView(host);

    expect(view).not.toBeNull();

    view!.focus();
    view!.dispatch({
      selection: {
        anchor: source.length,
        head: source.length
      }
    });
    dispatchEditorKeydown(view, "Enter");
    await flushMicrotasks();
    await flushMicrotasks();

    const firstEditableCell = document.activeElement as TableCellEditorElement | null;
    const secondEditableCell = host.querySelector<TableCellEditorElement>('[data-table-cell="1:1"]');

    expect(firstEditableCell).toBeInstanceOf(HTMLElement);
    expect(secondEditableCell).toBeInstanceOf(HTMLElement);
    expect(firstEditableCell?.getAttribute("data-table-cell")).toBe("1:0");
    expect(firstEditableCell?.value).toBe("");
    expect(secondEditableCell?.value).toBe("");

    firstEditableCell!.value = "alpha";
    firstEditableCell?.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    secondEditableCell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    secondEditableCell?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    secondEditableCell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const refreshedFirstEditableCell = host.querySelector<TableCellEditorElement>('[data-table-cell="1:0"]');

    expect(onBlur).not.toHaveBeenCalled();
    expect(refreshedFirstEditableCell?.value).toBe("alpha");
    expect(controller.getContent()).toBe(
      ["| A | B |", "| :--- | :--- |", "|  alpha |   |"].join("\n")
    );

    controller.destroy();
    host.remove();
  });
});

// Exercise the same widget callbacks as real contenteditable input. DOM events are
// synthetic here; the Electron suite additionally verifies Chromium and menu history.
describe("table document history", () => {
  const cases = [
    ["missing header", "| a | b |\n| --- | --- | --- |\n| x | y | z |\n", "0:2"],
    ["missing body", "| a | b | c |\n| --- | --- | --- |\n| x | y |\n", "1:2"],
    ["no closing pipe", "a | b | c\n--- | --- | ---\nx | y\n", "1:2"],
    ["multiple missing cells", "| a | b |\n| --- | --- | --- | --- |\n| w | x | y | z |\n", "0:3"],
    ["existing escaped cell", "| a | b |\n| --- | ---: |\n|  x\\|y  | z |\n", "1:0"]
  ];

  function setup(source: string) {
    const host = document.createElement("div");
    document.body.append(host);
    const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn() });
    const view = getEditorView(host)!;
    const cell = (id: string) => host.querySelector<HTMLElement>(`[data-table-cell="${id}"]`)!;
    const input = async (id: string, text: string, inputType = "insertText") => {
      const editor = cell(id);
      if (document.activeElement !== editor) {
        editor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await flushMicrotasks();
      }
      editor.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(editor); range.collapse(false);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
      await flushMicrotasks();
    };
    const history = async (id: string, redo = false) => {
      const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: redo ? "historyRedo" : "historyUndo" });
      cell(id).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await flushMicrotasks();
    };
    return { controller, view, cell, input, history, destroy() { controller.destroy(); host.remove(); } };
  }

  it.each(cases)("undoes and redoes text and structure atomically: %s", async (_label, source, id) => {
    const f = setup(source!);
    try {
      for (const text of ["X", "XY", "XYZ"]) await f.input(id!, text);
      const edited = f.controller.getContent();
      expect(edited).toContain("XYZ");
      await f.history(id!);
      expect(f.controller.getContent()).toBe(source);
      await f.history(id!, true);
      expect(f.controller.getContent()).toBe(edited);
      await f.input(id!, "XYZnew");
      await f.history(id!);
      expect(f.controller.getContent()).toBe(edited);
      await f.history(id!);
      expect(f.controller.getContent()).toBe(source);
    } finally { f.destroy(); }
  });

  it("keeps clear/retype/cross-cell steps and redo branches in document order", async () => {
    const source = "| a | b | c |\n| --- | --- | --- |\n| x | y |\n";
    const f = setup(source);
    try {
      await f.input("1:2", "first"); const first = f.controller.getContent();
      await f.input("1:2", "", "deleteContentBackward"); const cleared = f.controller.getContent();
      expect(cleared).not.toBe(source);
      await f.input("1:2", "second"); const second = f.controller.getContent();
      await f.input("1:1", "other"); const other = f.controller.getContent();
      for (const expected of [second, cleared, first, source]) {
        await f.history("1:1"); expect(f.controller.getContent()).toBe(expected);
      }
      for (const expected of [first, cleared, second, other]) {
        await f.history("1:1", true); expect(f.controller.getContent()).toBe(expected);
      }
      await f.history("1:1");
      await f.input("1:2", "branch"); const branch = f.controller.getContent();
      await f.history("1:2", true); expect(f.controller.getContent()).toBe(branch);
      await f.history("1:2"); expect(f.controller.getContent()).toBe(second);
    } finally { f.destroy(); }
  });

  it("routes menu history only while the document owns focus and respects read-only mode", async () => {
    const source = "| a | b | c |\n| --- | --- | --- |\n| x | y |\n";
    const f = setup(source);
    const outside = document.createElement("input"); document.body.append(outside);
    try {
      await f.input("1:2", "typed"); const edited = f.controller.getContent();
      outside.focus();
      expect(f.controller.runHistory("undo")).toBe(false);
      expect(f.controller.runSelectAll()).toBe(false);
      expect(f.controller.getContent()).toBe(edited);
      f.cell("1:2").focus();
      expect(f.controller.runSelectAll()).toBe(true);
      expect(document.getSelection()?.toString()).toBe("typed");
      f.controller.setReadOnly(true);
      expect(f.controller.runHistory("undo")).toBe(true);
      expect(f.controller.getContent()).toBe(edited);
      f.controller.setReadOnly(false);
      expect(f.controller.runHistory("undo")).toBe(true);
      expect(f.controller.getContent()).toBe(source);
      expect(f.controller.runHistory("redo")).toBe(true);
      expect(f.controller.getContent()).toBe(edited);
    } finally { outside.remove(); f.destroy(); }
  });

  it("isolates paste and committed composition from earlier typing", async () => {
    const source = "| a | b | c |\n| --- | --- | --- |\n| x | y |\n";
    const f = setup(source);
    try {
      await f.input("1:2", "typed"); const typed = f.controller.getContent();
      await f.input("1:2", "typed pasted", "insertFromPaste"); const pasted = f.controller.getContent();
      await f.input("1:2", "typed pasted中文", "insertCompositionText"); const composed = f.controller.getContent();
      for (const expected of [pasted, typed, source]) {
        await f.history("1:2"); expect(f.controller.getContent()).toBe(expected);
      }
      for (const expected of [typed, pasted, composed]) {
        await f.history("1:2", true); expect(f.controller.getContent()).toBe(expected);
      }
    } finally { f.destroy(); }
  });
});
