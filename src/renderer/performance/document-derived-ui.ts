import {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "@fishmark/editor-core";
import {
  collectReferenceDefinitions,
  parseMarkdownDocument,
  type MarkdownDocument,
  type MarkdownParseInstrumentation
} from "@fishmark/markdown-engine";

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
  let outlineFullDocumentParseCalls = 0;
  const outlineInstrumentation = createInstrumentation(() => {
    outlineFullDocumentParseCalls += 1;
  });
  const outline = measure(() =>
    deriveOutlineItems(source, {
      parseMarkdownDocument: createParserProbe(() => {
        outlineParseCalls += 1;
      }, outlineInstrumentation)
    })
  );
  let metricsParseCalls = 0;
  let metricsFullDocumentParseCalls = 0;
  const metricsInstrumentation = createInstrumentation(() => {
    metricsFullDocumentParseCalls += 1;
  });
  const metrics = measure(() =>
    getDocumentMetrics(source, {
      collectReferenceDefinitions: (input) =>
        collectReferenceDefinitions(input, { instrumentation: metricsInstrumentation }),
      parseMarkdownDocument: createParserProbe(() => {
        metricsParseCalls += 1;
      }, metricsInstrumentation)
    })
  );

  return {
    lineCount: countMarkdownLines(source),
    metrics: {
      name: "metrics",
      durationMs: metrics.durationMs,
      meaningfulCharacterCount: metrics.value.meaningfulCharacterCount,
      ...createOperationEvidence(metricsParseCalls, metricsFullDocumentParseCalls)
    },
    outline: {
      name: "outline",
      durationMs: outline.durationMs,
      itemCount: outline.value.length,
      ...createOperationEvidence(outlineParseCalls, outlineFullDocumentParseCalls)
    },
    sourceLength: source.length
  };
}

function createParserProbe(
  onParse: () => void,
  instrumentation: MarkdownParseInstrumentation
): (source: string) => MarkdownDocument {
  return (source) => {
    onParse();
    return parseMarkdownDocument(source, { instrumentation });
  };
}

function createOperationEvidence(
  parseMarkdownDocumentCalls: number,
  fullDocumentParseCalls: number
): Omit<RendererDerivedDataOperationEvidence, "durationMs"> {
  return {
    counters: {
      fullParse: fullDocumentParseCalls,
      incrementalParseWindow: 0,
      cacheHit: 0,
      invalidatedNodes: 0,
      decorationRebuild: 0
    },
    parserEntries: {
      parseMarkdownDocument: parseMarkdownDocumentCalls,
      parseOrderedListNormalization: 0
    },
    capabilityRefs: ["incrementalStructureCache"],
    unavailableCapabilityReason: INCREMENTAL_STRUCTURE_CACHE_REASON
  };
}

function createInstrumentation(onFullDocumentParse: () => void): MarkdownParseInstrumentation {
  return { onFullDocumentParse };
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

