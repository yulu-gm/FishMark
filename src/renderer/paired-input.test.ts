// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeEditorController } from "./code-editor";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const clean of cleanups.splice(0)) clean(); });

function editor(source = "", markdown = false) {
  const host = document.createElement("div");
  const controller = createCodeEditorController({ parent: host, initialContent: source, onChange: vi.fn(),
    pairing: { autoPairBrackets: true, autoPairMarkdown: markdown } });
  const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
  cleanups.push(() => { controller.destroy(); host.remove(); });
  const input = (text: string) => {
    const { from, to } = view.state.selection.main;
    const insert = () => view.state.update({ ...view.state.replaceSelection(text), userEvent: "input.type" });
    if (!view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, text, insert))) view.dispatch(insert());
  };
  const type = (text: string) => { for (const char of text) input(char); };
  const backspace = () => view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
  return { controller, view, input, type, backspace };
}

describe("配对输入", () => {
  it("普通括号补全、跳过闭括号，保留一次撤销和重做", () => {
    const f = editor();
    f.input("(");
    expect(f.controller.getContent()).toBe("()");
    expect(f.controller.getSelection()).toEqual({ anchor: 1, head: 1 });
    f.input("x"); f.input(")");
    expect(f.controller.getContent()).toBe("(x)");
    expect(f.controller.getSelection()).toEqual({ anchor: 3, head: 3 });
    expect(undo(f.view)).toBe(true); expect(f.controller.getContent()).toBe("");
    expect(redo(f.view)).toBe(true); expect(f.controller.getContent()).toBe("(x)");
  });
  it("包裹反向选区并保留方向；空配对一次退格", () => {
    const f = editor("中文");
    f.controller.setSelection(2, 0); f.input('"');
    expect(f.controller.getContent()).toBe('"中文"');
    expect(f.controller.getSelection()).toEqual({ anchor: 3, head: 1 });
    const blank = editor();
    blank.input("["); blank.backspace();
    expect(blank.controller.getContent()).toBe("");
  });
  it("英文撇号、转义、粘贴式批量输入和关闭选项不增加字符", () => {
    const f = editor("don"); f.controller.setSelection(3); f.input("'"); f.input("t");
    expect(f.controller.getContent()).toBe("don't");
    const escaped = editor("\\"); escaped.controller.setSelection(1); escaped.input("[");
    expect(escaped.controller.getContent()).toBe("\\[");
    const off = editor(); off.controller.setPairingOptions({ autoPairBrackets: false, autoPairMarkdown: false });
    off.input("("); expect(off.controller.getContent()).toBe("(");
    const batch = editor(); batch.input("([text"); expect(batch.controller.getContent()).toBe("([text");
  });
  it("组合输入不会触发配对或成对退格", () => {
    const f = editor("()"); f.controller.setSelection(1);
    f.view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    f.input("[");
    expect(f.controller.getContent()).toBe("([)");
    f.backspace();
    expect(f.controller.getContent()).toBe("([)");
  });
  it("可选 Markdown 配对支持加粗、跳出标记和三反引号围栏", () => {
    const f = editor("", true);
    f.input("*"); f.input("*");
    expect(f.controller.getContent()).toBe("****");
    expect(f.controller.getSelection()).toEqual({ anchor: 2, head: 2 });
    f.type("bold**");
    expect(f.controller.getContent()).toBe("**bold**");
    expect(f.controller.getSelection()).toEqual({ anchor: 8, head: 8 });
    const code = editor("", true); code.input("`"); code.input("`"); code.input("`");
    expect(code.controller.getContent()).toBe("```");
    expect(code.controller.getSelection()).toEqual({ anchor: 3, head: 3 });
  });
  it("代码块和行内代码里的 Markdown 符号仍是原文", () => {
    const code = editor("```\nvalue\n```", true); code.controller.setSelection(6); code.input("*");
    expect(code.controller.getContent()).toBe("```\nva*lue\n```");
    const inline = editor("`value`", true); inline.controller.setSelection(3); inline.input("*");
    expect(inline.controller.getContent()).toBe("`va*lue`");
  });

  it.each(["", "> ", "- ", "> - ", "- > ", "  ", ">   "])("%s 中逐字符输入围栏保留三个反引号", prefix => {
    const f = editor(prefix, true);
    f.controller.setSelection(prefix.length);
    f.type("```python");
    expect(f.controller.getContent()).toBe(prefix + "```python");
    expect(f.controller.getSelection()).toEqual({ anchor: prefix.length + 9, head: prefix.length + 9 });
  });

  it.each([
    ["*word*", 0, "*", "**word*"],
    ["* item", 0, "*", "** item"],
    ["`code`", 0, "`", "``code`"],
    ["abc * def", 4, "*", "abc ** def"],
    ["a_b_", 1, "_", "a__b_"]
  ] as const)("不把 %s 的开标记或普通字符当作闭标记", (source, offset, key, expected) => {
    const f = editor(source, true);
    f.controller.setViewMode("source");
    f.controller.setSelection(offset);
    f.type(key);
    expect(f.controller.getContent()).toBe(expected);
  });

  it.each(["``a`b``", "```a``b```"])("逐个跳过 %s 的完整闭反引号范围", source => {
    const width = source.startsWith("```") ? 3 : 2;
    const f = editor(source, true);
    f.controller.setSelection(source.length - width);
    for (let index = 0; index < width; index++) {
      f.type("`");
      expect(f.controller.getContent()).toBe(source);
      expect(f.controller.getSelection().head).toBe(source.length - width + index + 1);
    }
  });

  it("关闭 Markdown 配对后原有闭标记也不会被跳过", () => {
    const f = editor("*text*", true);
    f.controller.setSelection(5);
    f.controller.setPairingOptions({ autoPairBrackets: true, autoPairMarkdown: false });
    f.type("*");
    expect(f.controller.getContent()).toBe("*text**");
    const pair = editor();
    pair.type("(");
    pair.controller.setPairingOptions({ autoPairBrackets: false, autoPairMarkdown: false });
    pair.backspace();
    expect(pair.controller.getContent()).toBe(")");
  });
});
