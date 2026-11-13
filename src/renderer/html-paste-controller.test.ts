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
  it.each([
    {
      name: "列表惰性续行行首",
      source: "- parent\ncontinued\n- sibling",
      html: "<ul><li>A</li><li>B</li></ul>",
      expected: "- parent\n  \n  -   A\n  -   B\n  \n  continued\n- sibling"
    },
    {
      name: "引用惰性续行行首的围栏",
      source: "> parent\ncontinued",
      html: '<pre><code class="language-js">x\n</code></pre>',
      expected: "> parent\n> \n> ```js\n> x\n> ```\n> \n> continued"
    },
    {
      name: "无间距的空列表标记",
      source: "-",
      html: "<ul><li>A</li><li>B</li></ul>",
      expected: "- -   A\n  -   B"
    }
  ])("$name 保留 HTML 结构且一次撤销重做", async ({ source, html, expected }) => {
    const f = editor(source);
    const offset = source.includes("continued") ? source.indexOf("continued") : source.length;
    f.controller.setSelection(offset);
    const selection = f.controller.getSelection();
    expect(f.paste(html, "PLAIN FALLBACK").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(f.controller.getContent()).toBe(expected));
    const caret = expected.includes("continued") ? expected.indexOf("continued") : expected.length;
    expect(f.controller.getSelection()).toEqual({ anchor: caret, head: caret });
    expect(f.importClipboardImage).not.toHaveBeenCalled();
    f.controller.runHistory("undo");
    expect(f.controller.getContent()).toBe(source);
    expect(f.controller.getSelection()).toEqual(selection);
    f.controller.runHistory("redo");
    expect(f.controller.getContent()).toBe(expected);
  });

  it.each([
    {
      name: "列表项中间的多段正文",
      source: "- before OLD tail\n  - child\n- sibling",
      html: "<p><strong>one</strong></p><p>two</p>",
      expected: "- before **one**\n  \n  two tail\n  - child\n- sibling"
    },
    {
      name: "引用内的列表片段",
      source: "> before OLD tail\n> after",
      html: "<ul><li>one</li><li>two</li></ul>",
      expected: "> before \n> \n> -   one\n> -   two\n> \n>  tail\n> after"
    },
    {
      name: "引用列表内的代码片段",
      caretAfterPrefix: true,
      source: "> - before OLD tail\n>   - child\n> - sibling",
      html: '<pre><code class="language-python">if ok:\n    return 1\n</code></pre>',
      expected: "> - before \n>   \n>   ```python\n>   if ok:\n>       return 1\n>   ```\n>   \n>    tail\n>   - child\n> - sibling"
    }
  ])("$name 保留容器、反向选区和一次撤销重做", async ({ source, html, expected, caretAfterPrefix }) => {
    const f = editor(source);
    const from = source.indexOf("OLD");
    f.controller.setSelection(from + 3, from);
    expect(f.paste(html, "PLAIN FALLBACK").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(f.controller.getContent()).toBe(expected));
    const caret = expected.indexOf(caretAfterPrefix ? "tail" : " tail");
    expect(f.controller.getSelection()).toEqual({ anchor: caret, head: caret });
    expect(f.importClipboardImage).not.toHaveBeenCalled();
    f.controller.runHistory("undo");
    expect(f.controller.getContent()).toBe(source);
    expect(f.controller.getSelection()).toEqual({ anchor: from + 3, head: from });
    f.controller.runHistory("redo");
    expect(f.controller.getContent()).toBe(expected);
  });

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
