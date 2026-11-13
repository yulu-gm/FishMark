// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseTableClipboard } from "./table-clipboard";

const clipboard = (plain: string, html = "") => ({
  getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? plain : ""
});

describe("parseTableClipboard", () => {
  it("优先读取 HTML 表格，保留 br 换行和嵌套格式中的文字", () => {
    const html = "<table><tr><th><strong>A &amp; <em>B</em></strong><br><span>C</span></th>" +
      "<td><style>td{color:red}</style><script>throw Error()</script><a href='#'>D</a></td></tr></table>";
    expect(parseTableClipboard(clipboard("plain\ttext", html))).toEqual([["A & B\nC", "D"]]);
  });

  it("展开 rowspan 和 colspan，仅在左上角保留文字，并补齐短行", () => {
    const html = '<table><tr><td>A</td><td rowspan="2" colspan="2">B</td><td>C</td></tr>' +
      '<tr><td colspan="2">D</td></tr><tr><td>E</td></tr></table>';
    expect(parseTableClipboard(clipboard("", html))).toEqual([
      ["A", "B", "", "C", ""],
      ["", "", "", "D", ""],
      ["E", "", "", "", ""]
    ]);
  });

  it("将 rowspan=0 延伸到当前行组末尾", () => {
    const html = '<table><thead><tr><th rowspan="0">A</th><th>B</th></tr><tr><th>C</th></tr></thead>' +
      "<tbody><tr><td>D</td><td>E</td></tr></tbody></table>";
    expect(parseTableClipboard(clipboard("", html))).toEqual([["A", "B"], ["", "C"], ["D", "E"]]);
  });

  it("HTML 没有可读单元格时回退到纯文本", () => {
    for (const html of ["<b>没有表格</b>", "<table><tr></tr></table>"]) {
      expect(parseTableClipboard(clipboard("A\tB", html))).toEqual([["A", "B"]]);
    }
  });

  it("解析引号内的制表符、CRLF 和双引号转义，忽略末尾记录换行", () => {
    const plain = '"A\tB"\t"第一行\r\n第二行"\t"他说""好"""\r\nC\tD\t\r\n';
    expect(parseTableClipboard(clipboard(plain))).toEqual([
      ["A\tB", "第一行\n第二行", '他说"好"'],
      ["C", "D", ""]
    ]);
  });

  it("保留文件末尾连续空单元格，并补齐较短的行", () => {
    expect(parseTableClipboard(clipboard("A\tB\nC\t\t"))).toEqual([
      ["A", "B", ""],
      ["C", "", ""]
    ]);
  });

  it("支持只有一列的多行文本，并保留真正的空记录", () => {
    expect(parseTableClipboard(clipboard("A\n\nB\n\n"))).toEqual([["A"], [""], ["B"], [""]]);
  });

  it("对普通单行文本、空剪贴板和未闭合的引用字段返回 null", () => {
    expect(parseTableClipboard(null)).toBeNull();
    for (const plain of ["", " 单行文本 ", '"未闭合\tB']) {
      expect(parseTableClipboard(clipboard(plain))).toBeNull();
    }
  });
});
