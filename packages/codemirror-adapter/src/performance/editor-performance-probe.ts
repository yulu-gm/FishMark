import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorStructureObserver } from "../transaction-adapter";
import {
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "../performance-counters";

import type { MarkdownParseInstrumentation } from "@fishmark/markdown-engine";

import { createFishMarkMarkdownExtensions } from "../extensions";
import { countMarkdownLines } from "@fishmark/editor-model";

export type EditorPerformanceOperationName =
  | "open"
  | "edit"
  | "selection"
  | "orderedListEdit";

export type EditorPerformanceOperationResult = {
  name: EditorPerformanceOperationName;
  durationMs: number;
  counters: EditorPerformanceCounters;
  parserEntries: EditorPerformanceParserEntries;
  capabilityRefs: ["incrementalStructureCache"];
  unavailableCapabilityReason: null;
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
  fullDocumentParse: number;
  incrementalParseWindow: number;
  cacheHit: number;
  invalidatedNodes: number;
};

type MeasuredOperation<T> = {
  operation: EditorPerformanceOperationResult;
  value: T;
};

export function measureEditorPerformanceProbe(input: {
  source: string;
}): EditorPerformanceProbeReport {
  const host = document.createElement("div");
  const resources: { view: EditorView | null } = { view: null };

  try {
    document.body.appendChild(host);
    const stats: ProbeStats = {
      parseOrderedListNormalization: 0,
      parseMarkdownDocument: 0,
      decorationRebuild: 0,
      fullDocumentParse: 0,
      incrementalParseWindow: 0,
      cacheHit: 0,
      invalidatedNodes: 0
    };
    const instrumentation: MarkdownParseInstrumentation = {
      onFullDocumentParse: () => {
        stats.fullDocumentParse += 1;
      }
    };
    const open = measureOperation(stats, "open", () => {
      const openedView = new EditorView({
        state: EditorState.create({
          doc: input.source,
          extensions: [editorStructureObserver.of({
            instrumentation,
            onUpdate: (update) => {
              if (update === null) stats.cacheHit += 1;
              else {
                stats.incrementalParseWindow += update.window === null ? 0 : 1;
                stats.invalidatedNodes += update.reparsedNodes;
              }
            }
          }), ...createFishMarkMarkdownExtensions({
            onBlockDecorationsBuilt: () => {
              stats.decorationRebuild += 1;
            },
            onContentChange: () => {}
          })]
        }),
        parent: host
      });

      resources.view = openedView;
      return openedView;
    });
    const activeView = open.value;
    const operations: EditorPerformanceOperationResult[] = [
      open.operation,
      measureOperation(stats, "edit", () => {
        const paragraphOffset = activeView.state.doc.toString().indexOf("Paragraph");
        const insertionOffset =
          paragraphOffset >= 0 ? paragraphOffset : activeView.state.doc.length;

        activeView.dispatch({
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
        activeView.dispatch({
          selection: {
            anchor: Math.floor(activeView.state.doc.length / 2)
          }
        });
      }).operation,
      measureOperation(stats, "orderedListEdit", () => {
        const source = activeView.state.doc.toString();
        const orderedItemOffset = source.indexOf("Ordered item");
        const insertionOffset =
          orderedItemOffset >= 0 ? orderedItemOffset : activeView.state.doc.length;

        activeView.dispatch({
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
    try {
      resources.view?.destroy();
    } finally {
      host.remove();
    }
  }
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
    parseOrderedListNormalization: stats.parseOrderedListNormalization - before.parseOrderedListNormalization
  };

  return {
    operation: {
      name,
      durationMs: now() - startedAt,
      counters: {
        fullParse: stats.fullDocumentParse - before.fullDocumentParse,
        incrementalParseWindow: stats.incrementalParseWindow - before.incrementalParseWindow,
        cacheHit: stats.cacheHit - before.cacheHit,
        invalidatedNodes: stats.invalidatedNodes - before.invalidatedNodes,
        decorationRebuild: stats.decorationRebuild - before.decorationRebuild
      },
      parserEntries,
      capabilityRefs: ["incrementalStructureCache"],
      unavailableCapabilityReason: null
    },
    value
  };
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}




