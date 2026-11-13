// @vitest-environment jsdom
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFishMarkMarkdownExtensions } from "./extensions/markdown";
import { pairingOptions, type PairingOptions } from "./paired-input";
import { readEditableSelection } from "./decorations/table-widget";
import { editorStructureObserver, readCompositionState } from "./transaction-adapter";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const table = (text: string) => `| name | qty |\n| --- | --- |\n| ${text} | 2 |`;

async function mount(source = table(""), markdown = false, column = 0) {
  const host = document.createElement("div");
  document.body.append(host);
  const pairing = new Compartment(), readOnly = new Compartment();
  const onChange = vi.fn();
  const onStructureUpdate = vi.fn();
  const view = new EditorView({ parent: host, state: EditorState.create({ doc: source, extensions: [
    editorStructureObserver.of({ onUpdate: onStructureUpdate }),
    pairing.of(pairingOptions.of({ autoPairBrackets: true, autoPairMarkdown: markdown })),
    readOnly.of(EditorState.readOnly.of(false)),
    createFishMarkMarkdownExtensions({ onContentChange: onChange })
  ] }) });
  cleanups.push(() => { view.destroy(); host.remove(); });
  const cell = () => {
    const element = host.querySelector<HTMLElement>(`[data-table-cell="1:${column}"]`);
    expect(element).not.toBeNull();
    return element!;
  };
  const select = (anchor: number, head = anchor) => {
    const element = cell() as HTMLElement & { setSelectionRange(start: number, end: number): void };
    element.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head));
    if (anchor > head) {
      const selection = document.getSelection()!, range = selection.getRangeAt(0);
      selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
    }
  };
  const selection = () => {
    const { start, end } = readEditableSelection(cell());
    const native = document.getSelection()!, range = native.getRangeAt(0);
    const forward = native.anchorNode === range.startContainer && native.anchorOffset === range.startOffset;
    return forward ? { anchor: start, head: end } : { anchor: end, head: start };
  };
  // jsdom 不执行浏览器默认编辑；只在原生事件未被接管时补 DOM 默认动作，再发 input。
  const nativeReplace = (text: string, inputType: string) => {
    const range = document.getSelection()!.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    document.getSelection()!.setBaseAndExtent(node, text.length, node, text.length);
    cell().dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: text }));
  };
  const input = async (text: string, inputType = "insertText") => {
    const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data: text });
    cell().dispatchEvent(event);
    if (!event.defaultPrevented) nativeReplace(text, inputType);
    await flush();
    return event;
  };
  const key = async (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options });
    cell().dispatchEvent(event);
    await flush();
    return event;
  };
  cell().focus();
  await flush();
  select(0);
  return { view, host, cell, select, selection, input, key, onChange, onStructureUpdate,
    content: () => view.state.doc.toString(),
    configure: (options: PairingOptions) => view.dispatch({ effects: pairing.reconfigure(pairingOptions.of(options)) }),
    setReadOnly: (value: boolean) => view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) }) };
}

describe("表格配对输入", () => {
  it("普通字母、中文、批量文本的 beforeinput 不触发结构投影或解析", async () => {
    const f = await mount(table("word") + "\n\n" + "long paragraph\n\n".repeat(300));
    f.onStructureUpdate.mockClear();
    for (const text of ["a", "中", "🙂", ".", "batch"]) {
      const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text });
      f.cell().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(f.onStructureUpdate).not.toHaveBeenCalled();
  });

  it.each(["()", "[]", "{}", '""', "''"])("原本已有的 %s 也能一次退格，并可撤销恢复", async (text) => {
    const f = await mount(table(text));
    f.select(1);
    expect((await f.key("Backspace")).defaultPrevented).toBe(true);
    expect(f.content()).toBe(table(""));
    await f.key("z", { ctrlKey: true });
    expect(f.content()).toBe(table(text));
  });

  it.each([["(", ")"], ["[", "]"], ["{", "}"], ['"', '"'], ["'", "'"]])(
    "%s 补全后跳过闭符号，源历史统一撤销和重做",
    async (open, close) => {
      const f = await mount();
      expect((await f.input(open!)).defaultPrevented).toBe(true);
      expect(f.content()).toBe(table(open! + close!));
      expect(f.selection()).toEqual({ anchor: 1, head: 1 });
      await f.input("x");
      const beforeSkip = f.onChange.mock.calls.length;
      expect((await f.input(close!)).defaultPrevented).toBe(true);
      expect(f.content()).toBe(table(open! + "x" + close!));
      expect(f.selection()).toEqual({ anchor: 3, head: 3 });
      expect(f.onChange).toHaveBeenCalledTimes(beforeSkip);
      await f.key("z", { ctrlKey: true });
      expect(f.content()).toBe(table(""));
      await f.key("z", { ctrlKey: true, shiftKey: true });
      expect(f.content()).toBe(table(open! + "x" + close!));
    }
  );

  it.each(["(", "[", "{", '"', "'", "*", "_", "`", "$"])("%s 空配对一次 Backspace 删除", async (token) => {
    const f = await mount(table(""), true);
    await f.input(token);
    expect(f.cell().textContent).toHaveLength(2);
    expect((await f.key("Backspace")).defaultPrevented).toBe(true);
    expect(f.content()).toBe(table(""));
    expect(f.selection()).toEqual({ anchor: 0, head: 0 });
    await f.key("z", { ctrlKey: true });
    expect(f.cell().textContent).toHaveLength(2);
  });

  it.each([false, true])("包裹选区保留方向（反向：%s）和管道源码转义", async (backward) => {
    const f = await mount(table("a\\|中文b"));
    f.select(backward ? 4 : 1, backward ? 1 : 4);
    await f.input('"');
    expect(f.content()).toBe(table('a"\\|中文"b'));
    expect(f.selection()).toEqual(backward ? { anchor: 5, head: 2 } : { anchor: 2, head: 5 });
    const start = f.content().indexOf('"');
    expect(f.view.state.selection.main.anchor).toBe(backward ? start + 5 : start + 1);
    expect(f.view.state.selection.main.head).toBe(backward ? start + 1 : start + 5);
  });

  it("Markdown 连续加粗与闭标记跳过复用普通编辑区规则", async () => {
    const f = await mount(table(""), true);
    await f.input("*"); await f.input("*");
    expect(f.content()).toBe(table("****"));
    expect(f.selection()).toEqual({ anchor: 2, head: 2 });
    await f.input("bold"); await f.input("*"); await f.input("*");
    expect(f.content()).toBe(table("**bold**"));
    expect(f.selection()).toEqual({ anchor: 8, head: 8 });
  });

  it.each(["*", "_", "`", "$"])("Markdown %s 包裹反向选区并保留选中文字", async (token) => {
    const f = await mount(table("word"), true);
    f.select(4, 0);
    await f.input(token);
    expect(f.content()).toBe(table(`${token}word${token}`));
    expect(f.selection()).toEqual({ anchor: 5, head: 1 });
    expect(document.getSelection()?.toString()).toBe("word");
    f.select(5);
    await f.input(token);
    expect(f.content()).toBe(table(`${token}word${token}`));
    expect(f.selection()).toEqual({ anchor: 6, head: 6 });
  });

  it("管道转义后的括号标记映射回源文档后仍可跳过", async () => {
    const f = await mount(table("a\\|b"));
    f.select(3, 0);
    await f.input("(");
    expect(f.content()).toBe(table("(a\\|b)"));
    f.select(4);
    await f.input(")");
    expect(f.content()).toBe(table("(a\\|b)"));
    expect(f.selection()).toEqual({ anchor: 5, head: 5 });
  });

  it("嵌套引用中的配对只改当前格，不重排引用前缀和其他表格", async () => {
    const quoted = table("").split("\n").map(line => "> > " + line).join("\n");
    const source = quoted + "\n\n" + table("untouched");
    const f = await mount(source);
    await f.input("("); await f.input(")");
    expect(f.content()).toBe(source.replace("> > |  | 2 |", "> > | () | 2 |"));
    expect(f.selection()).toEqual({ anchor: 2, head: 2 });
  });

  it("默认 Markdown 关闭，设置变更对已挂载单元格即时生效", async () => {
    const f = await mount();
    expect((await f.input("*")).defaultPrevented).toBe(false);
    expect(f.content()).toBe(table("*"));
    f.configure({ autoPairBrackets: false, autoPairMarkdown: true });
    await f.input("(");
    expect(f.content()).toBe(table("*("));
    await f.input("$");
    expect(f.content()).toBe(table("*($$"));
    f.configure({ autoPairBrackets: true, autoPairMarkdown: false });
    expect((await f.key("Backspace")).defaultPrevented).toBe(false);
    f.select(4);
    await f.input("[");
    expect(f.content()).toBe(table("*($$[]"));
  });

  it("紧凑表格末尾也配对，缺失格通过模型补结构且能撤销恢复", async () => {
    const compact = await mount("|name|qty|\n|---|---|\n||2|");
    await compact.input("(");
    expect(compact.content()).toBe("|name|qty|\n|---|---|\n|()|2|");
    const original = "| a | b | c |\n| --- | --- | --- |\n| x | y |";
    const missing = await mount(original, false, 2);
    await missing.input("[");
    expect(missing.content()).toBe(original + " [] |");
    expect(missing.selection()).toEqual({ anchor: 1, head: 1 });
    await missing.input("]");
    expect(missing.content()).toBe(original + " [] |");
    await missing.key("z", { ctrlKey: true });
    expect(missing.content()).toBe(original);
    await missing.key("z", { ctrlKey: true, shiftKey: true });
    expect(missing.content()).toBe(original + " [] |");
  });

  it("多行格 br 后的配对和成对退格不改变换行源码", async () => {
    const f = await mount(table("first<br>"));
    f.select(9);
    await f.input("(");
    expect(f.content()).toBe(table("first<br>()"));
    expect(f.selection()).toEqual({ anchor: 10, head: 10 });
    const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" });
    f.cell().dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(f.content()).toBe(table("first<br>"));
  });

  it.each(["(", "**", "([plain]"])("纯文本粘贴 %s 不自动配对", async (text) => {
    const f = await mount(table(""), true);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => text, types: ["text/plain"] } });
    f.cell().dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    expect((await f.input(text, "insertFromPaste")).defaultPrevented).toBe(false);
    expect(f.content()).toBe(table(text));
  });

  it("英文撇号、转义和行内代码中的 Markdown 按原文输入", async () => {
    const word = await mount(table("don")); word.select(3); await word.input("'"); await word.input("t");
    expect(word.content()).toBe(table("don't"));
    const escaped = await mount(table("\\")); escaped.select(1); await escaped.input("[");
    expect(escaped.content()).toBe(table("\\["));
    const code = await mount(table("`value`"), true); code.select(3); await code.input("*");
    expect(code.content()).toBe(table("`va*lue`"));
  });

  it("原生清空后及排队选区恢复均把空格光标放在占位 BR 前", async () => {
    const f = await mount();
    await f.input("plain");
    // Chromium 清空 contenteditable 后留下占位 BR；模拟原生删除结束时的元素边界光标。
    f.cell().replaceChildren(document.createElement("br"));
    const selection = document.getSelection()!;
    selection.collapse(f.cell(), 1);
    f.cell().dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    expect(selection.focusNode).toBe(f.cell());
    expect(selection.focusOffset).toBe(0);
    await flush();
    expect(selection.focusNode).toBe(f.cell());
    expect(selection.focusOffset).toBe(0);
    expect(f.content()).toBe(table(""));
    f.select(0);
    expect(selection.focusOffset).toBe(0);
  });

  it.each([
    { initial: "", finalInput: false }, { initial: "", finalInput: true },
    { initial: "[", finalInput: false }, { initial: "[", finalInput: true }
  ])("同值 IME 提交结束后释放配对及历史：$initial / finalInput=$finalInput", async ({ initial, finalInput }) => {
    const f = await mount(table(initial), true);
    f.select(0, initial.length);
    f.onChange.mockClear();
    f.cell().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    f.cell().dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "[" }));
    // 模拟浏览器维护的合成区：预编辑值和最终值相同，不能依赖最后一次 input 或源码变化来结束。
    f.cell().textContent = "[";
    f.select(1);
    f.cell().dispatchEvent(new InputEvent("input", {
      bubbles: true, inputType: "insertCompositionText", data: "[", isComposing: true
    }));
    expect(f.content()).toBe(table(initial));
    expect(readCompositionState(f.view.state).active).toBe(true);
    f.cell().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "[" }));
    if (finalInput) {
      const before = new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, inputType: "insertText", data: "["
      });
      f.cell().dispatchEvent(before);
      expect(before.defaultPrevented).toBe(false);
      f.cell().dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "[" }));
    }
    await vi.waitFor(() => expect(readCompositionState(f.view.state).active).toBe(false));
    expect(f.cell().dataset.tableCellComposing).toBeUndefined();
    expect(f.cell().dataset.tableCellPendingCompositionCommit).toBeUndefined();
    expect(f.content()).toBe(table("["));
    expect(f.onChange).toHaveBeenCalledTimes(initial === "[" ? 0 : 1);
    f.select(1);
    expect((await f.input("(")).defaultPrevented).toBe(true);
    expect(f.content()).toBe(table("[()"));
    await f.key("z", { ctrlKey: true });
    expect(f.content()).toBe(table("["));
    await f.key("z", { ctrlKey: true });
    expect(f.content()).toBe(table(initial));
  });

  it("组合输入及 229 按键不截获，readonly 拦截内容改动和历史", async () => {
    const f = await mount(table("()"), true);
    f.select(1);
    const composingInput = new InputEvent("beforeinput", { bubbles: true, cancelable: true,
      inputType: "insertText", data: "[", isComposing: true });
    f.cell().dispatchEvent(composingInput);
    expect(composingInput.defaultPrevented).toBe(false);
    expect((await f.key("Backspace", { isComposing: true })).defaultPrevented).toBe(false);
    expect((await f.key("Backspace", { keyCode: 229 })).defaultPrevented).toBe(false);
    f.cell().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect((await f.key("Backspace")).defaultPrevented).toBe(false);
    f.cell().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    f.setReadOnly(true);
    for (const key of ["Backspace", "Delete", "Enter"]) expect((await f.key(key)).defaultPrevented).toBe(true);
    expect((await f.key("z", { ctrlKey: true })).defaultPrevented).toBe(true);
    expect((await f.input("[")).defaultPrevented).toBe(true);
    expect((await f.input("(", "insertFromPaste")).defaultPrevented).toBe(true);
    expect(f.content()).toBe(table("()"));
    f.setReadOnly(false);
    f.select(1);
    await f.input("[");
    expect(f.content()).toBe(table("([])"));
  });
});
