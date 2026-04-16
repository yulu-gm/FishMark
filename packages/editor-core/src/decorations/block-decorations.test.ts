import { describe, expect, it } from "vitest";

import { parseBlockMap } from "@yulora/markdown-engine";

import { createActiveBlockStateFromBlockMap } from "../active-block";
import {
  createBlockDecorations,
  getInactiveBlockquoteLines,
  getInactiveCodeFenceLines
} from "./index";

const collectDecorations = (source: string, decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"]) => {
  const ranges: Array<{ from: number; to: number; className: string; text: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    const className = typeof value.spec.attributes?.class === "string" ? value.spec.attributes.class : "";

    ranges.push({
      from,
      to,
      className,
      text: source.slice(from, to)
    });
  });

  return ranges;
};

describe("createBlockDecorations", () => {
  it("derives inactive block decorations and a stable signature for non-active top-level blocks", () => {
    const source = [
      "# Title",
      "",
      "- one",
      "- [x] done",
      "",
      "> quote",
      "> still quoted",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "---",
      "",
      "Paragraph"
    ].join("\n");
    const blockMap = parseBlockMap(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expect(result.signature).toBe(
      [
        "heading:heading:0-7:0:1",
        "list:list:9-25:9:false:list-item:9-14:0:none,list-item:15-25:0:true",
        "blockquote:blockquote:27-49:27:49",
        "codeFence:codeFence:51-79:ts",
        "thematicBreak:thematicBreak:81-84:-"
      ].join("|")
    );

    expect(ranges).toEqual([
      {
        from: 0,
        to: 0,
        className: "cm-inactive-heading cm-inactive-heading-depth-1",
        text: ""
      },
      {
        from: 0,
        to: 2,
        className: "cm-inactive-heading-marker",
        text: "# "
      },
      {
        from: 9,
        to: 9,
        className: "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0",
        text: ""
      },
      {
        from: 9,
        to: 10,
        className: "cm-inactive-list-marker",
        text: "-"
      },
      {
        from: 15,
        to: 15,
        className: "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0 cm-inactive-list-task cm-inactive-list-task-checked",
        text: ""
      },
      {
        from: 15,
        to: 16,
        className: "cm-inactive-list-marker",
        text: "-"
      },
      {
        from: 17,
        to: 20,
        className: "cm-inactive-task-marker cm-inactive-task-marker-checked",
        text: "[x]"
      },
      {
        from: 27,
        to: 27,
        className: "cm-inactive-blockquote cm-inactive-blockquote-start",
        text: ""
      },
      {
        from: 27,
        to: 29,
        className: "cm-inactive-blockquote-marker",
        text: "> "
      },
      {
        from: 35,
        to: 35,
        className: "cm-inactive-blockquote cm-inactive-blockquote-end",
        text: ""
      },
      {
        from: 35,
        to: 37,
        className: "cm-inactive-blockquote-marker",
        text: "> "
      },
      {
        from: 51,
        to: 51,
        className: "cm-inactive-code-block-fence",
        text: ""
      },
      {
        from: 51,
        to: 56,
        className: "cm-inactive-code-block-fence-marker",
        text: "```ts"
      },
      {
        from: 57,
        to: 57,
        className: "cm-inactive-code-block cm-inactive-code-block-start cm-inactive-code-block-end",
        text: ""
      },
      {
        from: 76,
        to: 76,
        className: "cm-inactive-code-block-fence",
        text: ""
      },
      {
        from: 76,
        to: 79,
        className: "cm-inactive-code-block-fence-marker",
        text: "```"
      },
      {
        from: 81,
        to: 81,
        className: "cm-inactive-thematic-break",
        text: ""
      },
      {
        from: 81,
        to: 84,
        className: "cm-inactive-thematic-break-marker",
        text: "---"
      }
    ]);
  });

  it("omits the active block only while the editor has focus", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const blockMap = parseBlockMap(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Title"),
      head: source.indexOf("Title")
    });

    const focusedResult = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const blurredResult = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: false,
      source
    });

    expect(collectDecorations(source, focusedResult.decorationSet)).toEqual([
      {
        from: 9,
        to: 9,
        className: "cm-inactive-paragraph cm-inactive-paragraph-leading",
        text: ""
      }
    ]);
    expect(collectDecorations(source, blurredResult.decorationSet)).toEqual([
      {
        from: 0,
        to: 0,
        className: "cm-inactive-heading cm-inactive-heading-depth-1",
        text: ""
      },
      {
        from: 0,
        to: 2,
        className: "cm-inactive-heading-marker",
        text: "# "
      },
      {
        from: 9,
        to: 9,
        className: "cm-inactive-paragraph cm-inactive-paragraph-leading",
        text: ""
      }
    ]);
  });
});

describe("block decoration line helpers", () => {
  it("returns blockquote line metadata with marker bounds and edge flags", () => {
    const source = ["> quote", "  > nested"].join("\n");

    expect(getInactiveBlockquoteLines(0, source.length, source)).toEqual([
      {
        lineStart: 0,
        markerEnd: 2,
        isFirstLine: true,
        isLastLine: false
      },
      {
        lineStart: 8,
        markerEnd: 12,
        isFirstLine: false,
        isLastLine: true
      }
    ]);
  });

  it("returns code fence line metadata for fences and content rows", () => {
    const source = ["```ts", "const answer = 42;", "```"].join("\n");

    expect(getInactiveCodeFenceLines(0, source.length, source)).toEqual([
      {
        lineStart: 0,
        lineEnd: 5,
        kind: "fence",
        isFirstContentLine: false,
        isLastContentLine: false
      },
      {
        lineStart: 6,
        lineEnd: 24,
        kind: "content",
        isFirstContentLine: true,
        isLastContentLine: true
      },
      {
        lineStart: 25,
        lineEnd: 28,
        kind: "fence",
        isFirstContentLine: false,
        isLastContentLine: false
      }
    ]);
  });
});
