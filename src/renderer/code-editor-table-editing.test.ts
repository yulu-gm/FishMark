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

    const firstEditableCell = document.activeElement as HTMLInputElement | null;
    const secondEditableCell = host.querySelector<HTMLInputElement>('[data-table-cell="1:1"]');

    expect(firstEditableCell).toBeInstanceOf(HTMLInputElement);
    expect(secondEditableCell).toBeInstanceOf(HTMLInputElement);
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

    const refreshedFirstEditableCell = host.querySelector<HTMLInputElement>('[data-table-cell="1:0"]');

    expect(onBlur).not.toHaveBeenCalled();
    expect(refreshedFirstEditableCell?.value).toBe("alpha");
    expect(controller.getContent()).toBe(
      ["| A     | B |", "| :---- | :--- |", "| alpha |   |"].join("\n")
    );

    controller.destroy();
    host.remove();
  });
});
