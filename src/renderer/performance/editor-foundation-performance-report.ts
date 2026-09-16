import {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  measureEditorPerformanceProbe,
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "@fishmark/editor-core";

import type {
  PerformanceFixtureIdentity,
  VerifiedPerformanceFixture
} from "./editor-foundation-fixture-contract";
import { measureRendererDerivedDataPerformance } from "./document-derived-ui";

export type EditorFoundationPerformanceOperationName =
  | "open"
  | "edit"
  | "selection"
  | "orderedListEdit"
  | "outline"
  | "metrics";

export type EditorFoundationPerformanceOperation = {
  name: EditorFoundationPerformanceOperationName;
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON;
};

export type EditorFoundationPerformanceReport = {
  schemaVersion: 1;
  fixture: PerformanceFixtureIdentity;
  capabilities: {
    incrementalStructureCache: {
      available: false;
      reason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON;
      zeroCounters: ["incrementalParseWindow", "cacheHit", "invalidatedNodes"];
    };
  };
  operations: EditorFoundationPerformanceOperation[];
};

export type StableEditorFoundationPerformanceOperation = Omit<
  EditorFoundationPerformanceOperation,
  "durationMs"
>;

export type StableEditorFoundationPerformanceBaseline = Omit<
  EditorFoundationPerformanceReport,
  "operations"
> & {
  operations: StableEditorFoundationPerformanceOperation[];
};

export { INCREMENTAL_STRUCTURE_CACHE_REASON };

export function measureEditorFoundationPerformance(
  fixture: VerifiedPerformanceFixture
): EditorFoundationPerformanceReport {
  const editor = measureEditorPerformanceProbe({ source: fixture.source });
  const derivedData = measureRendererDerivedDataPerformance(fixture.source);

  return {
    schemaVersion: 1,
    fixture: fixture.identity,
    capabilities: {
      incrementalStructureCache: {
        available: false,
        reason: INCREMENTAL_STRUCTURE_CACHE_REASON,
        zeroCounters: ["incrementalParseWindow", "cacheHit", "invalidatedNodes"]
      }
    },
    operations: [
      ...editor.operations,
      toFoundationOperation(derivedData.outline),
      toFoundationOperation(derivedData.metrics)
    ]
  };
}

export function toStableEditorFoundationBaseline(
  report: EditorFoundationPerformanceReport
): StableEditorFoundationPerformanceBaseline {
  return {
    schemaVersion: report.schemaVersion,
    fixture: {
      schemaVersion: report.fixture.schemaVersion,
      fixtureId: report.fixture.fixtureId,
      path: report.fixture.path,
      sha256: report.fixture.sha256,
      lineCount: report.fixture.lineCount,
      byteLength: report.fixture.byteLength,
      sourceLength: report.fixture.sourceLength,
      encoding: report.fixture.encoding,
      newlinePolicy: report.fixture.newlinePolicy,
      lineCountPolicy: report.fixture.lineCountPolicy,
      contentProfile: report.fixture.contentProfile
    },
    capabilities: {
      incrementalStructureCache: {
        available: report.capabilities.incrementalStructureCache.available,
        reason: report.capabilities.incrementalStructureCache.reason,
        zeroCounters: [
          report.capabilities.incrementalStructureCache.zeroCounters[0],
          report.capabilities.incrementalStructureCache.zeroCounters[1],
          report.capabilities.incrementalStructureCache.zeroCounters[2]
        ]
      }
    },
    operations: report.operations.map((operation) => ({
      name: operation.name,
      counters: {
        fullParse: operation.counters.fullParse,
        incrementalParseWindow: operation.counters.incrementalParseWindow,
        cacheHit: operation.counters.cacheHit,
        invalidatedNodes: operation.counters.invalidatedNodes,
        decorationRebuild: operation.counters.decorationRebuild
      },
      parserEntries: {
        parseMarkdownDocument: operation.parserEntries.parseMarkdownDocument,
        parseOrderedListNormalization: operation.parserEntries.parseOrderedListNormalization
      },
      capabilityRefs: [operation.capabilityRefs[0]],
      unavailableCapabilityReason: operation.unavailableCapabilityReason
    }))
  };
}

export function formatEditorFoundationPerformanceReport(
  report: EditorFoundationPerformanceReport
): string {
  return JSON.stringify(report, null, 2);
}

function toFoundationOperation(input: {
  name: "outline" | "metrics";
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON;
}): EditorFoundationPerformanceOperation {
  return {
    name: input.name,
    durationMs: input.durationMs,
    counters: input.counters,
    parserEntries: input.parserEntries,
    capabilityRefs: input.capabilityRefs,
    unavailableCapabilityReason: input.unavailableCapabilityReason
  };
}

