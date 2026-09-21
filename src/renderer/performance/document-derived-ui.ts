import {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "@fishmark/codemirror-adapter";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import {
  createDocumentStructureCache,
  type MarkdownParseInstrumentation
} from "@fishmark/markdown-engine";

import { getDocumentMetrics } from "../document-metrics";
import { deriveOutlineItems } from "../outline";

type RendererDerivedDataOperationEvidence = {
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON | null;
};

export type RendererDerivedDataPerformanceReport = {
  lineCount: number;
  sharedSnapshotBuild: {
    durationMs: number;
    fullDocumentParseCalls: number;
  };
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
  let sharedFullDocumentParseCalls = 0;
  const instrumentation = createInstrumentation(() => {
    sharedFullDocumentParseCalls += 1;
  });
  const sharedSnapshot = measure(() =>
    createEditorDerivedSnapshotFromCache(
      createDocumentStructureCache(source, { instrumentation })
    )
  );

  const outline = measure(() => deriveOutlineItems(sharedSnapshot.value));
  const metrics = measure(() => getDocumentMetrics(sharedSnapshot.value));

  return {
    lineCount: countMarkdownLines(source),
    sharedSnapshotBuild: {
      durationMs: sharedSnapshot.durationMs,
      fullDocumentParseCalls: sharedFullDocumentParseCalls
    },
    metrics: {
      name: "metrics",
      durationMs: metrics.durationMs,
      meaningfulCharacterCount: metrics.value.meaningfulCharacterCount,
      ...createSnapshotConsumerEvidence()
    },
    outline: {
      name: "outline",
      durationMs: outline.durationMs,
      itemCount: outline.value.length,
      ...createSnapshotConsumerEvidence()
    },
    sourceLength: source.length
  };
}

function createSnapshotConsumerEvidence(): Omit<
  RendererDerivedDataOperationEvidence,
  "durationMs"
> {
  return {
    counters: {
      fullParse: 0,
      incrementalParseWindow: 0,
      cacheHit: 1,
      invalidatedNodes: 0,
      decorationRebuild: 0
    },
    parserEntries: {
      parseMarkdownDocument: 0,
      parseOrderedListNormalization: 0
    },
    capabilityRefs: ["incrementalStructureCache"],
    unavailableCapabilityReason: null
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
