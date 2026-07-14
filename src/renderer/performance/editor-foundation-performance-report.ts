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
    fixture: report.fixture,
    capabilities: report.capabilities,
    operations: report.operations.map((operation) => ({
      name: operation.name,
      counters: operation.counters,
      parserEntries: operation.parserEntries,
      capabilityRefs: operation.capabilityRefs,
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
