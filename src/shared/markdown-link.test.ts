import { describe, expect, it } from "vitest";
import { isRelativeMarkdownLink } from "./markdown-link";

describe("本地 Markdown 链接分类", () => {
  it.each(["../../_trace_analysis/NiagaraDiagnosis_20261026/findings.md", "./中文 记录.MD", "../a%20b.markdown#标题", "a.md?view=1", "..\\notes\\a.md"])("接受相对路径 %s", href => {
    expect(isRelativeMarkdownLink(href)).toBe(true);
  });
  it.each(["https://example.com/a.md", "http://example.com", "mailto:a@example.com", "file:///a.md", "javascript:alert(1)", "data:text/plain,a.md", "C:/a.md", "/a.md", "//server/a.md", "\\\\server\\a.md", "%2fa.md", "%5ca.md", "a%00.md", "a%3Ab.md", "a%.md", "a.pdf", "#a.md", ""])("拒绝本地入口处理 %s", href => {
    expect(isRelativeMarkdownLink(href)).toBe(false);
  });
});
