import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectMicromarkEventViews, type MicromarkEventView } from "./micromark-event-adapter";
import { collectReferenceDefinitions } from "./definition-index";

const structuralTypes = new Set(["blockQuote", "listOrdered", "listUnordered", "listItemPrefix", "atxHeading", "setextHeading", "paragraph", "codeFenced", "codeIndented", "mathFlow", "thematicBreak", "definition", "htmlFlow"]);
const geometry = (events: readonly MicromarkEventView[]) => events.filter(event => structuralTypes.has(event.type)).map(({ kind, type, startOffset, endOffset, startLine, endLine }) => ({ kind, type, startOffset, endOffset, startLine, endLine }));

describe("仅结构扫描", () => {
  it.each([
    "# **标题**\n\n- `code` [link](a)\n  - $x$\n\n> paragraph *em*\n> next",
    "[ref]: /target \"title\"\n\n[ref]\n\n$$\n[inside]: /math\n$$\n\n<div>\ntext\n</div>",
    "Title\r\n===\r\n\r\n> lazy `code\r\ncontinued`\r\n\r\n1. [a]\r\n   continuation\r\n\r\n[a]: /url",
    "```md\n[a]: /ignored\n```\n\n    [b]: /ignored\n\n[^note]: footnote\n\n![alt][label]\n[label]: <a b> 'title'"
  ])("保持容器、叶节点和 CRLF 位置：%s", source => {
    const complete = collectMicromarkEventViews(source);
    const structural = collectMicromarkEventViews(source, {}, true);
    expect(geometry(structural)).toEqual(geometry(complete));
    expect(structural.some(event => ["strong", "emphasis", "codeText", "link", "image", "mathText"].includes(event.type))).toBe(false);
  });

  it("规范混合长文的结构事件完全一致，并减少临时事件", () => {
    const source = readFileSync("fixtures/performance/complex-20000-lines.md", "utf8");
    const complete = collectMicromarkEventViews(source);
    const structural = collectMicromarkEventViews(source, {}, true);
    expect(geometry(structural)).toEqual(geometry(complete));
    expect(structural.length).toBeLessThan(complete.length);
  });

  it("引用定义保留首个定义、嵌套、转义及原始绝对位置", () => {
    const source = "> [REF]: <a&amp;b> \"*title*\"\n\n[ref]: /second\n\n- [nested]: /path\n\n$$\n\n[math]: /existing-behavior\n$$";
    const definitions = collectReferenceDefinitions(source);
    expect(definitions.get("ref")).toMatchObject({ href: "a&amp;b", title: "*title*", destinationStartOffset: source.indexOf("a&amp;b"), destinationEndOffset: source.indexOf("a&amp;b") + 7 });
    expect(definitions.get("nested")?.href).toBe("/path");
    // 定义索引原本不启用 math 扩展；本次不借性能修改改变此既有语义。
    expect(definitions.get("math")?.href).toBe("/existing-behavior");
  });
});
