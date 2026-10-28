import { describe, expect, it, vi } from "vitest";
import { parse, postprocess, preprocess } from "micromark";
import { parseInlineAst } from "./parse-inline-ast";
import { createMaskedSource } from "./source-text";

vi.mock("micromark", async importOriginal => {
  const original = await importOriginal<typeof import("micromark")>();
  return { ...original, parse: vi.fn(original.parse) };
});

describe("纯文本行内解析快速路径", () => {
  it.each(["Section 0001", "中文报告。", "Café 123", " hello - world: /path (1)!", "Quoted note 42", "数字１２３，说明（内容）！"])("保持 micromark 文本及绝对位置：%s", text => {
    const prefix = "前缀\r\n";
    const events = postprocess(parse().text().write(preprocess()(text, "utf8", true)));
    const expected = events.filter(([phase, token]) => phase === "enter" && token.type === "data").map(([, token]) => ({
      type: "text", startOffset: prefix.length + token.start.offset, endOffset: prefix.length + token.end.offset,
      value: text.slice(token.start.offset, token.end.offset)
    }));
    vi.mocked(parse).mockClear();
    expect(parseInlineAst(prefix + text + "后缀", prefix.length, prefix.length + text.length)).toEqual({
      type: "root", startOffset: prefix.length, endOffset: prefix.length + text.length, children: expected
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it.each(["trailing ", "  ", "a\tb", "a\nb", "a\r\nb", "a\n", "a\r", "a\r\n", "a\u2028", "a\u0000b", "**bold**", "_em_", "~~delete~~", "`code`", "$x$", "[link](a.md)", "[^note]", "<br>", "&amp;", "a\\!", "😀"])("特殊语法和空白仍交给原解析器：%s", text => {
    vi.mocked(parse).mockClear();
    parseInlineAst(text, 0, text.length);
    expect(parse).toHaveBeenCalledOnce();
  });

  it("保留空区间、范围截断、遮罩源和原有计数事件", () => {
    const onInlineParse = vi.fn();
    const instrumentation = { onFullDocumentParse: vi.fn(), onInlineParse };
    const source = createMaskedSource("> plain", [{ startOffset: 0, endOffset: 2 }]);
    expect(parseInlineAst(source, -5, 99, { instrumentation })).toEqual({
      type: "root", startOffset: 0, endOffset: 7,
      children: [{ type: "text", startOffset: 0, endOffset: 7, value: "  plain" }]
    });
    expect(onInlineParse).toHaveBeenCalledWith({ startOffset: 0, endOffset: 7, sourceLength: 7 });
    expect(parseInlineAst("text", 3, 1).children).toEqual([]);
  });
});
