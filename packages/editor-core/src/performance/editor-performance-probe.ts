import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { parseBlockMap, parseMarkdownDocument } from "@fishmark/markdown-engine";
import type { BlockMap, MarkdownDocument } from "@fishmark/markdown-engine";

import { createFishMarkMarkdownExtensions } from "../extensions";
import { countMarkdownLines } from "./long-document-fixtures";

export const INCREMENTAL_STRUCTURE_CACHE_REASON =
  "incremental-structure-cache-not-implemented" as const;

export type EditorPerformanceOperationName =
  | "open"
  | "edit"
  | "selection"
  | "orderedListEdit";

export type EditorPerformanceCounters = {
  fullParse: number;
  incrementalParseWindow: number;
  cacheHit: number;
  invalidatedNodes: number;
  decorationRebuild: number;
};

export type EditorPerformanceParserEntries = {
  parseMarkdownDocument: number;
  parseBlockMap: number;
};

export type EditorPerformanceOperationResult = {
  name: EditorPerformanceOperationName;
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: typeof INCREMENTAL_STRUCTURE_CACHE_REASON;
};

export type EditorPerformanceProbeReport = {
  fixture: {
    lineCount: number;
    sourceLength: number;
  };
  operations: EditorPerformanceOperationResult[];
};

type ProbeStats = EditorPerformanceParserEntries & {
  decorationRebuild: number;
};

type MeasuredOperation<T> = {
  operation: EditorPerformanceOperationResult;
  value: T;
};

export function measureEditorPerformanceProbe(input: {
  source: string;
}): EditorPerformanceProbeReport {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const stats: ProbeStats = {
    parseBlockMap: 0,
    parseMarkdownDocument: 0,
    decorationRebuild: 0
  };
  const parseMarkdownDocumentWithStats = (source: string): MarkdownDocument => {
    stats.parseMarkdownDocument += 1;
    return parseMarkdownDocument(source);
  };
  const parseBlockMapWithStats = (source: string): BlockMap => {
    stats.parseBlockMap += 1;
    return parseBlockMap(source);
  };
  const open = measureOperation(stats, "open", () =>
    new EditorView({
      state: EditorState.create({
        doc: input.source,
        extensions: createFishMarkMarkdownExtensions({
          parseMarkdownDocument: parseMarkdownDocumentWithStats,
          parseOrderedListNormalizationBlockMap: parseBlockMapWithStats,
          onBlockDecorationsBuilt: () => {
            stats.decorationRebuild += 1;
          },
          onContentChange: () => {}
        })
      }),
      parent: host
    })
  );
  const view = open.value;

  try {
    const operations: EditorPerformanceOperationResult[] = [
      open.operation,
      measureOperation(stats, "edit", () => {
        const paragraphOffset = view.state.doc.toString().indexOf("Paragraph");
        const insertionOffset = paragraphOffset >= 0 ? paragraphOffset : view.state.doc.length;

        view.dispatch({
          changes: {
            from: insertionOffset,
            insert: "Updated "
          },
          selection: {
            anchor: insertionOffset + "Updated ".length
          }
        });
      }).operation,
      measureOperation(stats, "selection", () => {
        view.dispatch({
          selection: {
            anchor: Math.floor(view.state.doc.length / 2)
          }
        });
      }).operation,
      measureOperation(stats, "orderedListEdit", () => {
        const source = view.state.doc.toString();
        const orderedItemOffset = source.indexOf("Ordered item");
        const insertionOffset = orderedItemOffset >= 0 ? orderedItemOffset : view.state.doc.length;

        view.dispatch({
          changes: {
            from: insertionOffset,
            insert: "updated "
          },
          selection: {
            anchor: insertionOffset + "updated ".length
          }
        });
      }).operation
    ];

    return {
      fixture: {
        lineCount: countMarkdownLines(input.source),
        sourceLength: input.source.length
      },
      operations
    };
  } finally {
    view.destroy();
    host.remove();
  }
}

export function formatEditorPerformanceProbeReport(report: EditorPerformanceProbeReport): string {
  return JSON.stringify(report, null, 2);
}

function measureOperation<T>(
  stats: ProbeStats,
  name: EditorPerformanceOperationName,
  run: () => T
): MeasuredOperation<T> {
  const before = { ...stats };
  const startedAt = now();
  const value = run();
  const parserEntries = {
    parseMarkdownDocument: stats.parseMarkdownDocument - before.parseMarkdownDocument,
    parseBlockMap: stats.parseBlockMap - before.parseBlockMap
  };

  return {
    operation: {
      name,
      durationMs: now() - startedAt,
      counters: {
        fullParse: parserEntries.parseMarkdownDocument + parserEntries.parseBlockMap,
        incrementalParseWindow: 0,
        cacheHit: 0,
        invalidatedNodes: 0,
        decorationRebuild: stats.decorationRebuild - before.decorationRebuild
      },
      parserEntries,
      capabilityRefs: ["incrementalStructureCache"],
      unavailableCapabilityReason: INCREMENTAL_STRUCTURE_CACHE_REASON
    },
    value
  };
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
