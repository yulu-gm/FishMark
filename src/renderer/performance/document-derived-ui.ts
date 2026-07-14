import {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "@fishmark/editor-core";
import { parseMarkdownDocument, type MarkdownDocument } from "@fishmark/markdown-engine";

import { getDocumentMetrics } from "../document-metrics";
import { deriveOutlineItems } from "../outline";

type RendererDerivedDataOperationEvidence = {
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON;
};

export type RendererDerivedDataPerformanceReport = {
  lineCount: number;
  metrics: RendererDerivedDataOperationEvidence & {
    name: "metrics";
    meaningfulCharacterCount: number;
  };
  outline: RendererDerivedDataOperationEvidence & {
    name: "outline";
    itemCount: number;
  };
  sourceLength: number;
};

export function measureRendererDerivedDataPerformance(
  source: string
): RendererDerivedDataPerformanceReport {
  let outlineParseCalls = 0;
  const outline = measure(() =>
    deriveOutlineItems(source, {
      parseMarkdownDocument: createParserProbe(() => {
        outlineParseCalls += 1;
      })
    })
  );
  let metricsParseCalls = 0;
  const metrics = measure(() =>
    getDocumentMetrics(source, {
      parseMarkdownDocument: createParserProbe(() => {
        metricsParseCalls += 1;
      })
    })
  );

  return {
    lineCount: countMarkdownLines(source),
    metrics: {
      name: "metrics",
      durationMs: metrics.durationMs,
      meaningfulCharacterCount: metrics.value.meaningfulCharacterCount,
      ...createOperationEvidence(metricsParseCalls)
    },
    outline: {
      name: "outline",
      durationMs: outline.durationMs,
      itemCount: outline.value.length,
      ...createOperationEvidence(outlineParseCalls)
    },
    sourceLength: source.length
  };
}

export function formatRendererDerivedDataPerformanceReport(
  report: RendererDerivedDataPerformanceReport
): string {
  return JSON.stringify(report, null, 2);
}

function createParserProbe(onParse: () => void): (source: string) => MarkdownDocument {
  return (source) => {
    onParse();
    return parseMarkdownDocument(source);
  };
}

function createOperationEvidence(
  parseMarkdownDocumentCalls: number
): Omit<RendererDerivedDataOperationEvidence, "durationMs"> {
  return {
    counters: {
      fullParse: parseMarkdownDocumentCalls,
      incrementalParseWindow: 0,
      cacheHit: 0,
      invalidatedNodes: 0,
      decorationRebuild: 0
    },
    parserEntries: {
      parseMarkdownDocument: parseMarkdownDocumentCalls,
      parseBlockMap: 0
    },
    capabilityRefs: ["incrementalStructureCache"],
    unavailableCapabilityReason: INCREMENTAL_STRUCTURE_CACHE_REASON
  };
}

function countMarkdownLines(source: string): number {
  return source.length === 0 ? 0 : source.split("\n").length;
}

function measure<T>(run: () => T): { durationMs: number; value: T } {
  const startedAt = now();
  const value = run();

  return {
    durationMs: now() - startedAt,
    value
  };
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
