// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_PERFORMANCE_FIXTURE_ID,
  CANONICAL_PERFORMANCE_FIXTURE_PATH,
  loadCanonicalPerformanceFixture,
  validatePerformanceFixture,
  type PerformanceFixtureIdentity
} from "./editor-foundation-fixture.test-support";
import {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  formatEditorFoundationPerformanceReport,
  measureEditorFoundationPerformance,
  toStableEditorFoundationBaseline
} from "./editor-foundation-performance-report";

describe("validatePerformanceFixture", () => {
  it("rejects tampered fixture bytes before measurement", () => {
    const original = Buffer.from("# One\nParagraph\n- item", "utf8");
    const identity = createIdentity(original);
    let measurementCalls = 0;

    expect(() => {
      const fixture = validatePerformanceFixture({
        bytes: Buffer.from("# One\nTampered\n- item", "utf8"),
        identity
      });
      measurementCalls += 1;
      return measureEditorFoundationPerformance(fixture);
    }).toThrow(/sha-256/i);
    expect(measurementCalls).toBe(0);
  });

  it.each([
    ["schema", { schemaVersion: 2 }, /schema/i],
    ["path", { path: "fixtures/performance/not-canonical.md" }, /path/i],
    ["hash", { sha256: "0".repeat(64) }, /sha-256/i],
    ["line count", { lineCount: 99 }, /line count/i],
    ["byte length", { byteLength: 99 }, /byte length/i],
    ["source length", { sourceLength: 99 }, /source length/i],
    ["encoding", { encoding: "utf-16" }, /encoding/i],
    ["newline policy", { newlinePolicy: "crlf" }, /newline policy/i]
  ])("rejects a mismatched %s identity", (_label, patch, expectedError) => {
    const bytes = Buffer.from("# One\nParagraph\n- item", "utf8");
    const identity = { ...createIdentity(bytes), ...patch };

    expect(() => validatePerformanceFixture({ bytes, identity })).toThrow(expectedError);
  });

  it.each([
    ["CRLF", "# One\r\nParagraph"],
    ["a final newline", "# One\nParagraph\n"]
  ])("rejects %s even when the identity describes the same bytes", (_label, source) => {
    const bytes = Buffer.from(source, "utf8");

    expect(() =>
      validatePerformanceFixture({ bytes, identity: createIdentity(bytes) })
    ).toThrow(/newline/i);
  });
});

describe("editor foundation canonical performance baseline", () => {
  it("measures the verified committed fixture and matches deterministic current counters", () => {
    const fixture = loadCanonicalPerformanceFixture(process.cwd());
    const baseline = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "fixtures/performance/editor-foundation-current-baseline.json"),
        "utf8"
      )
    ) as unknown;

    expect(fixture.identity.fixtureId).toBe(CANONICAL_PERFORMANCE_FIXTURE_ID);
    expect(fixture.identity.path).toBe(CANONICAL_PERFORMANCE_FIXTURE_PATH);
    expect(fixture.identity.lineCount).toBe(20_000);
    expect(fixture.source.split("\n")).toHaveLength(20_000);

    const report = measureEditorFoundationPerformance(fixture);

    expect(report.schemaVersion).toBe(1);
    expect(report.fixture).toEqual(fixture.identity);
    expect(report.capabilities.incrementalStructureCache).toEqual({
      available: false,
      reason: INCREMENTAL_STRUCTURE_CACHE_REASON,
      zeroCounters: ["incrementalParseWindow", "cacheHit", "invalidatedNodes"]
    });
    expect(report.operations.map((operation) => operation.name)).toEqual([
      "open",
      "edit",
      "selection",
      "orderedListEdit",
      "outline",
      "metrics"
    ]);

    for (const operation of report.operations) {
      expect(Number.isFinite(operation.durationMs)).toBe(true);
      expect(operation.durationMs).toBeGreaterThanOrEqual(0);
      expect(operation.capabilityRefs).toEqual(["incrementalStructureCache"]);

      for (const counter of Object.values(operation.counters)) {
        expect(Number.isInteger(counter)).toBe(true);
        expect(counter).toBeGreaterThanOrEqual(0);
      }
    }

    expect(report.operations.find((operation) => operation.name === "selection")?.counters.fullParse).toBe(0);
    expect(JSON.stringify(baseline)).not.toContain("durationMs");
    expect(toStableEditorFoundationBaseline(report)).toEqual(baseline);

    if (shouldPrintPerformanceReport()) {
      console.info(formatEditorFoundationPerformanceReport(report));
    }
  }, 60_000);
});

function createIdentity(bytes: Buffer): PerformanceFixtureIdentity {
  const source = bytes.toString("utf8");

  return {
    schemaVersion: 1,
    fixtureId: CANONICAL_PERFORMANCE_FIXTURE_ID,
    path: CANONICAL_PERFORMANCE_FIXTURE_PATH,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    lineCount: source.length === 0 ? 0 : source.split("\n").length,
    byteLength: bytes.byteLength,
    sourceLength: source.length,
    encoding: "utf-8",
    newlinePolicy: "lf-only-no-final-newline",
    lineCountPolicy: "logical-lines-separated-by-lf",
    contentProfile: "Focused validation fixture."
  };
}

function shouldPrintPerformanceReport(): boolean {
  return process.env.FISHMARK_PERF_REPORT === "1";
}
