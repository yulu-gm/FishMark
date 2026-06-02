import { describe, expect, it } from "vitest";

import { collectFootnoteDefinitions, parseMarkdownDocument } from "./index";

describe("parseMarkdownDocument footnotes", () => {
  it("collects valid footnote definitions and parses references with absolute ranges", () => {
    const source = [
      "Alpha[^note].",
      "",
      "[^note]: Footnote **body**",
      "    continuation `code`",
      "",
      "Tail"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const definition = document.footnoteDefinitions?.get("note");
    const paragraph = document.blocks[0];
    const definitionBlock = document.blocks[1];

    expect(definition).toMatchObject({
      identifier: "note",
      label: "note",
      startOffset: source.indexOf("[^note]:"),
      endOffset: source.indexOf("\n\nTail"),
      labelStartOffset: source.indexOf("note", source.indexOf("[^note]:")),
      labelEndOffset: source.indexOf("note", source.indexOf("[^note]:")) + "note".length,
      markerStartOffset: source.indexOf("[^note]:"),
      markerEndOffset: source.indexOf("[^note]:") + "[^note]:".length,
      contentStartOffset: source.indexOf("Footnote"),
      contentEndOffset: source.indexOf("continuation") + "continuation `code`".length
    });
    expect(definition?.lines).toHaveLength(2);
    expect(definition?.lines[0]?.inline?.children[1]).toMatchObject({ type: "strong" });
    expect(definition?.lines[1]?.inline?.children[1]).toMatchObject({ type: "codeSpan", text: "code" });

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") {
      return;
    }

    expect(paragraph.inline?.children).toEqual([
      { type: "text", startOffset: 0, endOffset: 5, value: "Alpha" },
      {
        type: "footnoteReference",
        startOffset: 5,
        endOffset: 12,
        identifier: "note",
        label: "note",
        labelStartOffset: 7,
        labelEndOffset: 11,
        openMarker: { startOffset: 5, endOffset: 7 },
        closeMarker: { startOffset: 11, endOffset: 12 }
      },
      { type: "text", startOffset: 12, endOffset: 13, value: "." }
    ]);

    expect(definitionBlock).toMatchObject({
      type: "definition",
      startOffset: definition?.startOffset,
      endOffset: definition?.endOffset,
      footnoteDefinition: {
        status: "valid",
        identifier: "note"
      }
    });
    expect(document.blocks[2]).toMatchObject({
      type: "paragraph",
      startOffset: source.indexOf("Tail")
    });
  });

  it("keeps duplicate, malformed, and undefined footnotes out of the semantic map", () => {
    const source = [
      "Alpha[^dup] [^missing].",
      "",
      "[^dup]: first",
      "[^dup]: second",
      "",
      "[^]: malformed",
      "",
      "![Alt][ref]",
      "",
      "[ref]: https://example.com"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const footnoteDefinitions = collectFootnoteDefinitions(source);
    const paragraph = document.blocks[0];
    const duplicateBlocks = document.blocks.filter(
      (block) => block.type === "definition" && block.footnoteDefinition?.status === "duplicate"
    );
    const malformedBlock = document.blocks.find(
      (block) => block.type === "definition" && block.footnoteDefinition?.status === "malformed"
    );

    expect(footnoteDefinitions.has("dup")).toBe(false);
    expect(document.footnoteDefinitions?.has("dup")).toBe(false);
    expect(document.footnoteDefinitions?.has("missing")).toBe(false);
    expect(duplicateBlocks).toHaveLength(2);
    expect(malformedBlock).toMatchObject({
      type: "definition",
      startOffset: source.indexOf("[^]: malformed"),
      footnoteDefinition: {
        status: "malformed"
      }
    });
    expect(document.referenceDefinitions?.get("ref")?.href).toBe("https://example.com");
    expect(document.referenceDefinitions?.has("^dup")).toBe(false);

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") {
      return;
    }

    expect(paragraph.inline?.children).toEqual([
      {
        type: "text",
        startOffset: 0,
        endOffset: "Alpha[^dup] [^missing].".length,
        value: "Alpha[^dup] [^missing]."
      }
    ]);
  });

  it("ignores footnote-looking definitions inside code fences", () => {
    const source = [
      "```md",
      "[^code]: not a definition",
      "```",
      "",
      "Text[^code]"
    ].join("\n");
    const document = parseMarkdownDocument(source);

    expect(collectFootnoteDefinitions(source).has("code")).toBe(false);
    expect(document.footnoteDefinitions?.has("code")).toBe(false);

    const paragraph = document.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toMatchObject({
      type: "paragraph",
      startOffset: source.indexOf("Text[^code]")
    });

    if (paragraph?.type !== "paragraph") {
      return;
    }

    expect(paragraph.inline?.children).toEqual([
      {
        type: "text",
        startOffset: source.indexOf("Text[^code]"),
        endOffset: source.length,
        value: "Text[^code]"
      }
    ]);
  });

  it("ignores footnote-looking definitions inside list bodies and blockquotes", () => {
    const source = [
      "Text[^real].",
      "",
      "- item",
      "  [^list]: not a definition",
      "",
      "> [^quote]: not a definition",
      "",
      "[^real]: Real note"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const footnoteDefinitions = collectFootnoteDefinitions(source);
    const paragraph = document.blocks[0];

    expect(footnoteDefinitions.has("real")).toBe(true);
    expect(footnoteDefinitions.has("list")).toBe(false);
    expect(footnoteDefinitions.has("quote")).toBe(false);
    expect(document.footnoteDefinitions?.has("real")).toBe(true);
    expect(document.footnoteDefinitions?.has("list")).toBe(false);
    expect(document.footnoteDefinitions?.has("quote")).toBe(false);

    expect(document.blocks.some((block) => block.type === "list")).toBe(true);
    expect(document.blocks.some((block) => block.type === "blockquote")).toBe(true);

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") {
      return;
    }

    expect(paragraph.inline?.children[1]).toMatchObject({
      type: "footnoteReference",
      identifier: "real"
    });
  });
});
