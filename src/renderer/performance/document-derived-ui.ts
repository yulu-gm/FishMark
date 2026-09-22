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

type ParseEventCounts = {
  readonly fullDocumentParseCalls: number;
  readonly inlineParseCalls: number;
};

type RendererDerivedDataOperationEvidence = {
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  parseEvents: ParseEventCounts;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON | null;
};

export type RendererDerivedDataPerformanceReport = {
  lineCount: number;
  sharedSnapshotBuild: {
    durationMs: number;
    snapshotBuildCount: number;
    parseEvents: ParseEventCounts;
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
  const parseTracker = createParseEventTracker();
  const instrumentation = createInstrumentation(parseTracker);
  let snapshotBuildCount = 0;

  const sharedSnapshot = measureWithParseEvents(parseTracker, () => {
    snapshotBuildCount += 1;
    return createEditorDerivedSnapshotFromCache(
      createDocumentStructureCache(source, { instrumentation })
    );
  });

  const outline = measureWithParseEvents(
    parseTracker,
    () => deriveOutlineItems(sharedSnapshot.value)
  );
  const metrics = measureWithParseEvents(
    parseTracker,
    () => getDocumentMetrics(sharedSnapshot.value)
  );

  return {
    lineCount: countMarkdownLines(source),
    sharedSnapshotBuild: {
      durationMs: sharedSnapshot.durationMs,
      snapshotBuildCount,
      parseEvents: sharedSnapshot.parseEvents
    },
    metrics: {
      name: "metrics",
      durationMs: metrics.durationMs,
      meaningfulCharacterCount: metrics.value.meaningfulCharacterCount,
      ...createSnapshotConsumerEvidence(metrics.parseEvents)
    },
    outline: {
      name: "outline",
      durationMs: outline.durationMs,
      itemCount: outline.value.length,
      ...createSnapshotConsumerEvidence(outline.parseEvents)
    },
    sourceLength: source.length
  };
}

function createSnapshotConsumerEvidence(
  parseEvents: ParseEventCounts
): Omit<RendererDerivedDataOperationEvidence, "durationMs"> {
  return {
    counters: {
      // This is measured from the same instrumentation tracker used to build the
      // shared snapshot, not asserted as an expected constant.
      fullParse: parseEvents.fullDocumentParseCalls,
      incrementalParseWindow: 0,
      // The consumer receives a snapshot directly. Any cache hit belongs to the
      // upstream structure cache/snapshot owner, not to Outline or Metrics.
      cacheHit: 0,
      invalidatedNodes: 0,
      decorationRebuild: 0
    },
    // These legacy schema fields remain for report compatibility. Parser-entry
    // ownership is enforced statically by the architecture guard; runtime
    // no-parse evidence for these consumers is parseEvents above.
    parserEntries: {
      parseMarkdownDocument: 0,
      parseOrderedListNormalization: 0
    },
    parseEvents,
    capabilityRefs: ["incrementalStructureCache"],
    unavailableCapabilityReason: null
  };
}

type ParseEventTracker = {
  fullDocumentParseCalls: number;
  inlineParseCalls: number;
};

function createParseEventTracker(): ParseEventTracker {
  return {
    fullDocumentParseCalls: 0,
    inlineParseCalls: 0
  };
}

function createInstrumentation(tracker: ParseEventTracker): MarkdownParseInstrumentation {
  return {
    onFullDocumentParse() {
      tracker.fullDocumentParseCalls += 1;
    },
    onInlineParse() {
      tracker.inlineParseCalls += 1;
    }
  };
}

function snapshotParseEvents(tracker: ParseEventTracker): ParseEventCounts {
  return {
    fullDocumentParseCalls: tracker.fullDocumentParseCalls,
    inlineParseCalls: tracker.inlineParseCalls
  };
}

function subtractParseEvents(
  after: ParseEventCounts,
  before: ParseEventCounts
): ParseEventCounts {
  return {
    fullDocumentParseCalls:
      after.fullDocumentParseCalls - before.fullDocumentParseCalls,
    inlineParseCalls: after.inlineParseCalls - before.inlineParseCalls
  };
}

function countMarkdownLines(source: string): number {
  return source.length === 0 ? 0 : source.split("\n").length;
}

function measureWithParseEvents<T>(
  tracker: ParseEventTracker,
  run: () => T
): {
  durationMs: number;
  parseEvents: ParseEventCounts;
  value: T;
} {
  const before = snapshotParseEvents(tracker);
  const startedAt = now();
  const value = run();
  const after = snapshotParseEvents(tracker);

  return {
    durationMs: now() - startedAt,
    parseEvents: subtractParseEvents(after, before),
    value
  };
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
