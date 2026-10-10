import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { parseFullDocumentTree } from "@fishmark/markdown-engine";

import { buildRenderPlan } from "../render-plan";
import { renderFishmarkMarkdownContent } from "./render-export-content";

function render(source: string): string {
  const tree = parseFullDocumentTree(source);
  return renderFishmarkMarkdownContent(buildRenderPlan(tree, { revision: 0 }));
}

describe("canonical HTML export presentation", () => {
  it.each([
    ["123456789. plain\n           continued", 10],
    ["> 123456789. quoted\n>            continued", 10],
    ["- parent\n  123456789. nested\n             continued", 10],
    ["123456789. [ ] task\n              continued", 14],
    ["123456789.\t[ ] tabtask\n              continued", 17]
  ] as const)("exports the same marker gutter on the first and continuation lines: %s", (source, columns) => {
    const html = render(source);
    const matchingLines = html.match(/<div[^>]*cm-list-wide-marker[^>]*>/gu) ?? [];
    expect(matchingLines).toHaveLength(2);
    for (const line of matchingLines) expect(line).toContain(`--fishmark-list-marker-source-width: ${columns}ch;`);
    expect(matchingLines[0]).toContain("cm-inactive-list-ordered");
    expect(matchingLines[1]).toContain("cm-inactive-list-continuation");
  });

  it.each([
    ["> 123456789. quoted\n>            continuationlabel", ">            "],
    ["> 123456789. [ ] quoted\n>               continuationlabel", ">               "],
    ["> > 123456789. quoted\n> >            continuationlabel", "> >            "],
    ["> - quoted\n>   continuationlabel", ">   "],
    ["> 123456789. quoted\r\n>            continuationlabel", ">            "]
  ] as const)("exports quoted list continuation indentation outside body text: %s", (source, prefix) => {
    const document = new JSDOM(render(source)).window.document;
    const line = document.querySelector(".cm-inactive-list-continuation")!;
    expect(line.querySelector(".cm-inactive-list-source-prefix")?.textContent).toBe(prefix);
    expect(Array.from(line.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join(""))
      .toBe("continuationlabel");
    expect(line.textContent).toBe(`${prefix}continuationlabel`);
  });

  it("preserves an empty quote row between list continuation text", () => {
    const document = new JSDOM(render("> 123456789. quoted\n>\n>            continuationlabel")).window.document;
    const lines = Array.from(document.querySelectorAll(".cm-line"));
    const emptyLine = lines.find(line => line.textContent === ">");
    expect(emptyLine?.querySelector("br")).not.toBeNull();
    expect(document.querySelector(".cm-inactive-list-continuation:last-child")?.textContent)
      .toBe(">            continuationlabel");
  });

  it("renders nested container leaves from the canonical tree", () => {
    const html = render([
      "> - **item**",
      ">",
      "> ```mermaid",
      "> graph TD",
      ">   A --> B",
      "> ```"
    ].join("\n"));

    expect(html).toContain("cm-inactive-blockquote");
    expect(html).toContain("cm-inactive-list");
    expect(html).toContain("cm-inactive-inline-strong");
    expect(html).toContain("data-language=\"mermaid\"");
    expect(html).toContain("graph TD");
  });

  it("uses canonical table-cell inline AST instead of reparsing cell text", () => {
    const html = render([
      "| name | value |",
      "| --- | --- |",
      "| **bold** | x<br>y |"
    ].join("\n"));

    expect(html).toContain("cm-table-widget");
    expect(html).toContain("cm-inactive-inline-strong");
    expect(html).toContain("x<br>y");
  });

  it("uses canonical reference and footnote indexes without leaking definition source", () => {
    const html = render([
      "![Alt][img] note[^n].",
      "",
      "[img]: hero.png",
      "[^n]: **footnote**"
    ].join("\n"));

    expect(html).toContain('src="hero.png"');
    expect(html).toContain("fishmark-footnotes");
    expect(html).toContain("cm-inactive-inline-strong");
    expect(html).not.toContain("[img]:");
    expect(html).not.toContain("[^n]:");
  });
});
