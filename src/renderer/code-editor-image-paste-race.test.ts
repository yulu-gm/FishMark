// @vitest-environment jsdom

import { undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCodeEditorController } from "./code-editor";

const initialContent = "0123456789";
const imageMarkdown = "![image](assets/pasted.png)";
const identity = { tabId: "image-paste", epoch: 1, loadRevision: 0 };
let cleanup: (() => void) | undefined;

// jsdom 没有文字坐标；组合输入收尾时 CodeMirror 仍会测量选区。
const rangeGeometry = {
  getClientRects: () => [],
  getBoundingClientRect: () => new DOMRect()
};
const addedRangeMethods: string[] = [];
beforeAll(() => {
  for (const [name, value] of Object.entries(rangeGeometry)) {
    if (name in Range.prototype) continue;
    Object.defineProperty(Range.prototype, name, { configurable: true, value });
    addedRangeMethods.push(name);
  }
});

afterAll(() => {
  for (const name of addedRangeMethods) Reflect.deleteProperty(Range.prototype, name);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function setup(content = initialContent) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const imports: ((markdown: string | null) => void)[] = [];
  const importClipboardImage = vi.fn(() => new Promise<string | null>((resolve) => imports.push(resolve)));
  const plainPastes: ((text: string | null) => void)[] = [];
  const requestPlainTextPaste = vi.fn(() => new Promise<string | null>((resolve) => plainPastes.push(resolve)));
  const controller = createCodeEditorController({
    parent, initialContent: content, onChange: vi.fn(), importClipboardImage, requestPlainTextPaste
  });
  controller.setDocumentIdentity(identity);
  controller.focus();
  if (content) controller.setSelection(7, 3);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor")!)!;
  cleanup = () => { controller.destroy(); parent.remove(); };

  function pasteImage(text = "") {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [{ type: "image/png" }],
        types: text ? ["image/png", "text/plain"] : ["image/png"],
        getData: (type: string) => type === "text/plain" ? text : ""
      }
    });
    view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }

  async function completeImport(index: number, markdown: string | null = imageMarkdown) {
    imports[index]!(markdown);
    await Promise.resolve();
  }

  return { controller, view, importClipboardImage, plainPastes, pasteImage, completeImport };
}

describe("异步图片粘贴", () => {
  it.each(["", "clipboard text"])("只在导入成功后替换原选区（剪贴板文本：%j）", async (text) => {
    const { controller, view, pasteImage, completeImport, importClipboardImage } = setup();
    pasteImage(text);
    expect(importClipboardImage).toHaveBeenCalledExactlyOnceWith({ tabId: identity.tabId });
    expect(controller.getContent()).toBe(initialContent);
    expect(controller.getSelection()).toEqual({ anchor: 7, head: 3 });

    await completeImport(0);
    expect(controller.getContent()).toBe(`012${imageMarkdown}789`);
    expect(controller.getSelection()).toEqual({ anchor: 3 + imageMarkdown.length, head: 3 + imageMarkdown.length });
    expect(undo(view)).toBe(true);
    expect(controller.getContent()).toBe(initialContent);
    expect(controller.getSelection()).toEqual({ anchor: 7, head: 3 });
  });

  it("导入失败时保留原文字、选区和撤销历史", async () => {
    const { controller, view, pasteImage, completeImport } = setup();
    pasteImage();
    await completeImport(0, null);
    expect(controller.getContent()).toBe(initialContent);
    expect(controller.getSelection()).toEqual({ anchor: 7, head: 3 });
    expect(undoDepth(view.state)).toBe(0);
  });

  it.each([
    ["编辑让原选区越界", ({ controller }) => controller.setContent("x")],
    ["撤销编辑", ({ controller, view }) => { controller.insertText("x"); undo(view); }],
    ["移走选区再移回", ({ controller }) => { controller.setSelection(0); controller.setSelection(7, 3); }],
    ["开启只读再解除", ({ controller }) => { controller.setReadOnly(true); controller.setReadOnly(false); }],
    ["失焦后重新聚焦", ({ controller, view }) => { view.contentDOM.blur(); controller.focus(); }],
    ["完成一次无文字变化的组合输入", async ({ controller, view }) => {
      view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const seal = controller.sealForBarrier();
      view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      await seal;
    }]
  ] satisfies [string, (editor: ReturnType<typeof setup>) => void | Promise<void>][])("%s后丢弃旧请求", async (_name, invalidate) => {
    const editor = setup();
    editor.pasteImage();
    await invalidate(editor);
    const content = editor.controller.getContent();
    const selection = editor.controller.getSelection();
    await editor.completeImport(0);
    expect(editor.controller.getContent()).toBe(content);
    expect(editor.controller.getSelection()).toEqual(selection);
  });

  it("重建同一空白文档后也丢弃旧请求", async () => {
    const { controller, pasteImage, completeImport } = setup("");
    pasteImage();
    controller.replaceDocument("");
    await completeImport(0);
    expect(controller.getContent()).toBe("");
  });

  it("只读或组合输入期间不启动图片导入", () => {
    const { controller, view, pasteImage, importClipboardImage } = setup();
    controller.setReadOnly(true);
    pasteImage();
    controller.setReadOnly(false);
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    pasteImage();
    expect(importClipboardImage).not.toHaveBeenCalled();
    expect(controller.getContent()).toBe(initialContent);
  });

  it.each([0, 1])("两个请求重叠时只写入最新结果（先返回请求 %i）", async (first) => {
    const { controller, pasteImage, completeImport, importClipboardImage } = setup();
    pasteImage();
    pasteImage();
    expect(importClipboardImage).toHaveBeenCalledTimes(2);

    const results = ["![old](assets/old.png)", imageMarkdown];
    await completeImport(first, results[first]);
    expect(controller.getContent()).toBe(first === 0 ? initialContent : `012${imageMarkdown}789`);
    await completeImport(1 - first, results[1 - first]);
    expect(controller.getContent()).toBe(`012${imageMarkdown}789`);
  });

  it("最新请求失败时不回退到旧图片，保留原选区", async () => {
    const { controller, view, pasteImage, completeImport } = setup();
    pasteImage();
    pasteImage();
    await completeImport(1, null);
    await completeImport(0);
    expect(controller.getContent()).toBe(initialContent);
    expect(controller.getSelection()).toEqual({ anchor: 7, head: 3 });
    expect(undoDepth(view.state)).toBe(0);
  });

  it("后发的纯文本粘贴也会让先发的图片请求失效", async () => {
    const { controller, view, pasteImage, completeImport, plainPastes } = setup();
    pasteImage();
    view.contentDOM.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await completeImport(0);
    expect(controller.getContent()).toBe(initialContent);
    plainPastes[0]!("plain");
    await Promise.resolve();
    expect(controller.getContent()).toBe("012plain789");
  });
});
