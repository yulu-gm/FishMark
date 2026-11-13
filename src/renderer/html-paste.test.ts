// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { convertHtmlPasteToMarkdown } from "./html-paste";

describe("convertHtmlPasteToMarkdown", () => {
  it("转换标题、段落、行内格式、链接和引用", () => {
    const html = '<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em> <a href="../guide.md#intro">guide</a>.</p>' +
      "<blockquote><p>Quoted</p></blockquote>";
    expect(convertHtmlPasteToMarkdown(html)).toBe("## Title\n\n**Bold** and *italic* [guide](../guide.md#intro).\n\n> Quoted");
  });

  it("保留列表嵌套、起始编号和代码缩进", () => {
    const html = '<ol start="3"><li>Outer<ul><li>Inner</li></ul></li></ol>' +
      '<pre><code class="language-python">if ok:\n    <span>return 1</span>\n</code></pre><pre>alpha<br>  beta</pre>';
    const markdown = convertHtmlPasteToMarkdown(html);
    expect(markdown).toMatch(/^3\. {1,3}Outer\n {3,5}- +Inner/u);
    expect(markdown).toContain("```python\nif ok:\n    return 1\n```\n\n```\nalpha\n  beta\n```");
  });

  it("代码内的缩进反引号不会提前闭合围栏", () => {
    expect(convertHtmlPasteToMarkdown("<pre>  ```\nbody</pre>")).toBe("````\n  ```\nbody\n````");
  });

  it("无 th 的表格使用首行作表头，保留管道和单元格换行", () => {
    const html = "<table>\n<tr><td>Name</td> <td>Value</td></tr>\n<tr><td>A|B</td><td>One<br>Two</td></tr></table>";
    expect(convertHtmlPasteToMarkdown(html)).toBe("| Name | Value |\n| --- | --- |\n| A\\|B | One<br>Two |");
  });

  it("合并单元格只保留左上角内容，其余位置补空，后列不左移", () => {
    const html = '<table><thead><tr><th rowspan="0">Name</th><th colspan="2"><strong>Values</strong></th><th>Tail</th></tr>' +
      '<tr><th>Left</th><th>Right</th><th>End</th></tr></thead>' +
      '<tbody><tr><td>A</td><td rowspan="2" colspan="2"><em>B</em></td><td>C</td></tr>' +
      '<tr><td>D</td><td>E</td></tr></tbody></table>';
    expect(convertHtmlPasteToMarkdown(html)).toBe([
      "| Name | **Values** |  | Tail |",
      "| --- | --- | --- | --- |",
      "|  | Left | Right | End |",
      "| A | *B* |  | C |",
      "| D |  |  | E |"
    ].join("\n"));
  });

  it("用双波浪线转换 del 和 s，保留内部行内格式", () => {
    expect(convertHtmlPasteToMarkdown("<p><del>old <strong>text</strong></del> <s>obsolete</s></p>"))
      .toBe("~~old **text**~~ ~~obsolete~~");
  });

  it("转换已勾选、未勾选和嵌套的任务项", () => {
    const html = '<ul><li><input type="checkbox" checked> Done<ul><li><input type="checkbox">Nested</li></ul></li>' +
      '<li><p><input type="checkbox"> Pending</p></li></ul><p><input type="checkbox">Outside</p>';
    expect(convertHtmlPasteToMarkdown(html)?.split("\n").filter(line => line.trim())).toEqual([
      "-   [x] Done", "    -   [ ] Nested", "-   [ ] Pending", "Outside"
    ]);
  });

  it("过滤危险内容，保留安全的相对路径和图片引用", () => {
    const html = '<base href="https://ignored.example/"><script>bad()</script><style>body { display:none }</style>' +
      '<p><a href="java&#x09;script:alert(1)">bad link</a> <img src="data:image/svg+xml,evil" alt="alt">' +
      ' <a href="./a b.md">local</a> <img src="../pic.png" alt="pic" onerror="bad()"></p>';
    expect(convertHtmlPasteToMarkdown(html)).toBe("bad link alt [local](./a%20b.md) ![pic](../pic.png)");
  });

  it("保留链接中的查询参数和片段，不把双重编码的实体变成协议", () => {
    const html = '<a href="#details">section</a> <a href="?a=1&amp;b=2">query</a> ' +
      '<a href="javascript&amp;colon;alert(1)">literal</a>';
    expect(convertHtmlPasteToMarkdown(html)).toBe("[section](#details) [query](?a=1&amp;b=2) [literal](javascript&amp;colon;alert\\(1\\))");
  });

  it("把 HTML 中的 Markdown 标记当作字面文本；没有可用 HTML 时返回 null", () => {
    expect(convertHtmlPasteToMarkdown("<p>**x** [a] &lt;script&gt; ~~b~~</p>"))
      .toBe("\\*\\*x\\*\\* \\[a\\] \\<script> \\~\\~b\\~\\~");
    for (const html of ["", " <!--StartFragment--> ", "<script>bad()</script><style>bad</style><p>&nbsp;</p>", "<table><tr></tr></table>"]) {
      expect(convertHtmlPasteToMarkdown(html)).toBeNull();
    }
  });
});
