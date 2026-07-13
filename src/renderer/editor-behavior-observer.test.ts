// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  observePhysicalLineSemantics,
  observeLineDomMapping,
  observeSemanticPath
} from "./editor-behavior-observer";

describe("editor behavior observer", () => {
  it("projects the real parser block path without filling missing list descendants", () => {
    const paragraph = observeSemanticPath("Paragraph", 4);
    expect(paragraph).toEqual({
      raw: ["paragraph"],
      canonical: ["Document", "Paragraph"]
    });

    const source = ["> > - $$", "> >   x + y", "> >   $$"].join("\n");
    const nested = observeSemanticPath(source, source.indexOf("x + y"));
    expect(nested).toEqual({
      raw: ["blockquote", "blockquote", "list"],
      canonical: ["Document", "Blockquote", "Blockquote", "List"]
    });
    expect(nested.canonical).not.toContain("BlockMath");
  });

  it("derives nested quote/list columns without inventing an absent math descendant", () => {
    const source = ["> > - $$", "> >   x + y", "> >   $$"].join("\n");
    const lines = observePhysicalLineSemantics(source);

    expect(lines.map(({ role, semanticDepth, contentColumn, markerColumn }) => ({
      role,
      semanticDepth,
      contentColumn,
      markerColumn
    }))).toEqual([
      {
        role: "content",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 4
      },
      {
        role: "content",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 2
      },
      {
        role: "content",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 2
      }
    ]);
  });

  it("uses ordered and task marker offsets for the editable content column", () => {
    const lines = observePhysicalLineSemantics("1. leaf\n- [ ] task");

    expect(lines.map(({ semanticDepth, contentColumn, markerColumn }) => ({
      semanticDepth,
      contentColumn,
      markerColumn
    }))).toEqual([
      { semanticDepth: 1, contentColumn: 3, markerColumn: 0 },
      { semanticDepth: 1, contentColumn: 6, markerColumn: 0 }
    ]);
  });

  it("does not reinterpret ordinary leading whitespace as a semantic prefix", () => {
    const line = observePhysicalLineSemantics("   ")[0]!;
    expect(line).toMatchObject({
      semanticDepth: 0,
      contentColumn: 0,
      markerColumn: null,
      role: "whitespace-only"
    });
  });

  it("classifies physical blank, code fence, and source content roles independently", () => {
    const source = ["Paragraph", "", "```ts", "code", "```", ""].join("\n");
    const lines = observePhysicalLineSemantics(source);

    expect(lines.map(({ role }) => role)).toEqual([
      "content",
      "structural-separator",
      "code-fence-delimiter",
      "code-fence-content",
      "code-fence-delimiter",
      "empty-editing-line"
    ]);
  });

  it.each([
    {
      source: "> \n> ",
      roles: ["structural-separator", "structural-separator"],
      contentColumns: [2, 2]
    },
    {
      source: "- \n- ",
      roles: ["structural-separator", "structural-separator"],
      contentColumns: [2, 2]
    },
    {
      source: "> \n> alpha",
      roles: ["structural-separator", "content"],
      contentColumns: [2, 2]
    },
    {
      source: "- item\n  \n  continuation",
      roles: ["content", "whitespace-only", "content"],
      contentColumns: [2, 0, 0]
    }
  ])(
    "keeps content classification within each physical line for $source",
    ({ source, roles, contentColumns }) => {
      const lines = observePhysicalLineSemantics(source);
      expect(lines.map(({ role }) => role)).toEqual(roles);
      expect(lines.map(({ contentColumn }) => contentColumn)).toEqual(contentColumns);
      for (const line of lines) {
        expect(line.contentColumn).toBeLessThanOrEqual(line.sourceText.length);
      }
    }
  );

  it("does not treat an unclosed fence or indented code content as a closing delimiter", () => {
    expect(observePhysicalLineSemantics("```ts\ncode").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("    alpha\n    beta").map(({ role }) => role)).toEqual([
      "code-fence-content",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("> ```ts\n> code").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("> ```ts\n> code\n> ```").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content",
      "code-fence-delimiter"
    ]);
  });

  it("observes parser-owned top-level block math boundaries and content", () => {
    const lines = observePhysicalLineSemantics("$$\nx + y\n$$");
    expect(lines.map(({ role }) => role)).toEqual([
      "block-math-delimiter",
      "block-math-content",
      "block-math-delimiter"
    ]);
  });

  it("records actual source-line and widget visibility instead of assuming visibility", () => {
    const sourceLine = document.createElement("div");
    sourceLine.className = "cm-line";
    sourceLine.style.display = "block";
    sourceLine.style.visibility = "visible";
    sourceLine.style.opacity = "1";
    document.body.append(sourceLine);
    vi.spyOn(sourceLine, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 20
    } as DOMRect);

    expect(observeLineDomMapping(1, sourceLine)).toEqual({
      visibility: "visible",
      mapping: expect.objectContaining({
        line: 1,
        kind: "source-line",
        display: "block",
        visibility: "visible",
        opacity: "1",
        rect: { width: 100, height: 20 }
      })
    });

    vi.mocked(sourceLine.getBoundingClientRect).mockReturnValue({
      width: 100,
      height: 0
    } as DOMRect);
    expect(observeLineDomMapping(1, sourceLine).visibility).toBe("collapsed");

    const table = document.createElement("div");
    table.className = "cm-table-widget";
    table.style.display = "none";
    document.body.append(table);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0
    } as DOMRect);

    expect(observeLineDomMapping(2, table)).toMatchObject({
      visibility: "collapsed",
      mapping: { line: 2, kind: "table-widget", display: "none" }
    });
    expect(observeLineDomMapping(3, null)).toMatchObject({
      visibility: "collapsed",
      mapping: { line: 3, kind: "missing" }
    });
  });
});
