import { describe, expect, it } from "vitest";

import { formatTableMarkdown, parseBlockMap, parseMarkdownDocument } from "./index";
import type {
  BlockquoteBlock,
  HeadingBlock,
  HtmlImageBlock,
  InlineRoot,
  ListBlock,
  ListItemBlock
} from "./index";

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

    expect(result.blocks).toMatchObject([
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

    expect(result.blocks).toMatchObject([
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

  it("parses common pipe table variants into a top-level table block", () => {
    const source = ["name | qty", "--- | ---:", "pen | 2"].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toMatchObject([
      {
        id: `table:0-${source.length}`,
        type: "table",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: 3,
        columnCount: 2,
        alignments: ["left", "right"],
        header: [
          { text: "name" },
          { text: "qty" }
        ],
        rows: [[{ text: "pen" }, { text: "2" }]]
      }
    ]);
  });

  it("formats canonical table markdown with outer pipes and padded columns", () => {
    expect(
      formatTableMarkdown({
        alignments: ["left", "right"],
        header: ["name", "qty"],
        rows: [["pen", "2"]]
      })
    ).toBe(["| name | qty |", "| :--- | ---: |", "| pen  |   2 |"].join("\n"));
  });

  it("keeps inserted blank columns parseable by emitting minimum-width delimiters", () => {
    const source = formatTableMarkdown({
      hasHeader: true,
      rowSeparator: "compact",
      alignments: ["left", "left", "right"],
      header: ["name", "", "qty"],
      rows: [["pen", "", "2"]]
    });

    expect(source).toBe(
      ["| name |   | qty |", "| :--- | :--- | ---: |", "| pen  |   |   2 |"].join("\n")
    );
    expect(parseMarkdownDocument(source).blocks[0]?.type).toBe("table");
  });

  it("parses loose headerless pipe rows separated by blank lines into one table block", () => {
    const source = [
      "| 2026-04-19 | TASK-table-rendering | 通过 |",
      "",
      "| 2026-04-18 | TASK-041 | 通过 |"
    ].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toMatchObject([
      {
        id: `table:0-${source.length}`,
        type: "table",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: 3,
        columnCount: 3,
        hasHeader: false,
        rowSeparator: "loose",
        alignments: ["none", "none", "none"],
        header: [
          { text: "2026-04-19" },
          { text: "TASK-table-rendering" },
          { text: "通过" }
        ],
        rows: [[{ text: "2026-04-18" }, { text: "TASK-041" }, { text: "通过" }]]
      }
    ]);
  });

  it("parses contiguous loose headerless pipe rows within one paragraph into a table block", () => {
    const source = [
      "| 2026-04-17 | TASK-038 | 通过 |",
      "| 2026-04-18 | TASK-041 | 通过 |",
      "| 2026-04-19 | TASK-table-rendering | 通过 |"
    ].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toMatchObject([
      {
        id: `table:0-${source.length}`,
        type: "table",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: 3,
        columnCount: 3,
        hasHeader: false,
        rowSeparator: "compact",
        alignments: ["none", "none", "none"],
        header: [
          { text: "2026-04-17" },
          { text: "TASK-038" },
          { text: "通过" }
        ],
        rows: [
          [{ text: "2026-04-18" }, { text: "TASK-041" }, { text: "通过" }],
          [{ text: "2026-04-19" }, { text: "TASK-table-rendering" }, { text: "通过" }]
        ]
      }
    ]);
  });

  it("parses loose pipe rows whose code-span cells contain unescaped pipes", () => {
    const source = [
      '| 2026-04-15 | BOOTSTRAP-DOCS | `rg -n "^\\| (TASK-001|TASK-002) \\|" docs/progress.md` | 通过 | 第一条 |',
      "| 2026-04-19 | TASK-table-rendering | `npm.cmd run build` | 通过 | 第二条 |"
    ].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toMatchObject([
      {
        type: "table",
        startLine: 1,
        endLine: 2,
        hasHeader: false,
        columnCount: 5
      }
    ]);

    const tableBlock = result.blocks[0];
    expect(tableBlock?.type).toBe("table");
    if (tableBlock?.type !== "table") {
      throw new Error("expected table block");
    }
    expect(tableBlock.header.map((cell) => cell.text)).toEqual([
      "2026-04-15",
      "BOOTSTRAP-DOCS",
      '`rg -n "^| (TASK-001|TASK-002) |" docs/progress.md`',
      "通过",
      "第一条"
    ]);
  });

  it("keeps the trailing note cell when a loose row contains unmatched fence backticks in note text", () => {
    const source = [
      "| 2026-04-16 | TASK-033 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 补充孤立的 ``` 片段 |",
      "| 2026-04-16 | TASK-033 | `npm run build` | 通过 | 第二条 |"
    ].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toMatchObject([
      {
        type: "table",
        startLine: 1,
        endLine: 2,
        hasHeader: false,
        columnCount: 5
      }
    ]);

    const tableBlock = result.blocks[0];
    expect(tableBlock?.type).toBe("table");
    if (tableBlock?.type !== "table") {
      throw new Error("expected table block");
    }
    expect(tableBlock.header[4]?.text).toBe("补充孤立的 ``` 片段");
  });

  it("splits contiguous loose rows around a malformed pipe row instead of dropping the whole paragraph", () => {
    const source = [
      "| 2026-04-17 | TASK-038 | 通过 |",
      "| 2026-04-18 | TASK-041 | 通过 |",
      "| 2026-04-15 | BOOTSTRAP-DOCS | raw | extra | pipes | 通过 | 带额外 pipe 的命令 |",
      "| 2026-04-19 | TASK-table-rendering | 通过 |",
      "| 2026-04-20 | TASK-next | 通过 |"
    ].join("\n");

    const result = parseMarkdownDocument(source);

    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0]).toMatchObject({
      type: "table",
      startLine: 1,
      endLine: 2,
      hasHeader: false
    });
    expect(result.blocks[1]).toMatchObject({
      type: "paragraph",
      startLine: 3,
      endLine: 3
    });
    expect(result.blocks[2]).toMatchObject({
      type: "table",
      startLine: 4,
      endLine: 5,
      hasHeader: false
    });

    const firstTable = result.blocks[0];
    const secondTable = result.blocks[2];

    expect(firstTable?.type).toBe("table");
    expect(secondTable?.type).toBe("table");
    if (firstTable?.type !== "table" || secondTable?.type !== "table") {
      throw new Error("expected loose table blocks");
    }

    expect(firstTable.header.map((cell) => cell.text)).toEqual(["2026-04-17", "TASK-038", "通过"]);
    expect(firstTable.rows.map((row) => row.map((cell) => cell.text))).toEqual([["2026-04-18", "TASK-041", "通过"]]);

    expect(secondTable.header.map((cell) => cell.text)).toEqual(["2026-04-19", "TASK-table-rendering", "通过"]);
    expect(secondTable.rows.map((row) => row.map((cell) => cell.text))).toEqual([["2026-04-20", "TASK-next", "通过"]]);
  });

  it("formats loose headerless pipe rows without inserting a delimiter line", () => {
    expect(
      formatTableMarkdown({
        hasHeader: false,
        rowSeparator: "loose",
        alignments: ["none", "none", "none"],
        header: ["2026-04-19", "TASK-table-rendering", "通过"],
        rows: [["2026-04-18", "TASK-041", "通过"]]
      })
    ).toBe(
      [
        "| 2026-04-19 | TASK-table-rendering | 通过 |",
        "",
        "| 2026-04-18 | TASK-041             | 通过 |"
      ].join("\n")
    );
  });

  it("recognizes top-level HTML image flow blocks and preserves image attributes", () => {
    const source = '<img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" style="zoom:25%;" />';

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        id: `htmlImage:0-${source.length}`,
        type: "htmlImage",
        startOffset: 0,
        endOffset: source.length,
        startLine: 1,
        endLine: 1,
        src: "assets/branding/yulora_logo_light.svg",
        alt: "Yulora logo",
        width: null,
        height: null,
        zoom: "25%",
        align: null
      }
    ]);
  });

  it("keeps parseBlockMap as block-only parse without rich inline stitch fields", () => {
    const source = ["# **Title**", "", "- [x] done `code`", "", "> ~~quote~~"].join("\n");
    const result = parseBlockMap(source);

    const heading = result.blocks[0] as HeadingBlock;
    expect(heading.type).toBe("heading");
    expect(heading.markerEnd).toBeUndefined();
    expect(heading.inline).toBeUndefined();

    const list = result.blocks[1] as ListBlock;
    expect(list.type).toBe("list");
    const item = list.items[0] as ListItemBlock;
    expect(item.contentStartOffset).toBeUndefined();
    expect(item.contentEndOffset).toBeUndefined();
    expect(item.inline).toBeUndefined();

    const blockquote = result.blocks[2] as BlockquoteBlock;
    expect(blockquote.type).toBe("blockquote");
    expect(blockquote.lines).toBeUndefined();
  });

  it("returns no blocks for empty or whitespace-only input", () => {
    expect(parseBlockMap("").blocks).toEqual([]);
    expect(parseBlockMap("\n  \n\t").blocks).toEqual([]);
  });

  it("does not emit nested paragraph blocks from lists or blockquotes", () => {
    const source = ["- item", "  still item", "", "> quote", "> more"].join("\n");

    expect(parseBlockMap(source).blocks).toMatchObject([
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

    expect(result.blocks).toMatchObject([
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
            id: "list-item:0-18",
            startOffset: 0,
            endOffset: 18,
            startLine: 1,
            endLine: 2,
            indent: 0,
            marker: "-",
            markerStart: 0,
            markerEnd: 1,
            task: null,
            children: [
              {
                id: "list:6-18",
                type: "list",
                startOffset: 6,
                endOffset: 18,
                startLine: 2,
                endLine: 2,
                ordered: false,
                items: [
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
                    },
                    children: []
                  }
                ]
              }
            ]
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
        startOrdinal: 1,
        delimiter: ".",
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
            task: null,
            children: []
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
            },
            children: []
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

    expect(result.blocks).toMatchObject([
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

  it("captures thematic breaks for both CommonMark dashes and Yulora plus separators", () => {
    const source = ["Paragraph", "", "---", "", "+++", "", "After"].join("\n");
    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        id: "paragraph:0-9",
        type: "paragraph",
        startOffset: 0,
        endOffset: 9,
        startLine: 1,
        endLine: 1
      },
      {
        id: "thematicBreak:11-14",
        type: "thematicBreak",
        startOffset: 11,
        endOffset: 14,
        startLine: 3,
        endLine: 3,
        marker: "-"
      },
      {
        id: "thematicBreak:16-19",
        type: "thematicBreak",
        startOffset: 16,
        endOffset: 19,
        startLine: 5,
        endLine: 5,
        marker: "+"
      },
      {
        id: "paragraph:21-26",
        type: "paragraph",
        startOffset: 21,
        endOffset: 26,
        startLine: 7,
        endLine: 7
      }
    ]);
  });

  it("splits compact plus separators into thematic breaks even when they touch adjacent text", () => {
    const source = ["+++", "sep", "+++"].join("\n");
    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        id: "thematicBreak:0-3",
        type: "thematicBreak",
        startOffset: 0,
        endOffset: 3,
        startLine: 1,
        endLine: 1,
        marker: "+"
      },
      {
        id: "paragraph:4-7",
        type: "paragraph",
        startOffset: 4,
        endOffset: 7,
        startLine: 2,
        endLine: 2
      },
      {
        id: "thematicBreak:8-11",
        type: "thematicBreak",
        startOffset: 8,
        endOffset: 11,
        startLine: 3,
        endLine: 3,
        marker: "+"
      }
    ]);
  });

  it("keeps a leading plus separator when a trailing single dash would otherwise form a setext heading", () => {
    const source = ["+++", "sep", "-"].join("\n");
    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        id: "thematicBreak:0-3",
        type: "thematicBreak",
        startOffset: 0,
        endOffset: 3,
        startLine: 1,
        endLine: 1,
        marker: "+"
      },
      {
        id: "paragraph:4-9",
        type: "paragraph",
        startOffset: 4,
        endOffset: 9,
        startLine: 2,
        endLine: 3
      }
    ]);
  });

  it("treats the closing frontmatter-style dash fence as a thematic break instead of a setext underline", () => {
    const source = [
      "---",
      "name: yulora-task-intake",
      "description: skill metadata",
      "---",
      "",
      "# Heading"
    ].join("\n");
    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        id: "thematicBreak:0-3",
        type: "thematicBreak",
        startOffset: 0,
        endOffset: 3,
        startLine: 1,
        endLine: 1,
        marker: "-"
      },
      {
        id: "paragraph:4-56",
        type: "paragraph",
        startOffset: 4,
        endOffset: 56,
        startLine: 2,
        endLine: 3
      },
      {
        id: "thematicBreak:57-60",
        type: "thematicBreak",
        startOffset: 57,
        endOffset: 60,
        startLine: 4,
        endLine: 4,
        marker: "-"
      },
      {
        id: "heading:62-71",
        type: "heading",
        startOffset: 62,
        endOffset: 71,
        startLine: 6,
        endLine: 6,
        depth: 1
      }
    ]);
  });

  it("stitches heading inline AST with markerEnd and nested marks", () => {
    const source = "# **Bold *mix***";
    const result = parseMarkdownDocument(source);

    const heading = result.blocks[0] as HeadingBlock;
    expect(heading.type).toBe("heading");
    expect(heading.markerEnd).toBe(2);
    expect(heading.inline).toMatchObject({
      type: "root",
      startOffset: 2,
      endOffset: source.length
    } satisfies Partial<InlineRoot>);
    expect(heading.inline?.children).toMatchObject([
      {
        type: "strong",
        children: [
          { type: "text", value: "Bold " },
          {
            type: "emphasis",
            children: [{ type: "text", value: "mix" }]
          }
        ]
      }
    ]);
  });

  it("preserves the starting ordinal of an ordered list block", () => {
    const source = ["5. first", "6. second"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        type: "list",
        ordered: true,
        startOrdinal: 5,
        delimiter: ".",
        items: [
          {
            marker: "5.",
            markerStart: 0,
            markerEnd: 2
          },
          {
            marker: "6.",
            markerStart: 9,
            markerEnd: 11
          }
        ]
      }
    ]);
  });

  it("preserves the ordered-list delimiter on parenthesized list blocks", () => {
    const source = ["5) first", "6) second"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        type: "list",
        ordered: true,
        startOrdinal: 5,
        delimiter: ")",
        items: [
          {
            marker: "5)",
            markerStart: 0,
            markerEnd: 2
          },
          {
            marker: "6)",
            markerStart: 9,
            markerEnd: 11
          }
        ]
      }
    ]);
  });

  it("exposes nested ordered list scopes as children on list items", () => {
    const source = ["5. parent", "  3) nested one", "  4) nested two", "6. sibling"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        type: "list",
        ordered: true,
        startOrdinal: 5,
        delimiter: ".",
        items: [
          {
            marker: "5.",
            children: [
              {
                type: "list",
                ordered: true,
                startOrdinal: 3,
                delimiter: ")",
                items: [
                  {
                    marker: "3)"
                  },
                  {
                    marker: "4)"
                  }
                ]
              }
            ]
          },
          {
            marker: "6."
          }
        ]
      }
    ]);
  });

  it("splits top-level ordered lists when the delimiter changes mid-run", () => {
    const source = ["1. one", "2. two", "1) three", "2) four"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        type: "list",
        startOffset: 0,
        endOffset: 13,
        ordered: true,
        startOrdinal: 1,
        delimiter: ".",
        items: [{ marker: "1." }, { marker: "2." }]
      },
      {
        type: "list",
        startOffset: 14,
        endOffset: source.length,
        ordered: true,
        startOrdinal: 1,
        delimiter: ")",
        items: [{ marker: "1)" }, { marker: "2)" }]
      }
    ]);
  });

  it("splits blank-line-separated ordered runs into independent scopes that restart from one", () => {
    const source = ["1. one", "2. two", "", "3. three", "4. four"].join("\n");

    const result = parseBlockMap(source);

    expect(result.blocks).toMatchObject([
      {
        type: "list",
        startOffset: 0,
        endOffset: 13,
        ordered: true,
        startOrdinal: 1,
        delimiter: ".",
        items: [{ marker: "1." }, { marker: "2." }]
      },
      {
        type: "list",
        startOffset: 15,
        endOffset: source.length,
        ordered: true,
        startOrdinal: 1,
        delimiter: ".",
        items: [{ marker: "3." }, { marker: "4." }]
      }
    ]);
  });

  it("stitches task list item content range and inline code AST on item level", () => {
    const source = "- [x] done `code`";
    const result = parseMarkdownDocument(source);

    const listBlock = result.blocks[0] as ListBlock;
    expect(listBlock.type).toBe("list");
    expect("inline" in listBlock).toBe(false);

    const item = listBlock.items[0] as ListItemBlock;
    expect(item.contentStartOffset).toBe(6);
    expect(item.contentEndOffset).toBe(source.length);
    expect(item.inline).toMatchObject({
      type: "root",
      startOffset: 6,
      endOffset: source.length,
      children: [
        { type: "text", value: "done " },
        { type: "codeSpan", text: "code" }
      ]
    });
  });

  it("stitches multi-line blockquote line ranges and inline AST", () => {
    const source = ["> **alpha**", "> `beta` and ~~gamma~~"].join("\n");
    const result = parseMarkdownDocument(source);

    const blockquote = result.blocks[0] as BlockquoteBlock;
    expect(blockquote.type).toBe("blockquote");
    expect(blockquote.lines).toHaveLength(2);
    expect(blockquote.lines?.[0]).toMatchObject({
      markerEnd: 1,
      contentStartOffset: 2,
      contentEndOffset: 11,
      inline: {
        type: "root",
        startOffset: 2,
        endOffset: 11,
        children: [{ type: "strong" }]
      }
    });
    expect(blockquote.lines?.[1]).toMatchObject({
      markerEnd: 13,
      contentStartOffset: 14,
      contentEndOffset: source.length,
      inline: {
        type: "root",
        startOffset: 14,
        endOffset: source.length,
        children: [
          { type: "codeSpan", text: "beta" },
          { type: "text", value: " and " },
          { type: "strikethrough" }
        ]
      }
    });
  });

  it("keeps wrapped HTML image blocks rich under MarkdownDocument parsing", () => {
    const source = [
      '<p align="center">',
      '  <img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" width="160">',
      "</p>"
    ].join("\n");
    const result = parseMarkdownDocument(source);

    const htmlImage = result.blocks[0] as HtmlImageBlock;

    expect(htmlImage).toMatchObject({
      type: "htmlImage",
      src: "assets/branding/yulora_logo_light.svg",
      alt: "Yulora logo",
      width: "160",
      height: null,
      zoom: null,
      align: "center"
    });
  });

  it("keeps absolute offsets correct on CRLF source", () => {
    const source = "# title\r\n\r\n- [ ] item `code`\r\n> **quote**\r\n> line";
    const result = parseMarkdownDocument(source);

    const heading = result.blocks[0] as HeadingBlock;
    expect(heading.inline).toMatchObject({
      startOffset: 2,
      endOffset: 7,
      children: [{ type: "text", value: "title" }]
    });

    const list = result.blocks[1] as ListBlock;
    const item = list.items[0] as ListItemBlock;
    expect(item.contentStartOffset).toBe(17);
    expect(item.contentEndOffset).toBe(28);
    expect(item.inline).toMatchObject({
      startOffset: 17,
      endOffset: 28,
      children: [
        { type: "text", value: "item " },
        { type: "codeSpan", text: "code" }
      ]
    });

    const blockquote = result.blocks[2] as BlockquoteBlock;
    expect(blockquote.lines?.[0]).toMatchObject({
      markerEnd: 31,
      contentStartOffset: 32,
      contentEndOffset: 41,
      inline: {
        startOffset: 32,
        endOffset: 41,
        children: [{ type: "strong" }]
      }
    });
    expect(blockquote.lines?.[1]).toMatchObject({
      markerEnd: 44,
      contentStartOffset: 45,
      contentEndOffset: 49,
      inline: {
        startOffset: 45,
        endOffset: 49,
        children: [{ type: "text", value: "line" }]
      }
    });
  });

  it("keeps parseBlockMap lean while parseMarkdownDocument remains rich", () => {
    const source = ["# **title**", "", "- [x] item `code`", "", "> **quote**"].join("\n");
    const blockMap = parseBlockMap(source);
    const document = parseMarkdownDocument(source);

    const leanHeading = blockMap.blocks[0] as HeadingBlock;
    const richHeading = document.blocks[0] as HeadingBlock;
    expect(leanHeading.inline).toBeUndefined();
    expect(leanHeading.markerEnd).toBeUndefined();
    expect(richHeading.inline?.children[0]).toMatchObject({ type: "strong" });
    expect(richHeading.markerEnd).toBe(2);

    const leanList = blockMap.blocks[1] as ListBlock;
    const richList = document.blocks[1] as ListBlock;
    expect(leanList.items[0]?.inline).toBeUndefined();
    expect(leanList.items[0]?.contentStartOffset).toBeUndefined();
    expect(richList.items[0]?.inline?.children[1]).toMatchObject({ type: "codeSpan", text: "code" });
    expect(richList.items[0]?.contentStartOffset).toBeGreaterThan(leanList.items[0]!.markerEnd);

    const leanBlockquote = blockMap.blocks[2] as BlockquoteBlock;
    const richBlockquote = document.blocks[2] as BlockquoteBlock;
    expect(leanBlockquote.lines).toBeUndefined();
    expect(richBlockquote.lines?.[0]?.inline.children[0]).toMatchObject({ type: "strong" });
  });

  it("retains top-level block offsets under MarkdownDocument parsing", () => {
    const source = ["# title", "", "paragraph"].join("\n");
    const result = parseMarkdownDocument(source);

    const baseline = parseBlockMap(source);

    expect(result.blocks[0]).toMatchObject({
      id: baseline.blocks[0]!.id,
      startOffset: baseline.blocks[0]!.startOffset,
      endOffset: baseline.blocks[0]!.endOffset
    });
  });
});
