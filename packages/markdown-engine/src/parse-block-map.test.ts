import { describe, expect, it } from "vitest";

import { parseBlockMap } from "./index";

describe("parseBlockMap", () => {
  it("returns top-level heading, paragraph, list, and blockquote blocks in source order", () => {
    const source = [
      "# Title",
      "",
      "Paragraph line 1",
      "Paragraph line 2",
      "",
      "- one",
      "- two",
      "",
      "> quote",
      "> more"
    ].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toEqual([
      {
        id: "heading:0-7",
        type: "heading",
        startOffset: 0,
        endOffset: 7,
        startLine: 1,
        endLine: 1,
        depth: 1
      },
      {
        id: "paragraph:9-42",
        type: "paragraph",
        startOffset: 9,
        endOffset: 42,
        startLine: 3,
        endLine: 4
      },
      {
        id: "list:44-55",
        type: "list",
        startOffset: 44,
        endOffset: 55,
        startLine: 6,
        endLine: 7,
        ordered: false
      },
      {
        id: "blockquote:57-71",
        type: "blockquote",
        startOffset: 57,
        endOffset: 71,
        startLine: 9,
        endLine: 10
      }
    ]);
  });

  it("captures heading depth, ordered-list metadata, and exact source slices", () => {
    const source = ["Heading", "===", "", "1. one", "2. two"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toEqual([
      {
        id: "heading:0-11",
        type: "heading",
        startOffset: 0,
        endOffset: 11,
        startLine: 1,
        endLine: 2,
        depth: 1
      },
      {
        id: "list:13-26",
        type: "list",
        startOffset: 13,
        endOffset: 26,
        startLine: 4,
        endLine: 5,
        ordered: true
      }
    ]);

    expect(source.slice(result.blocks[0]!.startOffset, result.blocks[0]!.endOffset)).toBe("Heading\n===");
    expect(source.slice(result.blocks[1]!.startOffset, result.blocks[1]!.endOffset)).toBe("1. one\n2. two");
  });

  it("returns no blocks for empty or whitespace-only input", () => {
    expect(parseBlockMap("").blocks).toEqual([]);
    expect(parseBlockMap("\n  \n\t").blocks).toEqual([]);
  });

  it("does not emit nested paragraph blocks from lists or blockquotes", () => {
    const source = ["- item", "  still item", "", "> quote", "> more"].join("\n");

    expect(parseBlockMap(source).blocks).toEqual([
      {
        id: "list:0-19",
        type: "list",
        startOffset: 0,
        endOffset: 19,
        startLine: 1,
        endLine: 2,
        ordered: false
      },
      {
        id: "blockquote:21-35",
        type: "blockquote",
        startOffset: 21,
        endOffset: 35,
        startLine: 4,
        endLine: 5
      }
    ]);
  });
});
