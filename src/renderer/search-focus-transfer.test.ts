// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { afterEach, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController } from "./code-editor";

const mounted: Array<{ controller: CodeEditorController; host: HTMLElement; input: HTMLInputElement }> = [];
const source = "| Name | Value |\n| --- | --- |\n| alpha | beta |\n";
afterEach(() => {
  for (const { controller, host, input } of mounted.splice(0)) {
    controller.destroy();
    host.remove();
    input.remove();
  }
});

async function createTableEditor() {
  const host = document.createElement("div");
  const input = document.createElement("input");
  document.body.append(host, input);
  const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn() });
  mounted.push({ controller, host, input });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  await controller.prepareFindReplace();
  return { controller, view, host, input };
}

it.each(["", "missing-query"])("keeps Search focus after a queued table transfer with query %j", async search => {
  const { controller, view, input } = await createTableEditor();
  view.focus();
  view.dispatch({ selection: { anchor: source.indexOf("alpha") } });
  input.focus();
  expect(controller.updateFindReplaceQuery({ search, replace: "" }).matchCount).toBe(0);
  await Promise.resolve();
  await Promise.resolve();
  expect(document.activeElement).toBe(input);
  expect(controller.getContent()).toBe(source);
});

it("still transfers focus for explicit table keyboard navigation", async () => {
  const { controller, view, host } = await createTableEditor();
  view.focus();
  view.dispatch({ selection: { anchor: source.indexOf("alpha") } });
  await Promise.resolve();
  await Promise.resolve();
  const cell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
  expect(document.activeElement).toBe(cell);
  cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.activeElement).toBe(host.querySelector('[data-table-cell="1:1"]'));
  expect(controller.getContent()).toBe(source);
});

it("keeps an explicit toolbar action working with its existing focus ownership", async () => {
  const { controller, view, host, input } = await createTableEditor();
  view.focus();
  view.dispatch({ selection: { anchor: source.indexOf("alpha") } });
  await Promise.resolve();
  await Promise.resolve();
  input.type = "button";
  input.value = "Insert row below";
  input.addEventListener("click", () => controller.insertTableRowBelow());
  input.focus();
  input.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(document.activeElement).toBe(input);
});
