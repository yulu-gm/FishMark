// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendTableCellHardBreak,
  canLeaveTableCellVertically,
  hasMatchingTableCellHardBreaks,
  normalizeTableCellBreakCaret,
  tableCellHardBreaks
} from "./table-cell-vertical-navigation";

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("表格单元格纵向移动", () => {
  it("只把空单元格占位 BR 后的折叠光标归一到前方，且不循环改选区", () => {
    const editor = document.createElement("div");
    editor.dataset.tableCellText = "";
    editor.append(document.createElement("br"));
    document.body.append(editor);
    const selection = document.getSelection()!;
    selection.collapse(editor, 1);
    const collapse = vi.spyOn(selection, "collapse");
    try {
      normalizeTableCellBreakCaret(editor);
      expect(selection.focusNode).toBe(editor);
      expect(selection.focusOffset).toBe(0);
      normalizeTableCellBreakCaret(editor);
      expect(collapse).toHaveBeenCalledTimes(1);
    } finally { collapse.mockRestore(); }
  });

  it("空格归一不改动 IME、范围选区、非空源码和真实硬换行", () => {
    const editor = document.createElement("div");
    editor.dataset.tableCellText = "";
    editor.append(document.createElement("br"));
    document.body.append(editor);
    const selection = document.getSelection()!;
    selection.collapse(editor, 1);
    editor.dataset.tableCellComposing = "true";
    normalizeTableCellBreakCaret(editor);
    expect(selection.focusOffset).toBe(1);
    delete editor.dataset.tableCellComposing;
    selection.setBaseAndExtent(editor, 1, editor, 0);
    normalizeTableCellBreakCaret(editor);
    expect(selection.anchorOffset).toBe(1);
    expect(selection.focusOffset).toBe(0);
    selection.collapse(editor, 1);
    editor.dataset.tableCellText = "<br>";
    normalizeTableCellBreakCaret(editor);
    expect(selection.focusOffset).toBe(1);
    editor.replaceChildren();
    appendTableCellHardBreak(editor, "<br>");
    selection.collapse(editor, 1);
    normalizeTableCellBreakCaret(editor);
    expect(selection.focusNode).toBe(editor);
    expect(selection.focusOffset).toBe(1);
    expect(editor.textContent).toBe("<br>");
  });

  it("只投影 Markdown 解析出的换行，保留原标记和源偏移", () => {
    const text = "a<BR />b`<br>`c<br>";
    const breaks = tableCellHardBreaks(text);
    expect(breaks.map(({ from, to }) => text.slice(from, to))).toEqual(["<BR />", "<br>"]);
    const fragment = document.createDocumentFragment();
    fragment.append("a");
    appendTableCellHardBreak(fragment, "<BR />");
    fragment.append("b`<br>`c");
    appendTableCellHardBreak(fragment, "<br>");
    const editor = document.createElement("div");
    document.body.append(editor);
    editor.append(fragment);
    expect(editor.textContent).toBe(text);
    expect(hasMatchingTableCellHardBreaks(editor, breaks)).toBe(true);

    const marker = editor.querySelector("[hidden]")!;
    const selection = document.getSelection()!;
    selection.collapse(marker.firstChild, 6);
    normalizeTableCellBreakCaret(editor);
    expect(selection.focusNode).toBe(editor.childNodes[2]);
    expect(selection.focusOffset).toBe(0);

    editor.querySelector("br")?.remove();
    expect(hasMatchingTableCellHardBreaks(editor, breaks)).toBe(false);
  });

  it("保留非空选区、修饰键和输入法按键", () => {
    const editor = document.createElement("div");
    editor.textContent = "text";
    document.body.append(editor);
    const selection = document.getSelection()!;
    const key = (init: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: "ArrowDown", ...init });

    selection.setBaseAndExtent(editor.firstChild!, 2, editor.firstChild!, 0);
    expect(canLeaveTableCellVertically(editor, key())).toBe(false);
    selection.collapse(editor.firstChild, 0);
    expect(canLeaveTableCellVertically(editor, key())).toBe(true);
    expect(canLeaveTableCellVertically(editor, key({ shiftKey: true }))).toBe(false);
    expect(canLeaveTableCellVertically(editor, key({ isComposing: true }))).toBe(false);
    editor.dataset.tableCellComposing = "true";
    expect(canLeaveTableCellVertically(editor, key())).toBe(false);
  });
});
