import { describe, expect, it } from "vitest";

import { measureRendererDerivedDataPerformance } from "./document-derived-ui";

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

    // The outline reads the canonical tree directly, so it makes no rich-document entry at all.
    expect(report.outline.parserEntries).toEqual({
      parseMarkdownDocument: 0,
      parseOrderedListNormalization: 0
    });
    // Metrics is the only remaining consumer that still enters through parseMarkdownDocument.
    expect(report.metrics.parserEntries).toEqual({
      parseMarkdownDocument: 1,
      parseOrderedListNormalization: 0
    });
    expect(
      report.outline.parserEntries.parseMarkdownDocument +
        report.metrics.parserEntries.parseMarkdownDocument
    ).toBe(1);

    for (const operation of [report.outline, report.metrics]) {
      expect(Number.isFinite(operation.durationMs)).toBe(true);
      expect(operation.durationMs).toBeGreaterThanOrEqual(0);
      expect(operation.counters.fullParse).toBeGreaterThan(
        operation.parserEntries.parseMarkdownDocument + operation.parserEntries.parseOrderedListNormalization
      );
      expect(operation.counters).toMatchObject({
        incrementalParseWindow: 0,
        cacheHit: 0,
        invalidatedNodes: 0,
        decorationRebuild: 0
      });
      expect(operation.unavailableCapabilityReason).toBe(
        "consumer-does-not-use-incremental-structure-cache"
      );
    }

    expect(report.outline.counters.fullParse).toBe(2);
    expect(report.metrics.counters.fullParse).toBe(report.outline.counters.fullParse + 1);
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
