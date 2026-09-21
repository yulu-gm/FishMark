import { describe, expect, it } from "vitest";
import { parseFullDocumentTree } from "@fishmark/markdown-engine";

import { buildRenderPlan } from "../render-plan";
import { renderFishmarkMarkdownContent } from "./render-export-content";

function render(source: string): string {
  const tree = parseFullDocumentTree(source);
  return renderFishmarkMarkdownContent(buildRenderPlan(tree, { revision: 0 }));
}

describe("canonical HTML export presentation", () => {
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
