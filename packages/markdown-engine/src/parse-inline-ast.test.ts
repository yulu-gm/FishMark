import { describe, expect, it } from "vitest";

import { parseInlineAst } from "./index";
import type { InlineRoot } from "./index";

function parse(source: string, startOffset = 0, endOffset = source.length): InlineRoot {
  return parseInlineAst(source, startOffset, endOffset);
}

describe("parseInlineAst", () => {
  it("parses **bold**", () => {
    const root = parse("**bold**");

    expect(root).toEqual({
      type: "root",
      startOffset: 0,
      endOffset: 8,
      children: [
        {
          type: "strong",
          startOffset: 0,
          endOffset: 8,
          openMarker: { startOffset: 0, endOffset: 2 },
          closeMarker: { startOffset: 6, endOffset: 8 },
          children: [{ type: "text", startOffset: 2, endOffset: 6, value: "bold" }]
        }
      ]
    });
  });

  it("parses *italic*", () => {
    const root = parse("*italic*");

    expect(root).toEqual({
      type: "root",
      startOffset: 0,
      endOffset: 8,
      children: [
        {
          type: "emphasis",
          startOffset: 0,
          endOffset: 8,
          openMarker: { startOffset: 0, endOffset: 1 },
          closeMarker: { startOffset: 7, endOffset: 8 },
          children: [{ type: "text", startOffset: 1, endOffset: 7, value: "italic" }]
        }
      ]
    });
  });

  it("parses `code`", () => {
    const root = parse("`code`");

    expect(root).toEqual({
      type: "root",
      startOffset: 0,
      endOffset: 6,
      children: [
        {
          type: "codeSpan",
          startOffset: 0,
          endOffset: 6,
          text: "code",
          openMarker: { startOffset: 0, endOffset: 1 },
          closeMarker: { startOffset: 5, endOffset: 6 }
        }
      ]
    });
  });

  it("parses inline HTML br tags as hard break nodes", () => {
    const root = parse("Alpha<br>Beta<BR />Gamma");

    expect(root.children).toEqual([
      { type: "text", startOffset: 0, endOffset: 5, value: "Alpha" },
      { type: "hardBreak", startOffset: 5, endOffset: 9 },
      { type: "text", startOffset: 9, endOffset: 13, value: "Beta" },
      { type: "hardBreak", startOffset: 13, endOffset: 19 },
      { type: "text", startOffset: 19, endOffset: 24, value: "Gamma" }
    ]);
  });

  it("keeps br tags inside inline code as code text", () => {
    const root = parse("`Alpha<br>Beta`");

    expect(root.children).toEqual([
      {
        type: "codeSpan",
        startOffset: 0,
        endOffset: 15,
        text: "Alpha<br>Beta",
        openMarker: { startOffset: 0, endOffset: 1 },
        closeMarker: { startOffset: 14, endOffset: 15 }
      }
    ]);
  });

  it("parses ~~strike~~", () => {
    const root = parse("~~strike~~");

    expect(root).toEqual({
      type: "root",
      startOffset: 0,
      endOffset: 10,
      children: [
        {
          type: "strikethrough",
          startOffset: 0,
          endOffset: 10,
          openMarker: { startOffset: 0, endOffset: 2 },
          closeMarker: { startOffset: 8, endOffset: 10 },
          children: [{ type: "text", startOffset: 2, endOffset: 8, value: "strike" }]
        }
      ]
    });
  });

  it("parses ***both***", () => {
    const root = parse("***both***");

    expect(root.children).toEqual([
      {
        type: "emphasis",
        startOffset: 0,
        endOffset: 10,
        openMarker: { startOffset: 0, endOffset: 1 },
        closeMarker: { startOffset: 9, endOffset: 10 },
        children: [
          {
            type: "strong",
            startOffset: 1,
            endOffset: 9,
            openMarker: { startOffset: 1, endOffset: 3 },
            closeMarker: { startOffset: 7, endOffset: 9 },
            children: [{ type: "text", startOffset: 3, endOffset: 7, value: "both" }]
          }
        ]
      }
    ]);
  });

  it("parses ~~**mix**~~", () => {
    const root = parse("~~**mix**~~");

    expect(root.children).toEqual([
      {
        type: "strikethrough",
        startOffset: 0,
        endOffset: 11,
        openMarker: { startOffset: 0, endOffset: 2 },
        closeMarker: { startOffset: 9, endOffset: 11 },
        children: [
          {
            type: "strong",
            startOffset: 2,
            endOffset: 9,
            openMarker: { startOffset: 2, endOffset: 4 },
            closeMarker: { startOffset: 7, endOffset: 9 },
            children: [{ type: "text", startOffset: 4, endOffset: 7, value: "mix" }]
          }
        ]
      }
    ]);
  });

  it("parses **a `code` b** without parsing marks inside codeSpan", () => {
    const root = parse("**a `code` b**");

    expect(root.children).toEqual([
      {
        type: "strong",
        startOffset: 0,
        endOffset: 14,
        openMarker: { startOffset: 0, endOffset: 2 },
        closeMarker: { startOffset: 12, endOffset: 14 },
        children: [
          { type: "text", startOffset: 2, endOffset: 4, value: "a " },
          {
            type: "codeSpan",
            startOffset: 4,
            endOffset: 10,
            text: "code",
            openMarker: { startOffset: 4, endOffset: 5 },
            closeMarker: { startOffset: 9, endOffset: 10 }
          },
          { type: "text", startOffset: 10, endOffset: 12, value: " b" }
        ]
      }
    ]);
  });

  it("parses [**label**](https://example.com) with destination offsets", () => {
    const source = "[**label**](https://example.com)";
    const root = parse(source);

    expect(root.children).toEqual([
      {
        type: "link",
        startOffset: 0,
        endOffset: source.length,
        openMarker: { startOffset: 0, endOffset: 1 },
        closeMarker: { startOffset: 10, endOffset: 11 },
        href: "https://example.com",
        title: null,
        destinationStartOffset: 12,
        destinationEndOffset: 31,
        titleStartOffset: null,
        titleEndOffset: null,
        children: [
          {
            type: "strong",
            startOffset: 1,
            endOffset: 10,
            openMarker: { startOffset: 1, endOffset: 3 },
            closeMarker: { startOffset: 8, endOffset: 10 },
            children: [{ type: "text", startOffset: 3, endOffset: 8, value: "label" }]
          }
        ]
      }
    ]);
  });

  it("parses ![alt *x*](./demo.png) with alt subtree and destination offsets", () => {
    const source = "![alt *x*](./demo.png)";
    const root = parse(source);

    expect(root.children).toEqual([
      {
        type: "image",
        startOffset: 0,
        endOffset: source.length,
        openMarker: { startOffset: 1, endOffset: 2 },
        closeMarker: { startOffset: 9, endOffset: 10 },
        href: "./demo.png",
        title: null,
        destinationStartOffset: 11,
        destinationEndOffset: 21,
        titleStartOffset: null,
        titleEndOffset: null,
        children: [
          { type: "text", startOffset: 2, endOffset: 6, value: "alt " },
          {
            type: "emphasis",
            startOffset: 6,
            endOffset: 9,
            openMarker: { startOffset: 6, endOffset: 7 },
            closeMarker: { startOffset: 8, endOffset: 9 },
            children: [{ type: "text", startOffset: 7, endOffset: 8, value: "x" }]
          }
        ]
      }
    ]);
  });

  it("falls back unmatched markers to text", () => {
    const source = "prefix **open and ~~close";
    const root = parse(source);

    expect(root.children.every((node) => node.type === "text")).toBe(true);
    expect(root.children.map((node) => (node.type === "text" ? node.value : "")).join("")).toBe(source);
  });
});
