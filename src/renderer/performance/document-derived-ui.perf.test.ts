import { describe, expect, it } from "vitest";

import { measureRendererDerivedDataPerformance } from "./document-derived-ui";

describe("measureRendererDerivedDataPerformance", () => {
  it("builds one shared snapshot and keeps outline/metrics parser-free", () => {
    const source = createRendererPerformanceSource(5000);
    const report = measureRendererDerivedDataPerformance(source);

    expect(report.lineCount).toBe(5000);
    expect(report.sourceLength).toBe(source.length);
    expect(Number.isFinite(report.sharedSnapshotBuild.durationMs)).toBe(true);
    expect(report.sharedSnapshotBuild.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.sharedSnapshotBuild.fullDocumentParseCalls).toBeGreaterThan(0);

    expect(report.outline.name).toBe("outline");
    expect(report.outline.itemCount).toBeGreaterThan(0);
    expect(report.metrics.name).toBe("metrics");
    expect(report.metrics.meaningfulCharacterCount).toBeGreaterThan(0);

    for (const operation of [report.outline, report.metrics]) {
      expect(Number.isFinite(operation.durationMs)).toBe(true);
      expect(operation.durationMs).toBeGreaterThanOrEqual(0);
      expect(operation.parserEntries).toEqual({
        parseMarkdownDocument: 0,
        parseOrderedListNormalization: 0
      });
      expect(operation.counters).toEqual({
        fullParse: 0,
        incrementalParseWindow: 0,
        cacheHit: 1,
        invalidatedNodes: 0,
        decorationRebuild: 0
      });
      expect(operation.unavailableCapabilityReason).toBeNull();
    }
  }, 15_000);
});

function createRendererPerformanceSource(lineCount: number): string {
  const block = [
    "# Section",
    "Paragraph with **bold** and [link](https://example.com).",
    "1. Ordered item",
    "2. Ordered item",
    "- Bullet item",
    "> Quoted note",
    "```ts",
    "const value = 1;",
    "```",
    ""
  ];

  return Array.from({ length: lineCount }, (_value, index) => block[index % block.length]).join("\n");
}
