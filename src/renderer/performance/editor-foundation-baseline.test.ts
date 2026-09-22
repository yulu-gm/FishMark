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
  toStableEditorFoundationBaseline,
  type EditorFoundationPerformanceReport
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

  it("owns a frozen identity snapshot that cannot be changed through caller input", () => {
    const bytes = Buffer.from("# One\nParagraph\n1. Ordered item", "utf8");
    const inputIdentity = createIdentity(bytes);
    const verified = validatePerformanceFixture({ bytes, identity: inputIdentity });
    const report = measureEditorFoundationPerformance(verified);
    const originalLineCount = verified.identity.lineCount;
    const originalContentProfile = verified.identity.contentProfile;
    const mutableInput = inputIdentity as MutableIdentity;

    mutableInput.lineCount = 99;
    mutableInput.contentProfile = "Caller mutation.";

    expect(Object.isFrozen(verified.identity)).toBe(true);
    expect(verified.identity.lineCount).toBe(originalLineCount);
    expect(verified.identity.contentProfile).toBe(originalContentProfile);
    expect(report.fixture.lineCount).toBe(originalLineCount);
    expect(report.fixture.contentProfile).toBe(originalContentProfile);
  });
});

describe("toStableEditorFoundationBaseline", () => {
  it("owns every nested object and tuple independently from the live report", () => {
    const report = createOwnershipReport();
    const stable = toStableEditorFoundationBaseline(report);

    expect(stable.fixture).not.toBe(report.fixture);
    expect(stable.capabilities).not.toBe(report.capabilities);
    expect(stable.capabilities.incrementalStructureCache).not.toBe(
      report.capabilities.incrementalStructureCache
    );
    expect(stable.capabilities.incrementalStructureCache.zeroCounters).not.toBe(
      report.capabilities.incrementalStructureCache.zeroCounters
    );
    expect(stable.operations).not.toBe(report.operations);
    expect(stable.operations[0]).not.toBe(report.operations[0]);
    expect(stable.operations[0]?.counters).not.toBe(report.operations[0]?.counters);
    expect(stable.operations[0]?.parserEntries).not.toBe(report.operations[0]?.parserEntries);
    expect(stable.operations[0]?.capabilityRefs).not.toBe(report.operations[0]?.capabilityRefs);

    const mutableReport = report as unknown as MutableReport;
    mutableReport.fixture.contentProfile = "Mutated live fixture.";
    mutableReport.capabilities.incrementalStructureCache.zeroCounters[0] = "mutatedCounter";
    mutableReport.operations[0]!.counters.fullParse = 99;
    mutableReport.operations[0]!.parserEntries.parseMarkdownDocument = 99;
    mutableReport.operations[0]!.capabilityRefs[0] = "mutatedCapability";

    expect(stable.fixture.contentProfile).toBe("Ownership test fixture.");
    expect(stable.capabilities.incrementalStructureCache.zeroCounters).toEqual([
      "incrementalParseWindow",
      "cacheHit",
      "invalidatedNodes"
    ]);
    expect(stable.operations[0]?.counters.fullParse).toBe(2);
    expect(stable.operations[0]?.parserEntries.parseMarkdownDocument).toBe(2);
    expect(stable.operations[0]?.capabilityRefs).toEqual(["incrementalStructureCache"]);
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

    expect(report.schemaVersion).toBe(2);
    expect(report.fixture).toEqual(fixture.identity);
    expect(report.capabilities.incrementalStructureCache).toEqual({
      available: true,
      reason: null,
      zeroCounters: []
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

    for (const operation of report.operations) {
      if (operation.name === "selection") {
        expect(operation.counters.fullParse).toBe(0);
        continue;
      }

      if (operation.name === "outline" || operation.name === "metrics") {
        expect(operation.counters).toEqual({
          fullParse: 0,
          incrementalParseWindow: 0,
          cacheHit: 0,
          invalidatedNodes: 0,
          decorationRebuild: 0
        });
        expect(operation.parserEntries).toEqual({
          parseMarkdownDocument: 0,
          parseOrderedListNormalization: 0
        });
        expect(operation.unavailableCapabilityReason).toBeNull();
        continue;
      }

      expect(operation.counters.fullParse).toBeGreaterThan(
        operation.parserEntries.parseMarkdownDocument +
          operation.parserEntries.parseOrderedListNormalization
      );
    }
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

function createOwnershipReport(): EditorFoundationPerformanceReport {
  return {
    schemaVersion: 2,
    fixture: {
      ...createIdentity(Buffer.from("# Ownership", "utf8")),
      contentProfile: "Ownership test fixture."
    },
    capabilities: {
      incrementalStructureCache: {
        available: false,
        reason: INCREMENTAL_STRUCTURE_CACHE_REASON,
        zeroCounters: ["incrementalParseWindow", "cacheHit", "invalidatedNodes"]
      }
    },
    operations: [
      {
        name: "open",
        durationMs: 1,
        counters: {
          fullParse: 2,
          incrementalParseWindow: 0,
          cacheHit: 0,
          invalidatedNodes: 0,
          decorationRebuild: 1
        },
        parserEntries: {
          parseMarkdownDocument: 2,
          parseOrderedListNormalization: 0
        },
        capabilityRefs: ["incrementalStructureCache"],
        unavailableCapabilityReason: INCREMENTAL_STRUCTURE_CACHE_REASON
      }
    ]
  };
}

type MutableIdentity = {
  -readonly [Key in keyof PerformanceFixtureIdentity]: PerformanceFixtureIdentity[Key];
};

type MutableReport = {
  fixture: {
    contentProfile: string;
  };
  capabilities: {
    incrementalStructureCache: {
      zeroCounters: string[];
    };
  };
  operations: Array<{
    counters: {
      fullParse: number;
    };
    parserEntries: {
      parseMarkdownDocument: number;
    };
    capabilityRefs: string[];
  }>;
};

