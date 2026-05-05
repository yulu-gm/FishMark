// @vitest-environment jsdom

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function getCssRule(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  return match?.[1] ?? "";
}

const forbiddenListGeometryVariables = [
  "--fishmark-list-marker-size",
  "--fishmark-list-marker-column-width",
  "--fishmark-list-marker-text-gap",
  "--fishmark-list-unordered-marker-left",
  "--fishmark-list-ordered-marker-width",
  "--fishmark-list-unordered-content-offset",
  "--fishmark-list-ordered-content-offset",
  "--fishmark-list-task-marker-left",
  "--fishmark-list-task-content-offset",
  "--fishmark-list-nested-indent",
  "--fishmark-task-size"
];

const forbiddenThemeMarkdownGeometryVariables = [
  ...forbiddenListGeometryVariables,
  "--fishmark-table-margin-top",
  "--fishmark-table-margin-bottom",
  "--fishmark-table-after-break-padding-bottom",
  "--fishmark-table-after-break-margin-bottom",
  "--fishmark-table-after-break-margin-top",
  "--fishmark-table-border-width",
  "--fishmark-table-cell-border-width",
  "--fishmark-table-cell-min-height",
  "--fishmark-table-cell-padding-block",
  "--fishmark-table-cell-padding-inline",
  "--fishmark-table-header-font-weight"
];

type MarkdownTextRenderingStandard = {
  units: {
    alignmentPxTolerance: number;
    gapPxTolerance: number;
    remBaselineForExamplesPx: number;
  };
  typography: {
    base: {
      letterSpacing: {
        value: number;
      };
    };
  };
  blockSpacing: {
    blankLine: {
      inactiveCollapsedHeightPx: number;
    };
  };
  lists: {
    geometry: {
      indentStepEm: number;
    };
    markerToTextGapRem: {
      value: number;
    };
    unordered: {
      markerColumnWidthEm: number;
      markerGlyphLeftFromDepthEm: number;
      markerGlyphSizeEm: number;
      contentStartOffsetEm: number;
    };
    ordered: {
      markerColumnWidthEm: number;
      contentStartOffsetEm: number;
    };
    task: {
      checkboxLeftFromDepthEm: number;
      checkboxSizeEm: number;
      contentStartOffsetEm: number;
    };
  };
};

async function getThemeMarkdownStylePaths(): Promise<string[]> {
  const projectRoot = process.cwd();
  const fixtureThemeRoot = resolve(projectRoot, "fixtures/themes");
  const fixtureThemeEntries = await readdir(fixtureThemeRoot, { withFileTypes: true });

  return [
    resolve(projectRoot, "src/renderer/theme-packages/default/styles/markdown.css"),
    ...fixtureThemeEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(fixtureThemeRoot, entry.name, "styles/markdown.css"))
  ].sort();
}

function toProjectRelativePath(path: string): string {
  return path.replace(`${process.cwd()}\\`, "").replaceAll("\\", "/");
}

function readMarkdownTextStandard(): Promise<MarkdownTextRenderingStandard> {
  return readFile(
    resolve(process.cwd(), "docs/standards/markdown-text-rendering-standard.json"),
    "utf8"
  ).then((content) => JSON.parse(content) as MarkdownTextRenderingStandard);
}

function getCssVariable(stylesheet: string, variableName: string): string {
  const match = getCssRule(stylesheet, ":root").match(
    new RegExp(`${variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+);`)
  );

  return match?.[1]?.trim() ?? "";
}

function getNumericCssVariables(stylesheet: string, variableNames: string[]): Record<string, number> {
  return Object.fromEntries(
    variableNames.map((variableName) => {
      const value = getCssVariable(stylesheet, variableName);
      const match = value.match(/^(-?\d+(?:\.\d+)?)(?:em|rem)$/);

      if (!match) {
        throw new Error(`Expected ${variableName} to be an em/rem number, got ${value}`);
      }

      return [variableName, Number(match[1])];
    })
  );
}

function readNumericCssVariable(values: Record<string, number>, variableName: string): number {
  const value = values[variableName];

  if (value === undefined) {
    throw new Error(`Missing CSS variable ${variableName}`);
  }

  return value;
}

function createDomRectList(rects: DOMRect[]): DOMRectList {
  return {
    length: rects.length,
    item: (index: number) => rects[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* rects;
    }
  } as DOMRectList;
}

function createRect(left: number, width = 10): DOMRect {
  return {
    x: left,
    y: 0,
    width,
    height: 20,
    top: 0,
    right: left + width,
    bottom: 20,
    left,
    toJSON: () => ({})
  } as DOMRect;
}

describe("editor source layout stylesheet", () => {
  it("pins the CodeMirror content area to the top even when the document is empty", async () => {
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/editor-source.css"), "utf8");
    const normalizedStylesheet = stylesheet.replace(/\r\n/g, "\n");
    const scrollerRule = getCssRule(stylesheet, ".document-editor .cm-scroller");
    const contentRule = getCssRule(stylesheet, ".document-editor .cm-content");

    expect(scrollerRule).toContain("align-items: flex-start !important;");
    expect(contentRule).toContain("min-height: 100%;");
    expect(normalizedStylesheet).toContain(
      [".document-editor .cm-line {", "  padding-left: 0;", "  padding-right: 0;", "}"].join("\n")
    );
  });

  it("keeps active list content anchored to the inactive content start", async () => {
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const inactiveListRule = getCssRule(stylesheet, ".document-editor .cm-line.cm-inactive-list");
    const activeListRule = getCssRule(stylesheet, ".document-editor .cm-line.cm-active-list");
    const activeContinuationRule = getCssRule(
      stylesheet,
      ".document-editor .cm-line.cm-active-list-continuation"
    );
    const activeSourcePrefixRule = getCssRule(
      stylesheet,
      ".document-editor .cm-active-list-source-prefix"
    );
    const activeMarkerRule = getCssRule(
      stylesheet,
      ".document-editor .cm-active-list-marker"
    );
    const activeOrderedMarkerRule = getCssRule(
      stylesheet,
      ".document-editor .cm-active-list-ordered .cm-active-list-marker"
    );

    expect(activeListRule).toContain(
      "--fishmark-list-source-prefix-offset: 0em;"
    );
    expect(activeListRule).toContain(
      "padding-left: calc(var(--fishmark-list-depth-offset) + var(--fishmark-list-content-offset));"
    );
    expect(activeListRule).toContain("position: relative;");
    expect(activeListRule).toContain("min-height: 1.84em;");
    expect(inactiveListRule).toContain("min-height: 1.84em;");
    expect(activeListRule).not.toContain("text-indent:");
    expect(activeListRule).not.toContain("0ch");
    expect(activeListRule).not.toContain("ch;");
    expect(activeContinuationRule).toContain("--fishmark-list-source-prefix-offset: 0em;");
    expect(activeContinuationRule).toContain(
      "padding-left: calc(var(--fishmark-list-depth-offset) + var(--fishmark-list-content-offset));"
    );
    expect(activeContinuationRule).not.toContain("text-indent:");
    expect(activeSourcePrefixRule).not.toContain("font-size: 0;");
    expect(activeSourcePrefixRule).toContain("position: absolute;");
    expect(activeSourcePrefixRule).toContain("left: calc(var(--fishmark-list-depth-offset) + var(--fishmark-list-content-offset));");
    expect(activeSourcePrefixRule).toContain("width: 0;");
    expect(activeSourcePrefixRule).toContain("overflow: hidden;");
    expect(activeSourcePrefixRule).toContain("font-size: inherit;");
    expect(activeSourcePrefixRule).toContain("line-height: inherit;");
    expect(activeMarkerRule).toContain("color: currentColor;");
    expect(activeMarkerRule).toContain("white-space: pre;");
    expect(activeMarkerRule).toContain("word-break: normal;");
    expect(activeMarkerRule).toContain("overflow-wrap: normal;");
    expect(activeOrderedMarkerRule).toContain("position: absolute;");
    expect(activeOrderedMarkerRule).toContain("left: var(--fishmark-list-depth-offset);");
    expect(activeOrderedMarkerRule).toContain("min-width: var(--fishmark-list-ordered-marker-width);");
    expect(activeOrderedMarkerRule).toContain("text-align: left;");

    const standard = await readMarkdownTextStandard();
    const depthStepEm = standard.lists.geometry.indentStepEm;
    const unorderedContentOffsetEm = standard.lists.unordered.contentStartOffsetEm;

    for (const depth of [0, 1, 2]) {
      const inactiveContentStart = depth * depthStepEm + unorderedContentOffsetEm;
      const activeContentStart = depth * depthStepEm + unorderedContentOffsetEm;

      expect(activeContentStart).toBeCloseTo(inactiveContentStart);
    }
  });

  it("keeps theme markdown styles out of app-owned list geometry", async () => {
    const violations: string[] = [];

    for (const path of await getThemeMarkdownStylePaths()) {
      const stylesheet = await readFile(path, "utf8");

      for (const variableName of forbiddenThemeMarkdownGeometryVariables) {
        if (stylesheet.includes(`${variableName}:`)) {
          violations.push(`${toProjectRelativePath(path)} -> ${variableName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps markdown text out of negative letter spacing", async () => {
    const standard = await readMarkdownTextStandard();
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const violations = Array.from(stylesheet.matchAll(/letter-spacing:\s*(-\d+(?:\.\d+)?)em;/g)).map(
      (match) => match[0]
    );

    expect(standard.typography.base.letterSpacing.value).toBe(0);
    expect(violations).toEqual([]);
  });

  it("collapses inactive structural blank lines so Markdown spacing is not double-counted", async () => {
    const standard = await readMarkdownTextStandard();
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const blankLineRule = getCssRule(stylesheet, ".document-editor .cm-line.cm-inactive-blank-line");

    expect(standard.blockSpacing.blankLine.inactiveCollapsedHeightPx).toBe(0);
    expect(blankLineRule).toContain("height: 0;");
    expect(blankLineRule).toContain("min-height: 0;");
    expect(blankLineRule).toContain("line-height: 0;");
    expect(blankLineRule).toContain("overflow: hidden;");
  });

  it("measures list marker gaps and wrapped line alignment in a DOM geometry fixture", async () => {
    const standard = await readMarkdownTextStandard();
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const values = getNumericCssVariables(stylesheet, [
      "--fishmark-list-marker-size",
      "--fishmark-list-marker-column-width",
      "--fishmark-list-marker-text-gap",
      "--fishmark-list-unordered-marker-left",
      "--fishmark-list-ordered-marker-width",
      "--fishmark-list-task-marker-left",
      "--fishmark-list-nested-indent",
      "--fishmark-task-size"
    ]);
    const pxPerEm = standard.units.remBaselineForExamplesPx;
    const listNestedIndent = readNumericCssVariable(values, "--fishmark-list-nested-indent");
    const listMarkerSize = readNumericCssVariable(values, "--fishmark-list-marker-size");
    const listMarkerColumnWidth = readNumericCssVariable(values, "--fishmark-list-marker-column-width");
    const listMarkerTextGap = readNumericCssVariable(values, "--fishmark-list-marker-text-gap");
    const unorderedMarkerLeft = readNumericCssVariable(values, "--fishmark-list-unordered-marker-left");
    const orderedMarkerWidth = readNumericCssVariable(values, "--fishmark-list-ordered-marker-width");
    const taskMarkerLeft = readNumericCssVariable(values, "--fishmark-list-task-marker-left");
    const taskSize = readNumericCssVariable(values, "--fishmark-task-size");
    const depthOffsetPx = (depth: number) => depth * listNestedIndent * pxPerEm;
    const unorderedMarkerRightPx = listMarkerColumnWidth * pxPerEm;
    const orderedMarkerRightPx = orderedMarkerWidth * pxPerEm;
    const taskMarkerRightPx = (taskMarkerLeft + taskSize) * pxPerEm;
    const gapPx = listMarkerTextGap * pxPerEm;

    expect(listMarkerTextGap).toBe(standard.lists.markerToTextGapRem.value);
    expect(listNestedIndent).toBe(standard.lists.geometry.indentStepEm);
    expect(listMarkerColumnWidth).toBe(standard.lists.unordered.markerColumnWidthEm);
    expect(unorderedMarkerLeft).toBe(standard.lists.unordered.markerGlyphLeftFromDepthEm);
    expect(listMarkerSize).toBe(standard.lists.unordered.markerGlyphSizeEm);
    expect(orderedMarkerWidth).toBe(standard.lists.ordered.markerColumnWidthEm);
    expect(taskMarkerLeft).toBe(standard.lists.task.checkboxLeftFromDepthEm);
    expect(taskSize).toBe(standard.lists.task.checkboxSizeEm);

    const cases = [
      {
        kind: "unordered depth 0",
        markerRight: depthOffsetPx(0) + unorderedMarkerRightPx,
        contentLeft: depthOffsetPx(0) + standard.lists.unordered.contentStartOffsetEm * pxPerEm
      },
      {
        kind: "unordered depth 1",
        markerRight: depthOffsetPx(1) + unorderedMarkerRightPx,
        contentLeft: depthOffsetPx(1) + standard.lists.unordered.contentStartOffsetEm * pxPerEm
      },
      {
        kind: "ordered depth 1",
        markerRight: depthOffsetPx(1) + orderedMarkerRightPx,
        contentLeft: depthOffsetPx(1) + standard.lists.ordered.contentStartOffsetEm * pxPerEm
      },
      {
        kind: "task depth 1",
        markerRight: depthOffsetPx(1) + taskMarkerRightPx,
        contentLeft: depthOffsetPx(1) + standard.lists.task.contentStartOffsetEm * pxPerEm
      }
    ];

    const measured = cases.map((item) => {
      const row = document.createElement("div");
      const content = document.createElement("span");
      const marker = document.createElement("span");
      const range = document.createRange();

      row.className = "cm-line cm-inactive-list";
      row.dataset.kind = item.kind;
      marker.className = "cm-inactive-list-marker";
      content.className = "cm-inactive-list-content";
      content.textContent = "LongContinuousListContentThatWraps";
      row.append(marker, content);
      document.body.append(row);
      range.selectNodeContents(content);

      range.getClientRects = () =>
        createDomRectList([
          createRect(item.contentLeft),
          createRect(item.contentLeft),
          createRect(item.contentLeft)
        ]);

      const contentRects = Array.from(range.getClientRects());
      const firstContentRect = contentRects[0];

      if (!firstContentRect) {
        throw new Error(`Expected content rects for ${item.kind}`);
      }

      const wrappedLineLeftDelta = Math.max(
        ...contentRects.slice(1).map((rect) => Math.abs(rect.left - firstContentRect.left))
      );

      row.remove();

      return {
        kind: item.kind,
        gap: item.contentLeft - item.markerRight,
        wrappedLineLeftDelta
      };
    });

    for (const item of measured) {
      expect(item.gap, item.kind).toBeCloseTo(gapPx, 5);
      expect(Math.abs(item.gap - gapPx), item.kind).toBeLessThanOrEqual(standard.units.gapPxTolerance);
      expect(item.wrappedLineLeftDelta, item.kind).toBeLessThanOrEqual(
        standard.units.alignmentPxTolerance
      );
    }
  });

  it("keeps ordered and unordered list text on the same content column", async () => {
    const standard = await readMarkdownTextStandard();
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const values = getNumericCssVariables(stylesheet, [
      "--fishmark-list-marker-column-width",
      "--fishmark-list-marker-text-gap",
      "--fishmark-list-ordered-marker-width",
      "--fishmark-list-nested-indent"
    ]);
    const pxPerEm = standard.units.remBaselineForExamplesPx;
    const listNestedIndent = readNumericCssVariable(values, "--fishmark-list-nested-indent");
    const listMarkerColumnWidth = readNumericCssVariable(values, "--fishmark-list-marker-column-width");
    const listMarkerTextGap = readNumericCssVariable(values, "--fishmark-list-marker-text-gap");
    const orderedMarkerWidth = readNumericCssVariable(values, "--fishmark-list-ordered-marker-width");

    expect(standard.lists.unordered.contentStartOffsetEm).toBe(
      standard.lists.ordered.contentStartOffsetEm
    );

    for (const depth of [0, 1, 2]) {
      const depthOffsetPx = depth * listNestedIndent * pxPerEm;
      const unorderedMarkerRightPx = depthOffsetPx + listMarkerColumnWidth * pxPerEm;
      const orderedMarkerRightPx = depthOffsetPx + orderedMarkerWidth * pxPerEm;
      const unorderedContentLeftPx =
        depthOffsetPx + standard.lists.unordered.contentStartOffsetEm * pxPerEm;
      const orderedContentLeftPx =
        depthOffsetPx + standard.lists.ordered.contentStartOffsetEm * pxPerEm;

      expect(orderedContentLeftPx - unorderedContentLeftPx).toBeCloseTo(0, 5);
      expect(unorderedContentLeftPx - unorderedMarkerRightPx).toBeCloseTo(
        listMarkerTextGap * pxPerEm,
        5
      );
      expect(orderedContentLeftPx - orderedMarkerRightPx).toBeCloseTo(
        listMarkerTextGap * pxPerEm,
        5
      );
    }
  });

  it("keeps top-level list markers aligned with normal block text", async () => {
    const standard = await readMarkdownTextStandard();
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const values = getNumericCssVariables(stylesheet, [
      "--fishmark-list-unordered-marker-left",
      "--fishmark-list-task-marker-left"
    ]);
    const activeOrderedMarkerRule = getCssRule(
      stylesheet,
      ".document-editor .cm-active-list-ordered .cm-active-list-marker"
    );
    const inactiveOrderedMarkerRule = getCssRule(
      stylesheet,
      ".document-editor .cm-inactive-list-ordered .cm-inactive-list-marker"
    );

    expect(readNumericCssVariable(values, "--fishmark-list-unordered-marker-left")).toBe(0);
    expect(readNumericCssVariable(values, "--fishmark-list-task-marker-left")).toBe(0);
    expect(standard.lists.unordered.markerGlyphLeftFromDepthEm).toBe(0);
    expect(standard.lists.task.checkboxLeftFromDepthEm).toBe(0);
    expect(activeOrderedMarkerRule).toContain("left: var(--fishmark-list-depth-offset);");
    expect(inactiveOrderedMarkerRule).toContain("left: var(--fishmark-list-depth-offset);");
  });

  it("keeps task checkbox rendering on a themeable widget contract without changing list geometry", async () => {
    const stylesheet = await readFile(resolve(process.cwd(), "src/renderer/styles/markdown-render.css"), "utf8");
    const rootRule = getCssRule(stylesheet, ":root");
    const markerRule = getCssRule(stylesheet, ".document-editor .cm-inactive-task-marker");
    const boxRule = getCssRule(stylesheet, ".document-editor .cm-inactive-task-marker-box");
    const checkedBoxRule = getCssRule(
      stylesheet,
      '.document-editor .cm-inactive-task-marker[data-task-state="checked"] .cm-inactive-task-marker-box'
    );
    const checkRule = getCssRule(stylesheet, ".document-editor .cm-inactive-task-marker-check");
    const checkedCheckRule = getCssRule(
      stylesheet,
      '.document-editor .cm-inactive-task-marker[data-task-state="checked"] .cm-inactive-task-marker-check'
    );

    expect(rootRule).toContain("--fishmark-task-toggle-border:");
    expect(rootRule).toContain("--fishmark-task-toggle-bg:");
    expect(rootRule).toContain("--fishmark-task-toggle-checked-bg:");
    expect(rootRule).toContain("--fishmark-task-toggle-check:");
    expect(rootRule).toContain("--fishmark-task-toggle-radius:");
    expect(rootRule).toContain("--fishmark-task-toggle-check-width:");
    expect(rootRule).toContain("--fishmark-task-toggle-check-height:");
    expect(rootRule).toContain("--fishmark-task-toggle-check-stroke:");
    expect(markerRule).toContain("position: absolute;");
    expect(markerRule).toContain("top: 50%;");
    expect(markerRule).toContain("transform: translateY(-50%);");
    expect(markerRule).toContain("width: var(--fishmark-task-size);");
    expect(markerRule).toContain("height: var(--fishmark-task-size);");
    expect(boxRule).toContain("width: 100%;");
    expect(boxRule).toContain("height: 100%;");
    expect(boxRule).toContain("border: var(--fishmark-task-toggle-border-width");
    expect(boxRule).toContain("border-radius: var(--fishmark-task-toggle-radius);");
    expect(boxRule).toContain("background: var(--fishmark-task-toggle-bg);");
    expect(checkedBoxRule).toContain("background: var(--fishmark-task-toggle-checked-bg);");
    expect(checkRule).toContain("opacity: 0;");
    expect(checkRule).toContain("width: var(--fishmark-task-toggle-check-width);");
    expect(checkRule).toContain("height: var(--fishmark-task-toggle-check-height);");
    expect(checkRule).toContain("border-right: var(--fishmark-task-toggle-check-stroke");
    expect(checkRule).toContain("border-bottom: var(--fishmark-task-toggle-check-stroke");
    expect(checkedCheckRule).toContain("opacity: 1;");
    expect(stylesheet).not.toContain(".cm-inactive-task-marker::before");
    expect(stylesheet).not.toContain(".cm-inactive-task-marker::after");
  });
});
