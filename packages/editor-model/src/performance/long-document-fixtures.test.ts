import { describe, expect, it } from "vitest";

import {
  createLongMarkdownFixture,
  countMarkdownLines
} from "./long-document-fixtures";

describe("createLongMarkdownFixture", () => {
  it("creates a 5000-line plain paragraph document", () => {
    const fixture = createLongMarkdownFixture({
      kind: "plain-paragraphs",
      lineCount: 5000
    });

    expect(fixture.kind).toBe("plain-paragraphs");
    expect(fixture.lineCount).toBe(5000);
    expect(countMarkdownLines(fixture.source)).toBe(5000);
    expect(fixture.source).toContain("Paragraph line 5000");
  });

  it("creates a mixed Markdown document with headings, lists, blockquotes, and code fences", () => {
    const fixture = createLongMarkdownFixture({
      kind: "mixed-blocks",
      lineCount: 5000
    });

    expect(fixture.kind).toBe("mixed-blocks");
    expect(fixture.lineCount).toBe(5000);
    expect(countMarkdownLines(fixture.source)).toBe(5000);
    expect(fixture.source).toContain("# Section 1");
    expect(fixture.source).toContain("1. Ordered item");
    expect(fixture.source).toContain("> Quoted note");
    expect(fixture.source).toContain("```ts");
  });

  it("creates a document with the requested number of fenced code blocks", () => {
    const fixture = createLongMarkdownFixture({
      kind: "code-fences",
      codeFenceCount: 100
    });

    expect(fixture.kind).toBe("code-fences");
    expect(fixture.codeFenceCount).toBe(100);
    expect(fixture.source.match(/```ts/g)?.length).toBe(100);
    expect(fixture.source).toContain("const value100 = 100;");
  });
});
