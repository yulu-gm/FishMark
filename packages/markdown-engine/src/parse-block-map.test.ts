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
        ordered: false,
        items: [
          {
            id: "list-item:44-49",
            startOffset: 44,
            endOffset: 49,
            startLine: 6,
            endLine: 6,
            indent: 0,
            marker: "-",
            markerStart: 44,
            markerEnd: 45,
            task: null
          },
          {
            id: "list-item:50-55",
            startOffset: 50,
            endOffset: 55,
            startLine: 7,
            endLine: 7,
            indent: 0,
            marker: "-",
            markerStart: 50,
            markerEnd: 51,
            task: null
          }
        ]
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
        ordered: true,
        items: [
          {
            id: "list-item:13-19",
            startOffset: 13,
            endOffset: 19,
            startLine: 4,
            endLine: 4,
            indent: 0,
            marker: "1.",
            markerStart: 13,
            markerEnd: 15,
            task: null
          },
          {
            id: "list-item:20-26",
            startOffset: 20,
            endOffset: 26,
            startLine: 5,
            endLine: 5,
            indent: 0,
            marker: "2.",
            markerStart: 20,
            markerEnd: 22,
            task: null
          }
        ]
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
        ordered: false,
        items: [
          {
            id: "list-item:0-19",
            startOffset: 0,
            endOffset: 19,
            startLine: 1,
            endLine: 2,
            indent: 0,
            marker: "-",
            markerStart: 0,
            markerEnd: 1,
            task: null
          }
        ]
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

  it("captures list item metadata for ordered, unordered, task, and nested items", () => {
    const source = ["- one", "  - [x] done", "1. first", "2. [ ] second"].join("\n");
    const result = parseBlockMap(source);

    expect(result.blocks).toEqual([
      {
        id: "list:0-18",
        type: "list",
        startOffset: 0,
        endOffset: 18,
        startLine: 1,
        endLine: 2,
        ordered: false,
        items: [
          {
            id: "list-item:0-5",
            startOffset: 0,
            endOffset: 5,
            startLine: 1,
            endLine: 1,
            indent: 0,
            marker: "-",
            markerStart: 0,
            markerEnd: 1,
            task: null
          },
          {
            id: "list-item:6-18",
            startOffset: 6,
            endOffset: 18,
            startLine: 2,
            endLine: 2,
            indent: 2,
            marker: "-",
            markerStart: 8,
            markerEnd: 9,
            task: {
              checked: true,
              markerStart: 10,
              markerEnd: 13
            }
          }
        ]
      },
      {
        id: "list:19-41",
        type: "list",
        startOffset: 19,
        endOffset: 41,
        startLine: 3,
        endLine: 4,
        ordered: true,
        items: [
          {
            id: "list-item:19-27",
            startOffset: 19,
            endOffset: 27,
            startLine: 3,
            endLine: 3,
            indent: 0,
            marker: "1.",
            markerStart: 19,
            markerEnd: 21,
            task: null
          },
          {
            id: "list-item:28-41",
            startOffset: 28,
            endOffset: 41,
            startLine: 4,
            endLine: 4,
            indent: 0,
            marker: "2.",
            markerStart: 28,
            markerEnd: 30,
            task: {
              checked: false,
              markerStart: 31,
              markerEnd: 34
            }
          }
        ]
      }
    ]);
  });

  it("captures fenced code blocks with preserved info strings and exact source slices", () => {
    const source = [
      "```ts",
      "const answer = 42;",
      "  console.log(answer);",
      "```",
      "",
      "Paragraph"
    ].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toEqual([
      {
        id: "codeFence:0-51",
        type: "codeFence",
        startOffset: 0,
        endOffset: 51,
        startLine: 1,
        endLine: 4,
        info: "ts"
      },
      {
        id: "paragraph:53-62",
        type: "paragraph",
        startOffset: 53,
        endOffset: 62,
        startLine: 6,
        endLine: 6
      }
    ]);

    expect(source.slice(result.blocks[0]!.startOffset, result.blocks[0]!.endOffset)).toBe(
      ["```ts", "const answer = 42;", "  console.log(answer);", "```"].join("\n")
    );
  });
});
