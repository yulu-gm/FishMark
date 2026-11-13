// @vitest-environment jsdom

import { EditorView } from "@codemirror/view";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCodeEditorController, type CodeEditorController } from "./code-editor";

const mounted: { controller: CodeEditorController; host: HTMLElement }[] = [];
const geometry = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  // jsdom 没有布局；真实几何由对应 Electron 用例验证。
  for (const name of ["getClientRects", "getBoundingClientRect"]) {
    geometry.set(name, Object.getOwnPropertyDescriptor(Range.prototype, name));
    if (!(name in Range.prototype)) Object.defineProperty(Range.prototype, name, {
      configurable: true, value: name === "getClientRects" ? () => [] : () => new DOMRect()
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of geometry) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});
afterEach(() => {
  for (const { controller, host } of mounted.splice(0)) { controller.destroy(); host.remove(); }
});

function editor(source = "before AFTER") {
  const host = document.createElement("div");
  document.body.append(host);
  const importClipboardImage = vi.fn();
  const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn(), importClipboardImage });
  controller.setDocumentIdentity({ tabId: "html", epoch: 1, loadRevision: 0 });
  controller.focus();
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  mounted.push({ controller, host });
  const paste = (html: string, text: string) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: {
      types: ["text/html", "text/plain", "image/png"], items: [{ type: "image/png" }],
      getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? text : ""
    } });
    view.contentDOM.dispatchEvent(event);
    return event;
  };
  return { controller, view, paste, importClipboardImage };
}

describe("HTML 粘贴入口", () => {
  it("用 Markdown 替换反向选区，一次撤销，不导入混合载荷中的图片", async () => {
    const f = editor();
    f.controller.setSelection(12, 7);
    expect(f.paste("<strong>bold</strong>", "bold").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(f.controller.getContent()).toBe("before **bold**"));
    expect(f.importClipboardImage).not.toHaveBeenCalled();
    expect(f.controller.getSelection()).toEqual({ anchor: 15, head: 15 });
    f.controller.runHistory("undo");
    expect(f.controller.getContent()).toBe("before AFTER");
    expect(f.controller.getSelection()).toEqual({ anchor: 12, head: 7 });
    f.controller.runHistory("redo");
    expect(f.controller.getContent()).toBe("before **bold**");
  });

  it("无可用 HTML 时使用纯文本，保持 Markdown 字符原样", async () => {
    const f = editor("");
    f.paste("<style>bad</style>", "**raw**");
    await vi.waitFor(() => expect(f.controller.getContent()).toBe("**raw**"));
  });

  it.each(["selection", "edit", "identity", "readonly", "composition"])("转换等待期间 %s 使粘贴失效", async reason => {
    const f = editor();
    f.controller.setSelection(7, 12);
    f.paste("<b>late</b>", "late");
    if (reason === "selection") f.controller.setSelection(0);
    if (reason === "edit") f.controller.insertText("NEW");
    if (reason === "identity") f.controller.setDocumentIdentity({ tabId: "other", epoch: 2, loadRevision: 0 });
    if (reason === "readonly") f.controller.setReadOnly(true);
    if (reason === "composition") f.view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await vi.dynamicImportSettled();
    expect(f.controller.getContent()).toBe(reason === "edit" ? "before NEW" : "before AFTER");
  });

  it.each(["source", "fence"])("%s 中交由纯文本粘贴处理", mode => {
    const f = editor(mode === "fence" ? "```\ncode\n```" : "text");
    if (mode === "source") f.controller.setViewMode("source");
    f.controller.setSelection(mode === "fence" ? 5 : 0);
    f.paste("<b>value</b>", "value");
    expect(f.controller.getContent()).toBe(mode === "fence" ? "```\ncvalueode\n```" : "valuetext");
    expect(f.importClipboardImage).not.toHaveBeenCalled();
  });
});
