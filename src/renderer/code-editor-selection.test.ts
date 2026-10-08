// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { afterEach, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController } from "./code-editor";

const source = "Introduction\n\n| Name | Value |\n| --- | --- |\n| before first after | second |\n";
const mounted: Array<{ controller: CodeEditorController; host: HTMLElement }> = [];
afterEach(() => {
  document.getSelection()?.removeAllRanges();
  for (const { controller, host } of mounted.splice(0)) {
    controller.destroy();
    host.remove();
  }
});

async function createTableEditor(content = source) {
  const host = document.createElement("div");
  document.body.append(host);
  const controller = createCodeEditorController({ parent: host, initialContent: content, onChange: vi.fn() });
  mounted.push({ controller, host });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  view.focus();
  view.dispatch({ selection: { anchor: content.indexOf("before") } });
  await Promise.resolve();
  await Promise.resolve();
  const cell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
  expect(document.activeElement).toBe(cell);
  expect(cell.dataset.tableCellRenderMode).toBe("plain");
  return { controller, view, host, cell };
}

function selectText(cell: HTMLElement, anchor: number, head: number) {
  const pointAt = (offset: number) => {
    const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = offset;
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
      node = walker.nextNode();
    }
    throw new Error(`No text point at ${offset}`);
  };
  const from = pointAt(anchor), to = pointAt(head);
  cell.ownerDocument.getSelection()!.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
}

it.each([[7, 12], [12, 7]])("reads the focused table DOM selection %i..%i as an exact source range", async (anchor, head) => {
  const { controller, view, cell } = await createTableEditor();
  selectText(cell, anchor, head);
  expect(view.state.selection.main.empty).toBe(true);
  const start = source.indexOf("before");
  expect(controller.getSelection()).toEqual({ anchor: start + anchor, head: start + head });
  expect(controller.getContent()).toBe(source);
  expect(view.state.selection.main.empty).toBe(true);
});

it("resolves the live table selection after inserting source before its table", async () => {
  const { controller, view, host } = await createTableEditor();
  const prefix = "Inserted\n\n";
  view.dispatch({ changes: { from: 0, insert: prefix } });
  await Promise.resolve();
  await Promise.resolve();
  const cell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]')!;
  cell.focus();
  await Promise.resolve();
  selectText(cell, 7, 12);
  expect(controller.getSelection()).toEqual({ anchor: prefix.length + source.indexOf("first"), head: prefix.length + source.indexOf("first") + 5 });
});

it.each([[5, 11], [11, 5]])("maps a same-text CJK split-node fixture selection %i..%i to exact source offsets", async (anchor, head) => {
  const content = source.replace("before first after", "before 中文first after");
  const { controller, cell } = await createTableEditor(content);
  // 仅构造同文分段以验证适配器，不依赖产品存在字体 span，也不改变单元格原文。
  const segment = document.createElement("span");
  segment.textContent = "中文";
  cell.replaceChildren(document.createTextNode("before "), segment, document.createTextNode("first after"));
  expect(cell.textContent).toBe("before 中文first after");
  selectText(cell, anchor, head);
  const domRange = document.getSelection()!.getRangeAt(0);
  expect(domRange.startContainer).not.toBe(domRange.endContainer);
  const from = content.indexOf("before");
  expect(controller.getSelection()).toEqual({ anchor: from + anchor, head: from + head });
  expect(content.slice(from + Math.min(anchor, head), from + Math.max(anchor, head))).toBe("e 中文fi");
});

it("does not project changed DOM text or a range crossing cells into canonical source", async () => {
  const { controller, view, host, cell } = await createTableEditor();
  const canonical = { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head };
  cell.textContent = "uncommitted DOM text";
  selectText(cell, 0, 11);
  expect(controller.getSelection()).toEqual(canonical);
  cell.textContent = "before first after";
  const other = host.querySelector<HTMLElement>('[data-table-cell="1:1"]')!;
  document.getSelection()!.setBaseAndExtent(cell.firstChild!, 7, other.firstChild!, 3);
  expect(controller.getSelection()).toEqual(canonical);
});

it("keeps the canonical range when the active widget identity is stale", async () => {
  const { controller, view, cell } = await createTableEditor();
  const canonical = { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head };
  cell.closest<HTMLElement>(".cm-table-widget")!.dataset.tableStartOffset = "0";
  selectText(cell, 7, 12);
  expect(controller.getSelection()).toEqual(canonical);
});

it("keeps the canonical range for decoded escaped pipes instead of guessing DOM offsets", async () => {
  const content = source.replace("before first after", "before first\\| after");
  const { controller, view, cell } = await createTableEditor(content);
  expect(cell.textContent).toBe("before first| after");
  selectText(cell, 7, 12);
  expect(controller.getSelection()).toEqual({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head });
});

it.each(["preview", "readonly"])("does not project a %s cell selection into source", async mode => {
  const { controller, view, cell } = await createTableEditor();
  const canonical = { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head };
  if (mode === "preview") cell.dataset.tableCellRenderMode = "preview";
  else cell.contentEditable = "false";
  selectText(cell, 7, 12);
  expect(controller.getSelection()).toEqual(canonical);
});

it("preserves ordinary CodeMirror source selections", async () => {
  const { controller, view } = await createTableEditor();
  view.focus();
  view.dispatch({ selection: { anchor: 5, head: 1 } });
  expect(controller.getSelection()).toEqual({ anchor: 5, head: 1 });
});
