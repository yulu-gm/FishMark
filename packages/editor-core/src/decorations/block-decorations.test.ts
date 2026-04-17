import { describe, expect, it } from "vitest";

import { parseBlockMap, parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromBlockMap } from "../active-block";
import { createBlockDecorations } from "./block-decorations";
import { getInactiveBlockquoteLines, getInactiveCodeFenceLines } from "./block-lines";

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

  return ranges.sort((left, right) => {
    if (left.from !== right.from) {
      return left.from - right.from;
    }

    if (left.to !== right.to) {
      return left.to - right.to;
    }

    if (left.className !== right.className) {
      return left.className.localeCompare(right.className);
    }

    return left.text.localeCompare(right.text);
  });
};

const createInactiveInlineDecorations = (source: string) => {
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: 0,
    head: 0
  });

  return collectDecorations(
    source,
    createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: false,
      source
    }).decorationSet
  );
};

const getCoveredClassesAtRange = (
  ranges: Array<{ from: number; to: number; className: string; text: string }>,
  from: number,
  to: number
) =>
  ranges
    .filter((range) => range.className.length > 0 && range.from <= from && range.to >= to)
    .map((range) => range.className)
    .sort();

const getExactClassesAtRange = (
  ranges: Array<{ from: number; to: number; className: string; text: string }>,
  from: number,
  to: number
) =>
  ranges
    .filter((range) => range.className.length > 0 && range.from === from && range.to === to)
    .map((range) => range.className)
    .sort();

const expectCoveredRangeClasses = (
  ranges: Array<{ from: number; to: number; className: string; text: string }>,
  from: number,
  to: number,
  expected: string[]
) => {
  expect(getCoveredClassesAtRange(ranges, from, to)).toEqual(expected);
};

const expectExactRangeClasses = (
  ranges: Array<{ from: number; to: number; className: string; text: string }>,
  from: number,
  to: number,
  expected: string[]
) => {
  expect(getExactClassesAtRange(ranges, from, to)).toEqual(expected);
};

describe("createBlockDecorations", () => {
  it("applies inline strong decorations to inactive paragraph content and hides bold markers", () => {
    const source = "**bold**";
    const ranges = createInactiveInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 2, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 2, 6, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(ranges, 6, 8, ["cm-inactive-inline-marker"]);
  });

  it("stacks strong and emphasis classes for triple-marker inline content", () => {
    const source = "***both***";
    const ranges = createInactiveInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 1, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 1, 3, ["cm-inactive-inline-emphasis", "cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 1, 9, ["cm-inactive-inline-emphasis"]);
    expectCoveredRangeClasses(ranges, 3, 7, [
      "cm-inactive-inline-emphasis",
      "cm-inactive-inline-strong"
    ]);
    expectCoveredRangeClasses(ranges, 7, 9, ["cm-inactive-inline-emphasis", "cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 9, 10, ["cm-inactive-inline-marker"]);
  });

  it("keeps nested strikethrough and strong decorations layered for inactive content", () => {
    const source = "~~**mix**~~";
    const ranges = createInactiveInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 2, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 2, 4, ["cm-inactive-inline-marker", "cm-inactive-inline-strikethrough"]);
    expectCoveredRangeClasses(ranges, 2, 9, ["cm-inactive-inline-strikethrough"]);
    expectCoveredRangeClasses(ranges, 4, 7, [
      "cm-inactive-inline-strikethrough",
      "cm-inactive-inline-strong"
    ]);
    expectCoveredRangeClasses(ranges, 7, 9, ["cm-inactive-inline-marker", "cm-inactive-inline-strikethrough"]);
    expectCoveredRangeClasses(ranges, 9, 11, ["cm-inactive-inline-marker"]);
  });

  it("hides code span markers and does not infer emphasis from code text", () => {
    const source = "`a * b`";
    const ranges = createInactiveInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 1, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 1, 6, ["cm-inactive-inline-code"]);
    expectCoveredRangeClasses(ranges, 6, 7, ["cm-inactive-inline-marker"]);
    expect(ranges.some((range) => range.className === "cm-inactive-inline-emphasis")).toBe(false);
  });

  it("recurses through link and image label or alt children without replacing their text", () => {
    const linkSource = "[**label**](https://example.com)";
    const linkRanges = createInactiveInlineDecorations(linkSource);
    const imageSource = "![alt *x*](./demo.png)";
    const imageRanges = createInactiveInlineDecorations(imageSource);

    expectExactRangeClasses(linkRanges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(linkRanges, 0, 1, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(linkRanges, 1, 3, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(linkRanges, 3, 8, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(linkRanges, 8, 10, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(linkRanges, 10, 11, ["cm-inactive-inline-marker"]);

    expectExactRangeClasses(imageRanges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(imageRanges, 1, 2, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(imageRanges, 6, 7, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(imageRanges, 7, 8, ["cm-inactive-inline-emphasis"]);
    expectCoveredRangeClasses(imageRanges, 8, 9, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(imageRanges, 9, 10, ["cm-inactive-inline-marker"]);
  });

  it("applies one CJK decoration for a contiguous Chinese text run", () => {
    const source = "你好世界";
    const ranges = createInactiveInlineDecorations(source);

    expectCoveredRangeClasses(ranges, 0, source.length, ["cm-yulora-cjk-font"]);
    expect(
      ranges.filter((range) => range.className === "cm-yulora-cjk-font")
    ).toHaveLength(1);
  });

  it("splits mixed Latin and CJK content into separate CJK ranges", () => {
    const source = "Hello 中文 world 测试";
    const ranges = createInactiveInlineDecorations(source);
    const cjkRanges = ranges.filter((range) => range.className === "cm-yulora-cjk-font");
    const firstStart = source.indexOf("中文");
    const secondStart = source.indexOf("测试");

    expect(cjkRanges).toEqual([
      {
        from: firstStart,
        to: firstStart + "中文".length,
        className: "cm-yulora-cjk-font",
        text: "中文"
      },
      {
        from: secondStart,
        to: secondStart + "测试".length,
        className: "cm-yulora-cjk-font",
        text: "测试"
      }
    ]);
  });

  it("skips CJK decorations inside inline code but keeps normal Chinese text decorated", () => {
    const source = "`中文` 普通";
    const ranges = createInactiveInlineDecorations(source);

    expect(
      ranges.some((range) => range.className === "cm-yulora-cjk-font" && range.text === "中文")
    ).toBe(false);
    expect(
      ranges.some((range) => range.className === "cm-yulora-cjk-font" && range.text === "普通")
    ).toBe(true);
  });

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

  it("applies CJK decorations inside the active paragraph block while focused", () => {
    const source = "中文 active";
    const activeState = createActiveBlockStateFromBlockMap(parseMarkdownDocument(source), {
      anchor: 0,
      head: 0
    });

    const ranges = collectDecorations(
      source,
      createBlockDecorations({
        activeBlockState: activeState,
        hasEditorFocus: true,
        source
      }).decorationSet
    );

    expect(
      ranges.some((range) => range.className === "cm-yulora-cjk-font" && range.text === "中文")
    ).toBe(true);
  });

  it("does not apply CJK decorations inside code fences", () => {
    const source = ["```txt", "中文", "```"].join("\n");
    const blockMap = parseBlockMap(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.length,
      head: source.length
    });

    const ranges = collectDecorations(
      source,
      createBlockDecorations({
        activeBlockState: activeState,
        hasEditorFocus: false,
        source
      }).decorationSet
    );

    expect(ranges.some((range) => range.className === "cm-yulora-cjk-font")).toBe(false);
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
