import { describe, expect, it } from "vitest";

import { parseBlockMap, parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromBlockMap } from "../active-block";
import { createEditorDerivedState } from "../derived-state/editor-derived-state";
import { createBlockDecorations } from "./block-decorations";
import { getInactiveBlockquoteLines, getInactiveCodeFenceLines } from "./block-lines";

const collectDecorations = (source: string, decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"]) => {
  const ranges: Array<{ from: number; to: number; className: string; text: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    if (value.spec.widget) {
      return;
    }

    const className = typeof value.spec.attributes?.class === "string" ? value.spec.attributes.class : "";
    const directMarkClass = typeof value.spec.class === "string" ? value.spec.class : "";

    if (className.includes("cm-fm-line")) {
      return;
    }

    // Skip syntax-highlight mark decorations (they set `class` directly on the spec
    // rather than on `attributes`, and would otherwise add language-parser-specific
    // entries that would make these structural assertions fragile).
    if (!className && directMarkClass) {
      return;
    }

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

const collectWidgets = (source: string, decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"]) => {
  const widgets: Array<{ from: number; to: number; name: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    if (value.spec.widget) {
      widgets.push({
        from,
        to,
        name: value.spec.widget.constructor.name
      });
    }
  });

  return widgets;
};

const collectBlockReplacements = (
  source: string,
  decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"]
) => {
  const replacements: Array<{ from: number; to: number; text: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    if (value.spec.block === true && !value.spec.widget) {
      replacements.push({ from, to, text: source.slice(from, to) });
    }
  });

  return replacements;
};

const collectPhysicalLineDecorations = (
  source: string,
  decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"]
) => {
  const ranges: Array<{ from: number; to: number; className: string; text: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    const className = typeof value.spec.attributes?.class === "string" ? value.spec.attributes.class : "";

    if (!className.includes("cm-fm-line")) {
      return;
    }

    ranges.push({
      from,
      to,
      className,
      text: source.slice(from, to)
    });
  });

  return ranges;
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

const createActiveParagraphInlineDecorations = (source: string) => {
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: 0,
    head: 0
  });

  return collectDecorations(
    source,
    createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    }).decorationSet
  );
};

const createDecorationsForSelection = (
  source: string,
  selection: { anchor: number; head: number },
  hasEditorFocus: boolean
) => {
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, selection);

  return collectDecorations(
    source,
    createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus,
      source
    }).decorationSet
  );
};

const createPhysicalDecorationsForSelection = (
  source: string,
  selection: { anchor: number; head: number },
  hasEditorFocus: boolean
) => {
  const editorDerivedState = createEditorDerivedState({
    source,
    selection,
    parseMarkdownDocument
  });

  return collectPhysicalLineDecorations(
    source,
    createBlockDecorations({
      activeBlockState: editorDerivedState.activeBlockState,
      activeLine: editorDerivedState.activeLine,
      editingDocument: editorDerivedState.editingDocument,
      hasEditorFocus,
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

const getLineDecorationStyleAt = (
  source: string,
  decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"],
  offset: number
) => {
  let style = "";

  decorationSet.between(0, source.length, (from, to, value) => {
    if (from !== offset || to !== offset) {
      return;
    }

    const className = typeof value.spec.attributes?.class === "string" ? value.spec.attributes.class : "";
    if (!className.includes("-list")) {
      return;
    }

    style = typeof value.spec.attributes?.style === "string" ? value.spec.attributes.style : "";
  });

  return style;
};

describe("createBlockDecorations", () => {
  it("replaces table markdown blocks with a dedicated table widget decoration", () => {
    const source = ["| name | qty |", "| --- | ---: |", "| pen | 2 |"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("pen"),
      head: source.indexOf("pen")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    const widgets: string[] = [];

    result.decorationSet.between(0, source.length, (_from, _to, value) => {
      if (value.spec.widget) {
        widgets.push(value.spec.widget.constructor.name);
      }
    });

    expect(result.signature).toContain("table:");
    expect(widgets).toContain("TableWidget");
  });

  it("applies inline strong decorations to inactive paragraph content and hides bold markers", () => {
    const source = "**bold**";
    const ranges = createInactiveInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 2, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(ranges, 2, 6, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(ranges, 6, 8, ["cm-inactive-inline-marker"]);
  });

  it("renders inline hard breaks as inactive inline widgets", () => {
    const source = "Alpha<br>Beta";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: 0,
      head: 0
    });
    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: false,
      source
    });

    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: "Alpha".length,
      to: "Alpha<br>".length,
      name: "HardBreakWidget"
    });
  });

  it("keeps inline hard break source visible and inserts a visual break in active paragraphs", () => {
    const source = "Alpha<br>Beta";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("<br>"),
      head: source.indexOf("<br>")
    });
    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: "Alpha<br>".length,
      to: "Alpha<br>".length,
      name: "HardBreakWidget"
    });
  });

  it("marks structural blank lines as inactive reading blanks", () => {
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const ranges = createDecorationsForSelection(source, { anchor: 0, head: 0 }, false);

    expectExactRangeClasses(ranges, source.indexOf("\n\n") + 1, source.indexOf("\n\n") + 1, [
      "cm-inactive-blank-line"
    ]);
  });

  it("keeps extra blank lines visible when a block gap contains more than one blank row", () => {
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");
    const firstBlankLineStart = source.indexOf("\n\n\n") + 1;
    const extraBlankLineStart = firstBlankLineStart + 1;
    const ranges = createDecorationsForSelection(source, { anchor: 0, head: 0 }, false);

    expectExactRangeClasses(ranges, firstBlankLineStart, firstBlankLineStart, [
      "cm-inactive-blank-line"
    ]);
    expectExactRangeClasses(ranges, extraBlankLineStart, extraBlankLineStart, []);
  });

  it("marks only the structural blank row as inactive when the document uses CRLF", () => {
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\r\n");
    const ranges = createDecorationsForSelection(source, { anchor: 0, head: 0 }, false);
    const firstLineCarriageReturn = source.indexOf("\r\n");
    const blankLineStart = source.indexOf("\r\n\r\n\r\n") + "\r\n".length;
    const extraBlankLineStart = blankLineStart + "\r\n".length;

    expectExactRangeClasses(ranges, firstLineCarriageReturn, firstLineCarriageReturn, []);
    expectExactRangeClasses(ranges, blankLineStart, blankLineStart, [
      "cm-inactive-blank-line"
    ]);
    expectExactRangeClasses(ranges, extraBlankLineStart, extraBlankLineStart, []);
  });

  it("keeps the active structural blank line visible while editing", () => {
    const source = ["Paragraph one", "", "Paragraph two"].join("\n");
    const blankLineStart = source.indexOf("\n\n") + 1;
    const ranges = createDecorationsForSelection(
      source,
      { anchor: blankLineStart, head: blankLineStart },
      true
    );

    expectExactRangeClasses(ranges, blankLineStart, blankLineStart, []);
  });

  it("keeps the focused indentation-only line visible after an empty nested list marker is removed", () => {
    const source = ["- parent", "  - child", "    - grandchild", "    "].join("\n");
    const indentationOnlyLineStart = source.lastIndexOf("\n") + 1;
    const ranges = createDecorationsForSelection(
      source,
      { anchor: source.length, head: source.length },
      true
    );

    expectExactRangeClasses(ranges, indentationOnlyLineStart, indentationOnlyLineStart, []);
  });

  it("adds physical line classes to an active empty document without a semantic block", () => {
    const source = "";
    const ranges = createPhysicalDecorationsForSelection(source, { anchor: 0, head: 0 }, true);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-active",
      "cm-fm-line-empty",
      "cm-fm-line-extra-blank"
    ].sort());
  });

  it("keeps an active whitespace-only physical line editable instead of collapsed", () => {
    const source = ["Paragraph one", "   ", "Paragraph two"].join("\n");
    const whitespaceLineStart = source.indexOf("   ");
    const physicalRanges = createPhysicalDecorationsForSelection(
      source,
      { anchor: whitespaceLineStart + 1, head: whitespaceLineStart + 1 },
      true
    );
    const blockRanges = createDecorationsForSelection(
      source,
      { anchor: whitespaceLineStart + 1, head: whitespaceLineStart + 1 },
      true
    );

    expectExactRangeClasses(blockRanges, whitespaceLineStart, whitespaceLineStart, []);
    expect(physicalRanges.find((range) => range.from === whitespaceLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-active",
      "cm-fm-line-extra-blank",
      "cm-fm-line-whitespace"
    ].sort());
  });

  it("keeps an inactive whitespace-only physical line visible instead of collapsed", () => {
    const source = ["Paragraph one", "   ", "Paragraph two"].join("\n");
    const whitespaceLineStart = source.indexOf("   ");
    const paragraphTwoStart = source.indexOf("Paragraph two");
    const blockRanges = createDecorationsForSelection(
      source,
      { anchor: paragraphTwoStart, head: paragraphTwoStart },
      false
    );
    const physicalRanges = createPhysicalDecorationsForSelection(
      source,
      { anchor: paragraphTwoStart, head: paragraphTwoStart },
      false
    );

    expectExactRangeClasses(blockRanges, whitespaceLineStart, whitespaceLineStart, []);
    expect(physicalRanges.find((range) => range.from === whitespaceLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-extra-blank",
      "cm-fm-line-whitespace"
    ].sort());
  });

  it("hides Typora separator rows between repeated empty paragraphs after a whitespace-only line", () => {
    const source = "   \n\n\n\n";
    const firstSeparatorLineStart = source.indexOf("\n") + 1;
    const firstVisibleEmptyLineStart = firstSeparatorLineStart + 1;
    const secondSeparatorLineStart = firstVisibleEmptyLineStart + 1;
    const finalEmptyLineStart = source.length;
    const blockRanges = createDecorationsForSelection(
      source,
      { anchor: finalEmptyLineStart, head: finalEmptyLineStart },
      true
    );
    const physicalRanges = createPhysicalDecorationsForSelection(
      source,
      { anchor: finalEmptyLineStart, head: finalEmptyLineStart },
      true
    );

    expectExactRangeClasses(blockRanges, firstSeparatorLineStart, firstSeparatorLineStart, [
      "cm-inactive-blank-line"
    ]);
    expectExactRangeClasses(blockRanges, firstVisibleEmptyLineStart, firstVisibleEmptyLineStart, []);
    expectExactRangeClasses(blockRanges, secondSeparatorLineStart, secondSeparatorLineStart, [
      "cm-inactive-blank-line"
    ]);
    expect(physicalRanges.find((range) => range.from === firstSeparatorLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-empty",
      "cm-fm-line-extra-blank"
    ].sort());
    expect(physicalRanges.find((range) => range.from === firstVisibleEmptyLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-empty",
      "cm-fm-line-extra-blank"
    ].sort());
    expect(physicalRanges.find((range) => range.from === secondSeparatorLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-empty",
      "cm-fm-line-extra-blank"
    ].sort());
    expect(physicalRanges.find((range) => range.from === finalEmptyLineStart)?.className.split(" ").sort()).toEqual([
      "cm-fm-line",
      "cm-fm-line-active",
      "cm-fm-line-empty",
      "cm-fm-line-extra-blank"
    ].sort());
  });

  it("hides the leading structural separator above a table without collapsing visible blanks", () => {
    const source = ["+++", "", "", "", "", "| a | b |", "| - | - |"].join("\n");
    const firstSeparatorLineStart = "+++\n".length;
    const firstVisibleEmptyLineStart = firstSeparatorLineStart + 1;
    const secondSeparatorLineStart = firstVisibleEmptyLineStart + 1;
    const tableLeadingSeparatorLineStart = secondSeparatorLineStart + 1;
    const blockRanges = createDecorationsForSelection(
      source,
      { anchor: source.indexOf("| a"), head: source.indexOf("| a") },
      false
    );

    expectExactRangeClasses(blockRanges, firstSeparatorLineStart, firstSeparatorLineStart, [
      "cm-inactive-blank-line"
    ]);
    expectExactRangeClasses(blockRanges, firstVisibleEmptyLineStart, firstVisibleEmptyLineStart, []);
    expectExactRangeClasses(blockRanges, secondSeparatorLineStart, secondSeparatorLineStart, [
      "cm-inactive-blank-line"
    ]);
    expectExactRangeClasses(blockRanges, tableLeadingSeparatorLineStart, tableLeadingSeparatorLineStart, [
      "cm-inactive-blank-line"
    ]);
  });

  it("adds physical text, structural separator, and extra blank classes to every source line", () => {
    const source = ["Paragraph one", "", "", "Paragraph two"].join("\n");
    const structuralBlankLineStart = source.indexOf("\n\n\n") + 1;
    const extraBlankLineStart = structuralBlankLineStart + 1;
    const secondParagraphStart = source.indexOf("Paragraph two");
    const ranges = createPhysicalDecorationsForSelection(
      source,
      { anchor: secondParagraphStart, head: secondParagraphStart },
      false
    );

    expect(ranges.map((range) => ({ from: range.from, className: range.className }))).toEqual([
      {
        from: 0,
        className: "cm-fm-line cm-fm-line-text"
      },
      {
        from: structuralBlankLineStart,
        className: "cm-fm-line cm-fm-line-empty cm-fm-line-structural-separator"
      },
      {
        from: extraBlankLineStart,
        className: "cm-fm-line cm-fm-line-empty cm-fm-line-extra-blank"
      },
      {
        from: secondParagraphStart,
        className: "cm-fm-line cm-fm-line-text"
      }
    ]);
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

  it("keeps active inline markers visible while preserving styled content", () => {
    const source = "**bold** `code`";
    const ranges = createActiveParagraphInlineDecorations(source);
    const codeStart = source.indexOf("`code`");

    expectExactRangeClasses(ranges, 0, 0, ["cm-active-paragraph cm-active-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 2, 6, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(ranges, 0, 2, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, 6, 8, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, codeStart, codeStart + 1, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, codeStart + 1, codeStart + 5, ["cm-inactive-inline-code"]);
    expectCoveredRangeClasses(ranges, codeStart + 5, codeStart + 6, ["cm-active-inline-marker"]);
    expect(ranges.some((range) => range.className === "cm-inactive-inline-marker")).toBe(false);
  });

  it("uses active inline decorations inside active list item content", () => {
    const source = "- **bold** *it* ~~del~~ `code`";
    const ranges = createDecorationsForSelection(
      source,
      { anchor: source.indexOf("bold"), head: source.indexOf("bold") },
      true
    );
    const boldStart = source.indexOf("**bold**");
    const emphasisStart = source.indexOf("*it*");
    const delStart = source.indexOf("~~del~~");
    const codeStart = source.indexOf("`code`");

    expectExactRangeClasses(ranges, 0, 0, ["cm-active-list cm-active-list-unordered cm-active-list-depth-0"]);
    expectCoveredRangeClasses(ranges, boldStart, boldStart + 2, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, boldStart + 2, boldStart + 6, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(ranges, boldStart + 6, boldStart + 8, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, emphasisStart, emphasisStart + 1, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, emphasisStart + 1, emphasisStart + 3, ["cm-inactive-inline-emphasis"]);
    expectCoveredRangeClasses(ranges, emphasisStart + 3, emphasisStart + 4, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, delStart, delStart + 2, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, delStart + 2, delStart + 5, ["cm-inactive-inline-strikethrough"]);
    expectCoveredRangeClasses(ranges, delStart + 5, delStart + 7, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, codeStart, codeStart + 1, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, codeStart + 1, codeStart + 5, ["cm-inactive-inline-code"]);
    expectCoveredRangeClasses(ranges, codeStart + 5, codeStart + 6, ["cm-active-inline-marker"]);
    expect(ranges.some((range) => range.className === "cm-inactive-inline-marker")).toBe(false);
  });

  it("uses active inline decorations inside active list continuation content", () => {
    const source = ["- item", "  continuation **bold**"].join("\n");
    const boldStart = source.indexOf("**bold**");
    const ranges = createDecorationsForSelection(
      source,
      { anchor: boldStart + 2, head: boldStart + 2 },
      true
    );

    expectCoveredRangeClasses(ranges, boldStart, boldStart + 2, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, boldStart + 2, boldStart + 6, ["cm-inactive-inline-strong"]);
    expectCoveredRangeClasses(ranges, boldStart + 6, boldStart + 8, ["cm-active-inline-marker"]);
    expect(ranges.some((range) => range.className === "cm-inactive-inline-marker")).toBe(false);
  });

  it("layers active inline marker visibility with nested strong and emphasis styling", () => {
    const source = "***both***";
    const ranges = createActiveParagraphInlineDecorations(source);

    expectExactRangeClasses(ranges, 0, 0, ["cm-active-paragraph cm-active-paragraph-leading"]);
    expectCoveredRangeClasses(ranges, 0, 1, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, 1, 3, ["cm-active-inline-marker", "cm-inactive-inline-emphasis"]);
    expectCoveredRangeClasses(ranges, 3, 7, [
      "cm-inactive-inline-emphasis",
      "cm-inactive-inline-strong"
    ]);
    expectCoveredRangeClasses(ranges, 7, 9, ["cm-active-inline-marker", "cm-inactive-inline-emphasis"]);
    expectCoveredRangeClasses(ranges, 9, 10, ["cm-active-inline-marker"]);
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

  it("renders inactive links as readable labels while hiding destination syntax", () => {
    const linkSource = "[**label**](https://example.com)";
    const linkRanges = createInactiveInlineDecorations(linkSource);
    const imageSource = "![alt *x*](./demo.png)";
    const imageRanges = createInactiveInlineDecorations(imageSource);

    expectExactRangeClasses(linkRanges, 0, 0, ["cm-inactive-paragraph cm-inactive-paragraph-leading"]);
    expectCoveredRangeClasses(linkRanges, 0, 1, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(linkRanges, 1, 3, [
      "cm-inactive-inline-link",
      "cm-inactive-inline-marker"
    ]);
    expectCoveredRangeClasses(linkRanges, 3, 8, [
      "cm-inactive-inline-link",
      "cm-inactive-inline-strong"
    ]);
    expectCoveredRangeClasses(linkRanges, 8, 10, [
      "cm-inactive-inline-link",
      "cm-inactive-inline-marker"
    ]);
    expectCoveredRangeClasses(linkRanges, 10, linkSource.length, ["cm-inactive-inline-marker"]);
    expectCoveredRangeClasses(linkRanges, 12, 31, ["cm-inactive-inline-marker"]);

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

    expectCoveredRangeClasses(ranges, 0, source.length, ["cm-fishmark-cjk-font"]);
    expect(
      ranges.filter((range) => range.className === "cm-fishmark-cjk-font")
    ).toHaveLength(1);
  });

  it("splits mixed Latin and CJK content into separate CJK ranges", () => {
    const source = "Hello 中文 world 测试";
    const ranges = createInactiveInlineDecorations(source);
    const cjkRanges = ranges.filter((range) => range.className === "cm-fishmark-cjk-font");
    const firstStart = source.indexOf("中文");
    const secondStart = source.indexOf("测试");

    expect(cjkRanges).toEqual([
      {
        from: firstStart,
        to: firstStart + "中文".length,
        className: "cm-fishmark-cjk-font",
        text: "中文"
      },
      {
        from: secondStart,
        to: secondStart + "测试".length,
        className: "cm-fishmark-cjk-font",
        text: "测试"
      }
    ]);
  });

  it("skips CJK decorations inside inline code but keeps normal Chinese text decorated", () => {
    const source = "`中文` 普通";
    const ranges = createInactiveInlineDecorations(source);

    expect(
      ranges.some((range) => range.className === "cm-fishmark-cjk-font" && range.text === "中文")
    ).toBe(false);
    expect(
      ranges.some((range) => range.className === "cm-fishmark-cjk-font" && range.text === "普通")
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
        "view-mode:wysiwym:active:paragraph:86-95:blank-line:86:physical-line:15:86:95:text",
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
        from: 8,
        to: 8,
        className: "cm-inactive-blank-line",
        text: ""
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
        from: 10,
        to: 11,
        className: "cm-inactive-list-source-prefix",
        text: " "
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
        from: 16,
        to: 17,
        className: "cm-inactive-list-source-prefix",
        text: " "
      },
      {
        from: 20,
        to: 21,
        className: "cm-inactive-list-source-prefix",
        text: " "
      },
      {
        from: 26,
        to: 26,
        className: "cm-inactive-blank-line",
        text: ""
      },
      {
        from: 27,
        to: 27,
        className: "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start",
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
        className: "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-end",
        text: ""
      },
      {
        from: 35,
        to: 37,
        className: "cm-inactive-blockquote-marker",
        text: "> "
      },
      {
        from: 50,
        to: 50,
        className: "cm-inactive-blank-line",
        text: ""
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
        from: 80,
        to: 80,
        className: "cm-inactive-blank-line",
        text: ""
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
      },
      {
        from: 85,
        to: 85,
        className: "cm-inactive-blank-line",
        text: ""
      },
      {
        from: 86,
        to: 86,
        className: "cm-active-paragraph cm-active-paragraph-leading",
        text: ""
      }
    ]);
    expect(collectWidgets(source, result.decorationSet)).toEqual([
      { from: 17, to: 20, name: "TaskMarkerWidget" }
    ]);
  });

  it("source mode keeps raw Markdown visible by omitting preview decorations and widgets", () => {
    const source = [
      "# Heading",
      "",
      "[link](https://example.com) and **bold** with *emphasis*",
      "![alt](./image.png)",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- [x] Task",
      "",
      "> **Quote**",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "  A[Start] --> B[End]",
      "```",
      "",
      "---",
      "",
      "tail"
    ].join("\n");
    const selection = {
      anchor: source.indexOf("tail"),
      head: source.indexOf("tail")
    };
    const editorDerivedState = createEditorDerivedState({
      source,
      selection,
      parseMarkdownDocument
    });

    const result = createBlockDecorations({
      activeBlockState: editorDerivedState.activeBlockState,
      activeLine: editorDerivedState.activeLine,
      editingDocument: editorDerivedState.editingDocument,
      hasEditorFocus: true,
      source,
      viewMode: "source"
    });

    expect(result.signature).toContain("view-mode:source");
    expect(result.signature).not.toContain("heading:");
    expect(result.signature).not.toContain("table:");
    expect(collectDecorations(source, result.decorationSet)).toEqual([]);
    expect(collectWidgets(source, result.decorationSet)).toEqual([]);
    expect(collectBlockReplacements(source, result.decorationSet)).toEqual([]);
    expect(collectPhysicalLineDecorations(source, result.decorationSet)).toHaveLength(
      source.split("\n").length
    );
  });

  it("renders indented code blocks as inactive code and hides the source indentation marker", () => {
    const source = [
      "Indented code",
      "",
      "    // Some comments",
      "    line 1 of code",
      "    line 2 of code"
    ].join("\n");

    const ranges = createInactiveInlineDecorations(source);
    const firstCodeLineStart = source.indexOf("    // Some comments");
    const secondCodeLineStart = source.indexOf("    line 1 of code");
    const thirdCodeLineStart = source.indexOf("    line 2 of code");

    expect(ranges).toEqual(
      expect.arrayContaining([
        {
          from: firstCodeLineStart,
          to: firstCodeLineStart,
          className: "cm-inactive-code-block cm-inactive-code-block-start",
          text: ""
        },
        {
          from: firstCodeLineStart,
          to: firstCodeLineStart + 4,
          className: "cm-inactive-code-block-indent-marker",
          text: "    "
        },
        {
          from: secondCodeLineStart,
          to: secondCodeLineStart,
          className: "cm-inactive-code-block",
          text: ""
        },
        {
          from: secondCodeLineStart,
          to: secondCodeLineStart + 4,
          className: "cm-inactive-code-block-indent-marker",
          text: "    "
        },
        {
          from: thirdCodeLineStart,
          to: thirdCodeLineStart,
          className: "cm-inactive-code-block cm-inactive-code-block-end",
          text: ""
        },
        {
          from: thirdCodeLineStart,
          to: thirdCodeLineStart + 4,
          className: "cm-inactive-code-block-indent-marker",
          text: "    "
        }
      ])
    );
  });

  it("keeps thematic-break continuation lines rendered when a list becomes inactive", () => {
    const source = ["- item", "continued", "+++", "# Heading"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Heading"),
      head: source.indexOf("Heading")
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
      ranges.find(
        (range) => range.from === source.indexOf("+++") && range.className === "cm-inactive-thematic-break"
      )
    ).toBeDefined();
    expect(
      ranges.find(
        (range) =>
          range.from === source.indexOf("+++") &&
          range.to === source.indexOf("+++") + "+++".length &&
          range.className === "cm-inactive-thematic-break-marker"
      )
    ).toBeDefined();
  });

  it("uses each continuation line source prefix for list hanging indentation", () => {
    const source = [
      "- parent",
      "  - child",
      "continued child",
      "  indented parent continuation",
      "",
      "Paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("continued child"),
      head: source.indexOf("continued child")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);
    const activeContinuationStart = source.indexOf("continued child");
    const inactiveContinuationStart = source.indexOf("  indented parent continuation");

    expect(getLineDecorationStyleAt(source, result.decorationSet, activeContinuationStart)).toContain(
      "--fishmark-list-source-prefix-offset: 0em;"
    );
    expect(getLineDecorationStyleAt(source, result.decorationSet, inactiveContinuationStart)).toContain(
      "--fishmark-list-source-prefix-offset: 2ch;"
    );
    expectExactRangeClasses(
      ranges,
      inactiveContinuationStart,
      inactiveContinuationStart + 2,
      ["cm-inactive-list-source-prefix"]
    );
  });

  it("separates active child list source prefixes from visual depth geometry", () => {
    const source = ["- parent", "  - child", "    - grandchild", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const childLineStart = source.indexOf("  - child");
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("child"),
      head: source.indexOf("child")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expect(getLineDecorationStyleAt(source, result.decorationSet, childLineStart)).toContain(
      "--fishmark-list-source-prefix-offset: 0em;"
    );
    expectExactRangeClasses(ranges, childLineStart, childLineStart + 2, [
      "cm-active-list-source-prefix"
    ]);
    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: childLineStart + 2,
      name: "ActiveListMarkerWidget",
      to: childLineStart + 3
    });
    expectExactRangeClasses(ranges, childLineStart + 3, childLineStart + 4, [
      "cm-active-list-padding-anchor"
    ]);
  });

  it("collapses active list continuation source indentation without moving content", () => {
    const source = ["- parent", "  active continuation", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const continuationStart = source.indexOf("  active continuation");
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("active continuation"),
      head: source.indexOf("active continuation")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expect(getLineDecorationStyleAt(source, result.decorationSet, continuationStart)).toContain(
      "--fishmark-list-source-prefix-offset: 0em;"
    );
    expectExactRangeClasses(ranges, continuationStart, continuationStart + 2, [
      "cm-active-list-source-prefix"
    ]);
  });

  it("keeps an active empty list marker as a generated marker with editable padding", () => {
    const source = "- ";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.length,
      head: source.length
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: 0,
      name: "ActiveListMarkerWidget",
      to: 1
    });
    expectExactRangeClasses(ranges, 1, source.length, [
      "cm-active-list-padding-anchor"
    ]);
  });

  it("replaces inactive task list markers with dedicated checkbox widgets", () => {
    const source = ["- [ ] Todo", "- [x] FinishedTodo", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
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

    expect(collectWidgets(source, result.decorationSet)).toEqual([
      { from: 2, to: 5, name: "TaskMarkerWidget" },
      { from: 13, to: 16, name: "TaskMarkerWidget" }
    ]);
    expect(
      ranges.some((range) => range.text === "[ ]" && range.className.includes("cm-inactive-task-marker"))
    ).toBe(false);
    expect(
      ranges.some((range) => range.text === "[x]" && range.className.includes("cm-inactive-task-marker"))
    ).toBe(false);
  });

  it("renders reference-style Markdown images as image widgets and hides inactive definitions", () => {
    const source = [
      "![Alt text][id]",
      "",
      '[id]: https://octodex.github.com/images/dojocat.jpg  "The Dojocat"',
      "",
      "Paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(collectWidgets(source, result.decorationSet)).toEqual([
      { from: 0, to: "![Alt text][id]".length, name: "MarkdownImagePreviewWidget" }
    ]);
    expect(collectBlockReplacements(source, result.decorationSet)).toEqual([
      {
        from: source.indexOf("[id]:"),
        to: source.indexOf("\n\nParagraph"),
        text: '[id]: https://octodex.github.com/images/dojocat.jpg  "The Dojocat"'
      }
    ]);
  });

  it("renders valid footnote references and definitions with inactive decorations", () => {
    const source = ["Text[^n]", "", "[^n]: Footnote **body**", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
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
    const definitionStart = source.indexOf("[^n]:");
    const definitionContentStart = source.indexOf("Footnote");

    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: source.indexOf("[^n]"),
      to: source.indexOf("[^n]") + "[^n]".length,
      name: "FootnoteReferenceWidget"
    });
    expectExactRangeClasses(ranges, 4, 6, []);
    expectExactRangeClasses(ranges, 6, 7, []);
    expectExactRangeClasses(ranges, 7, 8, []);
    expectExactRangeClasses(ranges, definitionStart, definitionStart, [
      "cm-inactive-footnote-definition cm-inactive-footnote-definition-start cm-inactive-footnote-definition-end"
    ]);
    expectExactRangeClasses(ranges, definitionStart, definitionContentStart, [
      "cm-inactive-footnote-definition-marker"
    ]);
    expectCoveredRangeClasses(ranges, source.indexOf("body"), source.indexOf("body") + "body".length, [
      "cm-inactive-inline-strong"
    ]);
    expect(collectBlockReplacements(source, result.decorationSet)).toEqual([]);
  });

  it("keeps duplicate footnote definitions and references visible as source", () => {
    const source = ["Text[^n]", "", "[^n]: first", "[^n]: second", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
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

    expect(ranges.some((range) => range.className === "cm-inactive-inline-footnote-reference")).toBe(false);
    expect(ranges.some((range) => range.className.includes("cm-inactive-footnote-definition"))).toBe(false);
    expect(collectBlockReplacements(source, result.decorationSet)).toEqual([]);
  });

  it("renders inactive inline and block math with preview widgets", () => {
    const source = ["Text $x^2$", "", "$$", "a + b", "$$", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(collectWidgets(source, result.decorationSet)).toEqual([
      { from: source.indexOf("$x^2$"), to: source.indexOf("$x^2$") + "$x^2$".length, name: "MathPreviewWidget" },
      { from: source.indexOf("$$"), to: source.indexOf("\n\nParagraph"), name: "MathPreviewWidget" }
    ]);
  });

  it("renders inactive Mermaid code fences with preview widgets and restores source while active", () => {
    const source = ["```mermaid", "graph TD", "  A[Start] --> B[End]", "```", "", "Paragraph"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const inactiveState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("graph TD"),
      head: source.indexOf("graph TD")
    });

    const inactiveResult = createBlockDecorations({
      activeBlockState: inactiveState,
      hasEditorFocus: true,
      source
    });
    const activeResult = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(collectWidgets(source, inactiveResult.decorationSet)).toEqual([
      { from: 0, to: source.indexOf("\n\nParagraph"), name: "MermaidPreviewWidget" }
    ]);
    expect(collectWidgets(source, activeResult.decorationSet)).toEqual([]);
    expect(collectDecorations(source, activeResult.decorationSet).some((range) =>
      range.className.includes("cm-inactive-code-block")
    )).toBe(true);
  });

  it("keeps math previews hidden in whole-document source mode", () => {
    const source = [
      "Text $x^2$",
      "",
      "$$",
      "a + b",
      "$$",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      "Paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source,
      viewMode: "source"
    });

    expect(collectWidgets(source, result.decorationSet)).toEqual([]);
    expect(collectBlockReplacements(source, result.decorationSet)).toEqual([]);
  });

  it("applies active paragraph line classes to keep body typography consistent", () => {
    const source = "Paragraph text";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
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

    expect(ranges.find((range) => range.from === 0 && range.to === 0)?.className).toBe(
      "cm-active-paragraph cm-active-paragraph-leading"
    );
  });

  it("keeps blockquote presentation decorations while the active blockquote is focused", () => {
    const source = ["> Quote line", "> Still quoted"].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Quote"),
      head: source.indexOf("Quote")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expect(result.signature).toContain(":content-edit");
    expect(ranges).toEqual([
      {
        from: 0,
        to: 0,
        className: "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start",
        text: ""
      },
      {
        from: 0,
        to: 1,
        className: "cm-active-blockquote-marker",
        text: ">"
      },
      {
        from: 1,
        to: 2,
        className: "cm-active-blockquote-padding-anchor",
        text: " "
      },
      {
        from: 13,
        to: 13,
        className: "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-end",
        text: ""
      },
      {
        from: 13,
        to: 15,
        className: "cm-inactive-blockquote-marker",
        text: "> "
      }
    ]);
  });

  it("uses active inline decorations inside focused blockquote content", () => {
    const source = "> ***中文*** ![图](./demo.png)";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("中文"),
      head: source.indexOf("中文")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source,
      resolveImagePreviewUrl: (href) => href
    });
    const ranges = collectDecorations(source, result.decorationSet);
    const contentStart = source.indexOf("***中文***");
    const imageEnd = source.length;

    expect(result.signature).toContain(":content-edit");
    expectExactRangeClasses(ranges, 0, 1, ["cm-active-blockquote-marker"]);
    expectExactRangeClasses(ranges, 1, 2, ["cm-active-blockquote-padding-anchor"]);
    expectCoveredRangeClasses(ranges, contentStart, contentStart + 1, ["cm-active-inline-marker"]);
    expectCoveredRangeClasses(ranges, contentStart + 1, contentStart + 3, [
      "cm-active-inline-marker",
      "cm-inactive-inline-emphasis"
    ]);
    expectCoveredRangeClasses(ranges, source.indexOf("中文"), source.indexOf("中文") + "中文".length, [
      "cm-fishmark-cjk-font",
      "cm-inactive-inline-emphasis",
      "cm-inactive-inline-strong"
    ]);
    expectCoveredRangeClasses(ranges, contentStart + 5, contentStart + 7, [
      "cm-active-inline-marker",
      "cm-inactive-inline-emphasis"
    ]);
    expectCoveredRangeClasses(ranges, contentStart + 7, contentStart + 8, ["cm-active-inline-marker"]);
    expect(ranges.some((range) => range.className === "cm-inactive-inline-marker")).toBe(false);
    expect(collectWidgets(source, result.decorationSet)).toContainEqual({
      from: imageEnd,
      to: imageEnd,
      name: "MarkdownImagePreviewWidget"
    });
  });

  it("hides the full nested blockquote source prefix and adds capped depth classes", () => {
    const source = [
      "> top",
      "> > spaced",
      ">> compact",
      ">    > indented",
      ">>>>> capped",
      "",
      "Paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Paragraph"),
      head: source.indexOf("Paragraph")
    });

    const ranges = collectDecorations(
      source,
      createBlockDecorations({
        activeBlockState: activeState,
        hasEditorFocus: true,
        source
      }).decorationSet
    );
    const spacedLineStart = source.indexOf("> > spaced");
    const compactLineStart = source.indexOf(">> compact");
    const indentedLineStart = source.indexOf(">    > indented");
    const cappedLineStart = source.indexOf(">>>>> capped");

    expectExactRangeClasses(ranges, spacedLineStart, spacedLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-2"
    ]);
    expectExactRangeClasses(ranges, compactLineStart, compactLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-2"
    ]);
    expectExactRangeClasses(ranges, indentedLineStart, indentedLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-2"
    ]);
    expectExactRangeClasses(ranges, cappedLineStart, cappedLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-4 cm-inactive-blockquote-end"
    ]);
    expectExactRangeClasses(ranges, spacedLineStart, spacedLineStart + "> > ".length, [
      "cm-inactive-blockquote-marker"
    ]);
    expectExactRangeClasses(ranges, compactLineStart, compactLineStart + ">> ".length, [
      "cm-inactive-blockquote-marker"
    ]);
    expectExactRangeClasses(ranges, indentedLineStart, indentedLineStart + ">    > ".length, [
      "cm-inactive-blockquote-marker"
    ]);
  });

  it("keeps bare quote separator lines rendered inside inactive blockquotes", () => {
    const source = [
      "> Target paragraph",
      ">",
      "> Explanation paragraph",
      "",
      "Plain paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Plain paragraph"),
      head: source.indexOf("Plain paragraph")
    });

    const ranges = collectDecorations(
      source,
      createBlockDecorations({
        activeBlockState: activeState,
        hasEditorFocus: true,
        source
      }).decorationSet
    );
    const firstLineStart = source.indexOf("> Target");
    const separatorLineStart = source.indexOf("\n>") + 1;
    const finalLineStart = source.indexOf("> Explanation");

    expectExactRangeClasses(ranges, firstLineStart, firstLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start"
    ]);
    expectExactRangeClasses(ranges, separatorLineStart, separatorLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-separator"
    ]);
    expectExactRangeClasses(ranges, finalLineStart, finalLineStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-end"
    ]);
    expectExactRangeClasses(ranges, firstLineStart, firstLineStart + "> ".length, [
      "cm-inactive-blockquote-marker"
    ]);
    expectExactRangeClasses(ranges, separatorLineStart, separatorLineStart + ">".length, [
      "cm-inactive-blockquote-marker"
    ]);
    expectExactRangeClasses(ranges, finalLineStart, finalLineStart + "> ".length, [
      "cm-inactive-blockquote-marker"
    ]);
  });

  it("renders list structure inside inactive blockquotes", () => {
    const source = [
      "> Intro",
      ">",
      "> - item",
      ">   - child",
      "> - item 2",
      "",
      "Plain paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Plain paragraph"),
      head: source.indexOf("Plain paragraph")
    });

    const ranges = collectDecorations(
      source,
      createBlockDecorations({
        activeBlockState: activeState,
        hasEditorFocus: true,
        source
      }).decorationSet
    );
    const firstItemStart = source.indexOf("> - item");
    const childItemStart = source.indexOf(">   - child");
    const secondItemStart = source.indexOf("> - item 2");
    const firstMarkerStart = source.indexOf("- item");
    const childMarkerStart = source.indexOf("- child");

    expectExactRangeClasses(ranges, firstItemStart, firstItemStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1",
      "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0"
    ]);
    expectExactRangeClasses(ranges, childItemStart, childItemStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1",
      "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-1"
    ]);
    expectExactRangeClasses(ranges, secondItemStart, secondItemStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-end",
      "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0"
    ]);
    expectExactRangeClasses(ranges, firstItemStart, firstMarkerStart, [
      "cm-inactive-blockquote-marker",
      "cm-inactive-list-source-prefix"
    ]);
    expectExactRangeClasses(ranges, firstMarkerStart, firstMarkerStart + 1, [
      "cm-inactive-list-marker"
    ]);
    expectExactRangeClasses(ranges, childItemStart, childItemStart + "> ".length, [
      "cm-inactive-blockquote-marker"
    ]);
    expectExactRangeClasses(ranges, childItemStart, childMarkerStart, [
      "cm-inactive-list-source-prefix"
    ]);
    expectExactRangeClasses(ranges, childMarkerStart, childMarkerStart + 1, [
      "cm-inactive-list-marker"
    ]);
  });

  it("keeps only the focused inner blockquote list line active", () => {
    const source = [
      "> - parent",
      "> - child",
      "> - sibling",
      "",
      "Plain paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("child"),
      head: source.indexOf("child")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);
    const widgets = collectWidgets(source, result.decorationSet);
    const parentStart = source.indexOf("> - parent");
    const childStart = source.indexOf("> - child");
    const siblingStart = source.indexOf("> - sibling");
    const parentMarkerStart = source.indexOf("- parent");
    const childMarkerStart = source.indexOf("- child");
    const siblingMarkerStart = source.indexOf("- sibling");

    expectExactRangeClasses(ranges, parentStart, parentStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start",
      "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0"
    ]);
    expectExactRangeClasses(ranges, childStart, childStart, [
      "cm-active-list cm-active-list-unordered cm-active-list-depth-0",
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1"
    ]);
    expectExactRangeClasses(ranges, siblingStart, siblingStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-end",
      "cm-inactive-list cm-inactive-list-unordered cm-inactive-list-depth-0"
    ]);
    expectExactRangeClasses(ranges, parentMarkerStart, parentMarkerStart + 1, [
      "cm-inactive-list-marker"
    ]);
    expect(widgets).toContainEqual({
      from: childMarkerStart,
      name: "ActiveListMarkerWidget",
      to: childMarkerStart + 1
    });
    expectExactRangeClasses(ranges, siblingMarkerStart, siblingMarkerStart + 1, [
      "cm-inactive-list-marker"
    ]);
  });

  it("renders block math previews inside inactive blockquotes", () => {
    const source = [
      "> $$",
      "> x^2",
      "> $$",
      "",
      "Plain paragraph"
    ].join("\n");
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.indexOf("Plain paragraph"),
      head: source.indexOf("Plain paragraph")
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);
    const mathStart = source.indexOf("> $$");

    expect(collectWidgets(source, result.decorationSet)).toEqual([
      { from: mathStart, to: source.indexOf("\n\nPlain paragraph"), name: "MathPreviewWidget" }
    ]);
    expectExactRangeClasses(ranges, mathStart, mathStart, [
      "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start"
    ]);
  });

  it("does not render a blockquote presentation for a bare marker while focused", () => {
    const source = ">";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: 1,
      head: 1
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(result.signature).not.toContain(":content-edit");
    expect(collectDecorations(source, result.decorationSet)).toEqual([
      {
        from: 0,
        to: 0,
        className: "cm-active-paragraph cm-active-paragraph-leading",
        text: ""
      }
    ]);
  });

  it("hides a marker and trailing space while the blockquote is focused", () => {
    const source = "> ";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: 2,
      head: 2
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });

    expect(result.signature).toContain(":content-edit");
    expect(collectDecorations(source, result.decorationSet)).toEqual([
      {
        from: 0,
        to: 0,
        className: "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start cm-inactive-blockquote-end",
        text: ""
      },
      {
        from: 0,
        to: 1,
        className: "cm-active-blockquote-marker",
        text: ">"
      },
      {
        from: 1,
        to: 2,
        className: "cm-active-blockquote-padding-anchor",
        text: " "
      }
    ]);
  });

  it("keeps blockquote markers hidden inside a focused quoted block", () => {
    const source = ["> Quote", "> "].join("\n");
    const secondLineStart = source.indexOf("> ", source.indexOf("\n"));
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.length,
      head: source.length
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expectExactRangeClasses(ranges, 0, 2, ["cm-inactive-blockquote-marker"]);
    expectExactRangeClasses(ranges, secondLineStart, secondLineStart + 1, ["cm-active-blockquote-marker"]);
    expectExactRangeClasses(ranges, secondLineStart + 1, secondLineStart + 2, [
      "cm-active-blockquote-padding-anchor"
    ]);
  });

  it("keeps an unpadded nested quote marker visible while the quoted line is focused", () => {
    const source = "> >";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.length,
      head: source.length
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expectExactRangeClasses(ranges, 0, 1, ["cm-active-blockquote-marker"]);
    expectExactRangeClasses(ranges, 1, 2, ["cm-active-blockquote-padding-anchor"]);
    expectExactRangeClasses(ranges, 2, 3, []);
  });

  it("adds a caret anchor after committing a nested quote marker while focused", () => {
    const source = "> > ";
    const blockMap = parseMarkdownDocument(source);
    const activeState = createActiveBlockStateFromBlockMap(blockMap, {
      anchor: source.length,
      head: source.length
    });

    const result = createBlockDecorations({
      activeBlockState: activeState,
      hasEditorFocus: true,
      source
    });
    const ranges = collectDecorations(source, result.decorationSet);

    expectExactRangeClasses(ranges, 0, 3, ["cm-active-blockquote-marker"]);
    expectExactRangeClasses(ranges, 3, 4, ["cm-active-blockquote-padding-anchor"]);
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
        from: 0,
        to: 0,
        className: "cm-active-heading cm-active-heading-depth-1",
        text: ""
      },
      {
        from: 8,
        to: 8,
        className: "cm-inactive-blank-line",
        text: ""
      },
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
        from: 8,
        to: 8,
        className: "cm-inactive-blank-line",
        text: ""
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
      ranges.some((range) => range.className === "cm-fishmark-cjk-font" && range.text === "中文")
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

    expect(ranges.some((range) => range.className === "cm-fishmark-cjk-font")).toBe(false);
  });
});

describe("block decoration line helpers", () => {
  it("returns blockquote line metadata with marker bounds and edge flags", () => {
    const source = ["> quote", "  > nested"].join("\n");

    expect(getInactiveBlockquoteLines(0, source.length, source)).toEqual([
      {
        lineStart: 0,
        lineEnd: 7,
        markerEnd: 1,
        sourcePrefixEndOffset: 2,
        contentStartOffset: 2,
        quoteDepth: 1,
        isFirstLine: true,
        isLastLine: false
      },
      {
        lineStart: 8,
        lineEnd: 18,
        markerEnd: 11,
        sourcePrefixEndOffset: 12,
        contentStartOffset: 12,
        quoteDepth: 1,
        isFirstLine: false,
        isLastLine: true
      }
    ]);
  });

  it("returns code fence line metadata for fences and content rows", () => {
    const source = ["```ts", "const answer = 42;", "```"].join("\n");

    expect(getInactiveCodeFenceLines(0, source.length, source)).toEqual([
      {
        contentStart: 0,
        lineStart: 0,
        lineEnd: 5,
        kind: "fence",
        isFirstContentLine: false,
        isLastContentLine: false
      },
      {
        contentStart: 6,
        lineStart: 6,
        lineEnd: 24,
        kind: "content",
        isFirstContentLine: true,
        isLastContentLine: true
      },
      {
        contentStart: 25,
        lineStart: 25,
        lineEnd: 28,
        kind: "fence",
        isFirstContentLine: false,
        isLastContentLine: false
      }
    ]);
  });

  it("returns indented code line metadata with content starting after the Markdown indent marker", () => {
    const source = ["    // Some comments", "    line 1 of code"].join("\n");

    expect(getInactiveCodeFenceLines(0, source.length, source, "indented")).toEqual([
      {
        contentStart: 4,
        lineStart: 0,
        lineEnd: 20,
        kind: "content",
        isFirstContentLine: true,
        isLastContentLine: false
      },
      {
        contentStart: 25,
        lineStart: 21,
        lineEnd: 39,
        kind: "content",
        isFirstContentLine: false,
        isLastContentLine: true
      }
    ]);
  });
});
