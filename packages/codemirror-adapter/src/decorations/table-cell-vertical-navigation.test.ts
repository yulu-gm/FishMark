// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
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
