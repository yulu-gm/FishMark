import { describe, expect, it } from "vitest";

import {
  formatRendererDerivedDataPerformanceReport,
  measureRendererDerivedDataPerformance
} from "./document-derived-ui";

describe("measureRendererDerivedDataPerformance", () => {
  it("records real outline and metrics parse-entry evidence", () => {
    const source = createLegacyRendererPerformanceSource(5000);
    const report = measureRendererDerivedDataPerformance(source);

    expect(report.lineCount).toBe(5000);
    expect(report.sourceLength).toBe(source.length);
    expect(report.outline.name).toBe("outline");
    expect(report.outline.itemCount).toBeGreaterThan(0);
    expect(report.metrics.name).toBe("metrics");
    expect(report.metrics.meaningfulCharacterCount).toBeGreaterThan(0);

    for (const operation of [report.outline, report.metrics]) {
      expect(Number.isFinite(operation.durationMs)).toBe(true);
      expect(operation.durationMs).toBeGreaterThanOrEqual(0);
      expect(operation.parserEntries).toEqual({
        parseMarkdownDocument: 1,
        parseBlockMap: 0
      });
      expect(operation.counters).toEqual({
        fullParse: 1,
        incrementalParseWindow: 0,
        cacheHit: 0,
        invalidatedNodes: 0,
        decorationRebuild: 0
      });
      expect(operation.unavailableCapabilityReason).toBe(
        "incremental-structure-cache-not-implemented"
      );
    }

    expect(formatRendererDerivedDataPerformanceReport(report)).toContain('"parseMarkdownDocument": 1');
  }, 15_000);
});

function createLegacyRendererPerformanceSource(lineCount: number): string {
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
