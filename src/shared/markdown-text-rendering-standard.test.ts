import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type LengthValue = {
  value: number;
};

type ListStandard = {
  geometry: {
    indentStepRem: number;
    indentStepEm: number;
    depthOffsetFormula: string;
    contentStartFormula: string;
    activeInactiveContentStartFormula: string;
    wrappedLineFormula: string;
    rawSourcePrefixRule: string;
    zeroDisplacementRule: string;
  };
  markerToTextGapRem: LengthValue & {
    unit: string;
    mustBeEqualAcross: string[];
  };
  unordered: {
    markerColumnWidthEm: number;
    markerGlyphSizeRem: number;
    markerGlyphSizeEm: number;
    markerGlyphLeftFromDepthRem: number;
    markerGlyphLeftFromDepthEm: number;
    contentStartOffsetRem: number;
    contentStartOffsetEm: number;
  };
  ordered: {
    markerColumnWidthRem: number;
    markerColumnWidthEm: number;
    contentStartOffsetRem: number;
    contentStartOffsetEm: number;
  };
  task: {
    checkboxSizeRem: number;
    checkboxSizeEm: number;
    checkboxLeftFromDepthRem: number;
    checkboxLeftFromDepthEm: number;
    contentStartOffsetRem: number;
    contentStartOffsetEm: number;
  };
  activeRows: {
    contentStartRule: string;
    markerPositionRule: string;
    sourcePrefixGeometryRule: string;
  };
};

type MarkdownTextRenderingStandard = {
  schemaVersion: number;
  status: string;
  units: {
    listGeometryLength: string;
    alignmentPxTolerance: number;
    gapPxTolerance: number;
  };
  typography: {
    base: {
      letterSpacing: LengthValue;
    };
    lineHeight: {
      paragraph: number;
      list: number;
      listContinuation: number;
    };
  };
  lists: ListStandard;
  blockSpacing: {
    blankLine: {
      inactiveCollapsedHeightPx: number;
      rule: string;
    };
  };
  themeCompliance: {
    themesMustNotOverride: string[];
  };
  acceptance: {
    requiredAutomatedChecks: string[];
    passFailRules: string[];
  };
};

const standardPath = join(process.cwd(), "docs/standards/markdown-text-rendering-standard.json");

function readStandard(): MarkdownTextRenderingStandard {
  return JSON.parse(readFileSync(standardPath, "utf-8")) as MarkdownTextRenderingStandard;
}

describe("markdown text rendering standard", () => {
  it("defines a canonical JSON source for Markdown text geometry", () => {
    const standard = readStandard();

    expect(standard.schemaVersion).toBe(1);
    expect(standard.status).toBe("canonical");
    expect(standard.units.listGeometryLength).toBe("em");
    expect(standard.units.alignmentPxTolerance).toBe(2);
    expect(standard.units.gapPxTolerance).toBe(1);
    expect(standard.typography.base.letterSpacing.value).toBe(0);
    expect(standard.typography.lineHeight.paragraph).toBeGreaterThan(standard.typography.lineHeight.list);
    expect(standard.typography.lineHeight.listContinuation).toBe(standard.typography.lineHeight.list);
    expect(standard.blockSpacing.blankLine.inactiveCollapsedHeightPx).toBe(0);
    expect(standard.blockSpacing.blankLine.rule).toContain("active blank line remains editable");
  });

  it("keeps list depth, marker gap, and content offsets as separate constraints", () => {
    const { lists } = readStandard();
    const gap = lists.markerToTextGapRem.value;

    expect(lists.geometry.indentStepRem).toBe(1.4);
    expect(lists.geometry.indentStepEm).toBe(1.4);
    expect(gap).toBe(0.62);
    expect(lists.markerToTextGapRem.unit).toBe("em");
    expect(lists.ordered.markerColumnWidthRem).toBe(0.78);
    expect(lists.ordered.markerColumnWidthEm).toBe(0.78);
    expect(lists.geometry.depthOffsetFormula).toBe("depth * indentStepRem");
    expect(lists.geometry.contentStartFormula).toContain("markerToTextGapRem");
    expect(lists.geometry.activeInactiveContentStartFormula).toBe(
      "activeContentStartLeft == inactiveContentStartLeft"
    );
    expect(lists.geometry.wrappedLineFormula).toContain("firstContentGlyphLeft");
    expect(lists.geometry.rawSourcePrefixRule).toContain("must not double-count the depth offset");
    expect(lists.geometry.zeroDisplacementRule).toContain("no horizontal displacement");
    expect(lists.activeRows.contentStartRule).toContain("same x coordinate");
    expect(lists.activeRows.markerPositionRule).toContain("same marker column");
    expect(lists.activeRows.sourcePrefixGeometryRule).toContain("not character-count or ch-based geometry");
    expect(lists.markerToTextGapRem.mustBeEqualAcross).toContain("child unordered item");
    expect(lists.unordered.contentStartOffsetEm).toBeCloseTo(
      lists.unordered.markerColumnWidthEm + gap
    );
    expect(lists.ordered.contentStartOffsetEm).toBeCloseTo(lists.ordered.markerColumnWidthEm + gap);
    expect(lists.task.contentStartOffsetEm).toBeCloseTo(
      lists.task.checkboxLeftFromDepthEm + lists.task.checkboxSizeEm + gap
    );
  });

  it("makes theme geometry overrides and geometry-free approvals invalid", () => {
    const standard = readStandard();

    expect(standard.themeCompliance.themesMustNotOverride).toContain("list marker-to-text gap");
    expect(standard.themeCompliance.themesMustNotOverride).toContain("negative letter spacing");
    expect(standard.acceptance.requiredAutomatedChecks).toContain(
      "DOM geometry tests measure list marker-to-text gap at depth 0 and depth 1."
    );
    expect(standard.acceptance.passFailRules).toContain(
      "Any parent/child list marker-to-text gap difference above 1px is FAIL."
    );
    expect(standard.acceptance.passFailRules).toContain(
      "Any active child list content-start displacement from its inactive row above 0px is FAIL."
    );
    expect(standard.acceptance.passFailRules).toContain(
      "Any active marker displacement from its inactive marker column above 0px is FAIL."
    );
  });
});
