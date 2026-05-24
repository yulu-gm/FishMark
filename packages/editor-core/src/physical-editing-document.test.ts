import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createPhysicalEditingDocument } from "./physical-editing-document";

describe("createPhysicalEditingDocument", () => {
  it("creates one active-capable empty line for an empty document", () => {
    const document = createPhysicalEditingDocument("");

    expect(document.lines).toEqual([
      {
        number: 1,
        from: 0,
        to: 0,
        text: "",
        lineBreakTo: 0,
        kind: "empty",
        isDocumentStart: true,
        isDocumentEnd: true
      }
    ]);
    expect(document.getLineAtOffset(0)).toBe(document.lines[0]);
  });

  it("keeps whitespace-only source as a physical whitespace line", () => {
    const document = createPhysicalEditingDocument("   \t");

    expect(document.lines).toEqual([
      expect.objectContaining({
        number: 1,
        from: 0,
        to: 4,
        text: "   \t",
        lineBreakTo: 4,
        kind: "whitespace",
        isDocumentStart: true,
        isDocumentEnd: true
      })
    ]);
  });

  it("represents mixed text, blank, and whitespace source lines", () => {
    const source = ["alpha", "", "  ", "omega"].join("\n");
    const document = createPhysicalEditingDocument(source);

    expect(document.lines.map((line) => ({
      number: line.number,
      from: line.from,
      to: line.to,
      text: line.text,
      lineBreakTo: line.lineBreakTo,
      kind: line.kind
    }))).toEqual([
      { number: 1, from: 0, to: 5, text: "alpha", lineBreakTo: 6, kind: "text" },
      { number: 2, from: 6, to: 6, text: "", lineBreakTo: 7, kind: "empty" },
      { number: 3, from: 7, to: 9, text: "  ", lineBreakTo: 10, kind: "whitespace" },
      { number: 4, from: 10, to: 15, text: "omega", lineBreakTo: 15, kind: "text" }
    ]);
    expect(document.getLineAtOffset(5)?.number).toBe(1);
    expect(document.getLineAtOffset(6)?.number).toBe(2);
    expect(document.getLineAtOffset(source.length)?.number).toBe(4);
  });

  it("keeps CRLF boundaries out of line text while preserving line break offsets", () => {
    const source = "a\r\nb";
    const document = createPhysicalEditingDocument(source);

    expect(document.lines.map((line) => ({
      number: line.number,
      from: line.from,
      to: line.to,
      text: line.text,
      lineBreakTo: line.lineBreakTo,
      kind: line.kind
    }))).toEqual([
      { number: 1, from: 0, to: 1, text: "a", lineBreakTo: 3, kind: "text" },
      { number: 2, from: 3, to: 4, text: "b", lineBreakTo: 4, kind: "text" }
    ]);
    expect(document.getLineAtOffset(1)?.number).toBe(1);
    expect(document.getLineAtOffset(2)?.number).toBe(1);
    expect(document.getLineAtOffset(3)?.number).toBe(2);
    expect(document.getLineAtOffset(source.length)?.number).toBe(2);
  });

  it("creates a final empty physical line after a trailing newline", () => {
    const source = "a\n";
    const document = createPhysicalEditingDocument(source);

    expect(document.lines.map((line) => ({
      number: line.number,
      from: line.from,
      to: line.to,
      text: line.text,
      lineBreakTo: line.lineBreakTo,
      kind: line.kind,
      isDocumentEnd: line.isDocumentEnd
    }))).toEqual([
      {
        number: 1,
        from: 0,
        to: 1,
        text: "a",
        lineBreakTo: 2,
        kind: "text",
        isDocumentEnd: false
      },
      {
        number: 2,
        from: 2,
        to: 2,
        text: "",
        lineBreakTo: 2,
        kind: "empty",
        isDocumentEnd: true
      }
    ]);
    expect(document.getLineAtOffset(source.length)).toBe(document.lines[1]);
  });

  it("preserves multiple consecutive blank physical lines", () => {
    const source = "a\n\n\nb";
    const document = createPhysicalEditingDocument(source);

    expect(document.lines.map((line) => ({
      number: line.number,
      from: line.from,
      to: line.to,
      text: line.text,
      lineBreakTo: line.lineBreakTo,
      kind: line.kind
    }))).toEqual([
      { number: 1, from: 0, to: 1, text: "a", lineBreakTo: 2, kind: "text" },
      { number: 2, from: 2, to: 2, text: "", lineBreakTo: 3, kind: "empty" },
      { number: 3, from: 3, to: 3, text: "", lineBreakTo: 4, kind: "empty" },
      { number: 4, from: 4, to: 5, text: "b", lineBreakTo: 5, kind: "text" }
    ]);
    expect(document.getLineAtOffset(2)).toBe(document.lines[1]);
    expect(document.getLineAtOffset(3)).toBe(document.lines[2]);
    expect(document.getLineAtOffset(source.length)).toBe(document.lines[3]);
  });

  it("maps heading and structural blank separator overlays without faking blocks", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const markdownDocument = parseMarkdownDocument(source);
    const document = createPhysicalEditingDocument(source, markdownDocument);

    expect(document.semanticLineMap.lines.map((line) => ({
      lineNumber: line.line.number,
      role: line.role,
      blockType: line.block?.type ?? null
    }))).toEqual([
      { lineNumber: 1, role: "heading", blockType: "heading" },
      { lineNumber: 2, role: "structural-separator", blockType: null },
      { lineNumber: 3, role: "paragraph", blockType: "paragraph" }
    ]);
    expect(markdownDocument.blocks.map((block) => block.type)).toEqual(["heading", "paragraph"]);
  });

  it("marks styled block leading separators without treating whitespace lines as structural", () => {
    const source = ["Paragraph", "   ", "", "| a | b |", "| - | - |"].join("\n");
    const markdownDocument = parseMarkdownDocument(source);
    const document = createPhysicalEditingDocument(source, markdownDocument);

    expect(document.semanticLineMap.lines.map((line) => ({
      lineNumber: line.line.number,
      role: line.role,
      blockType: line.block?.type ?? null
    }))).toEqual([
      { lineNumber: 1, role: "paragraph", blockType: "paragraph" },
      { lineNumber: 2, role: "extra-blank", blockType: null },
      { lineNumber: 3, role: "structural-separator", blockType: null },
      { lineNumber: 4, role: "table-source", blockType: "table" },
      { lineNumber: 5, role: "table-source", blockType: "table" }
    ]);
  });

  it("maps list item and continuation overlays", () => {
    const source = ["- one", "  continuation"].join("\n");
    const document = createPhysicalEditingDocument(source, parseMarkdownDocument(source));

    expect(document.semanticLineMap.lines.map((line) => line.role)).toEqual([
      "list-item",
      "list-continuation"
    ]);
  });

  it("maps code fence boundary and content overlays", () => {
    const source = ["```ts", "const value = 1;", "```"].join("\n");
    const document = createPhysicalEditingDocument(source, parseMarkdownDocument(source));

    expect(document.semanticLineMap.lines.map((line) => line.role)).toEqual([
      "code-fence-boundary",
      "code-fence-content",
      "code-fence-boundary"
    ]);
  });

  it("does not treat the last content line of an unclosed code fence as a boundary", () => {
    const source = ["```ts", "const value = 1;"].join("\n");
    const document = createPhysicalEditingDocument(source, parseMarkdownDocument(source));

    expect(document.semanticLineMap.lines.map((line) => line.role)).toEqual([
      "code-fence-boundary",
      "code-fence-content"
    ]);
  });
});
