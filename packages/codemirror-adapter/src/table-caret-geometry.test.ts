// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTableCaretGeometry, readTableSourceRangeRects } from "./table-caret-geometry";

const box = new DOMRect(20, 40, 15, 21);
let rects: (range: Range) => DOMRect[];
let original: PropertyDescriptor | undefined;
function cell(text: string, offset = 0): HTMLElement {
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.textContent = text;
  document.body.append(editor);
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.setStart(editor, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return editor;
}

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  rects = () => [];
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: function(this: Range) { return rects(this); } });
});
afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  if (original) Object.defineProperty(Range.prototype, "getClientRects", original);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
  vi.restoreAllMocks();
});

describe("native table caret geometry", () => {
  it("reads an equivalent Text boundary without replacing the native DIV selection or text node", () => {
    const editor = cell("中文 text");
    const node = editor.firstChild;
    rects = range => range.startContainer === node && range.collapsed ? [box] : [];
    expect(readTableCaretGeometry(editor, 0)).toEqual({ rect: box, source: "text-boundary" });
    expect(editor.firstChild).toBe(node);
    expect(document.getSelection()?.anchorNode).toBe(editor);
    expect(document.getSelection()?.anchorOffset).toBe(0);
  });

  it("prefers valid native geometry, including an RTL native selection", () => {
    const editor = cell("עברית");
    rects = () => [box];
    expect(readTableCaretGeometry(editor, 0)?.source).toBe("selection");
  });

  it.each(["😀", "e\u0301", "👩‍💻"])("uses the complete %s grapheme for adjacent-character geometry", text => {
    const editor = cell(text);
    const ranges: [number, number][] = [];
    rects = range => {
      if (range.collapsed) return [];
      ranges.push([range.startOffset, range.endOffset]);
      return [new DOMRect(20, 40, 25, 21)];
    };
    expect(readTableCaretGeometry(editor, 0)).toMatchObject({ source: "character", rect: { left: 20, right: 20, height: 21 } });
    expect(ranges).toEqual([[0, text.length]]);
  });

  it("resolves a grapheme across real Text nodes", () => {
    const editor = cell("");
    editor.append("e", document.createTextNode("\u0301"));
    rects = range => !range.collapsed && range.startContainer === editor.firstChild && range.endContainer === editor.lastChild ? [box] : [];
    expect(readTableCaretGeometry(editor, 0)?.source).toBe("character");
    expect(editor.childNodes).toHaveLength(2);
  });

  it("uses the last character's trailing edge at a line end", () => {
    const editor = cell("abc", 1);
    rects = range => range.collapsed ? [] : [new DOMRect(20, 40, 15, 21)];
    expect(readTableCaretGeometry(editor, 3)).toMatchObject({ source: "character", rect: { left: 35, height: 21 } });
  });

  it.each([1, 2])("declines ambiguous offsets inside a ZWJ grapheme: %s", offset => {
    const editor = cell("👩‍💻");
    rects = range => range.collapsed ? [] : [box];
    expect(readTableCaretGeometry(editor, offset)).toBeNull();
  });

  it("does not guess an RTL character edge when native geometry is unavailable", () => {
    const editor = cell("עברית");
    rects = range => range.collapsed ? [] : [box];
    expect(readTableCaretGeometry(editor, 0)).toBeNull();
  });

  it("uses an empty cell's actual BR line box rather than the cell height", () => {
    const editor = cell("");
    const br = document.createElement("br");
    editor.append(br);
    vi.spyOn(br, "getClientRects").mockReturnValue([box] as unknown as DOMRectList);
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 5000));
    expect(readTableCaretGeometry(editor, 0)).toMatchObject({ source: "empty-line", rect: { height: 21 } });
    expect(editor.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("rejects an external selection and invalid or unavailable geometry", () => {
    const editor = cell("abc");
    expect(readTableCaretGeometry(editor, -1)).toBeNull();
    expect(readTableCaretGeometry(editor, 0)).toBeNull();
    const other = cell("other");
    expect(readTableCaretGeometry(editor, 0)).toBeNull();
    expect(other.isConnected).toBe(true);
  });
});

describe("table search source projection", () => {
  it.each([[0, 2], [7, 9]])("reveals adjacent actual text when only hidden syntax is selected: %s..%s", (from, to) => {
    const editor = cell("**hello**");
    const open = document.createElement("span"), content = document.createElement("span"), close = document.createElement("span");
    open.textContent = "**"; content.textContent = "hello"; close.textContent = "**";
    editor.replaceChildren(open, content, close);
    rects = range => range.startContainer === content.firstChild ? [box] : [];
    expect(readTableSourceRangeRects(editor, "**hello**", from, to)).toEqual([box]);
    expect(editor.textContent).toBe("**hello**");
  });
  it.each([[1, 3], [2, 3], [1, 2]])("maps an escaped pipe's canonical range %s..%s to its real rendered glyph", (from, to) => {
    const editor = cell("a|b");
    const ranges: [number, number][] = [];
    rects = range => { ranges.push([range.startOffset, range.endOffset]); return [box]; };
    expect(readTableSourceRangeRects(editor, "a\\|b", from, to)).toEqual([box]);
    expect(ranges).toEqual([[1, 2]]);
  });

  it("keeps offsets exact across decorated CJK text nodes", () => {
    const editor = cell("中文 text");
    const span = document.createElement("span");
    span.textContent = "中文";
    editor.replaceChildren(span, " text");
    rects = range => range.startContainer === span.firstChild && range.endContainer === editor.lastChild ? [box] : [];
    expect(readTableSourceRangeRects(editor, "中文 text", 1, 4)).toEqual([box]);
  });

  it("declines an unproven projection instead of inventing offsets", () => {
    const editor = cell("normalized");
    rects = () => [box];
    expect(readTableSourceRangeRects(editor, "different source", 0, 3)).toEqual([]);
    expect(readTableSourceRangeRects(editor, "normalized", 0.5, 3)).toEqual([]);
  });
});
