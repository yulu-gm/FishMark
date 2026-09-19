import {
  applyIncrementalEdit,
  createDocumentStructureCache,
  type DocumentStructureCache
} from "@fishmark/markdown-engine";

// Candidate-path performance evidence for the adapter's document structure cache. This probe
// exercises exactly the operations the CodeMirror adapter performs, so the counters describe the
// real candidate rather than a parallel model. It reports a fallback reason whenever the cache
// cannot prove stability, and never narrows a window to make a counter look better.

export type CandidateFixtureKind =
  | "document-start"
  | "plain-paragraph"
  | "long-paragraph"
  | "large-table"
  | "deep-containers"
  | "fence-and-reference";

export type CandidateEdit = {
  readonly name: string;
  readonly kind: CandidateFixtureKind;
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

export type CandidateOperationReport = {
  readonly name: string;
  readonly kind: CandidateFixtureKind;
  readonly durationMs: number;
  readonly fullParseCount: number;
  readonly parsedSourceLength: number;
  readonly reusedNodes: number;
  readonly reparsedNodes: number;
  readonly fallbackReason: string | null;
  readonly cacheRevision: number;
};

export type CandidatePerformanceReport = {
  readonly sourceLength: number;
  readonly lineCount: number;
  readonly coldParseMs: number;
  readonly operations: readonly CandidateOperationReport[];
};

export function measureCandidateStructureCache(input: {
  readonly source: string;
  readonly edits: readonly CandidateEdit[];
}): CandidatePerformanceReport {
  const startedAt = now();
  let cache: DocumentStructureCache = createDocumentStructureCache(input.source);
  const coldParseMs = now() - startedAt;
  const operations: CandidateOperationReport[] = [];

  for (const edit of input.edits) {
    const before = now();
    const result = applyIncrementalEdit(cache, {
      fromOffset: edit.from,
      toOffset: edit.to,
      insertedText: edit.insert
    });
    const durationMs = now() - before;
    cache = result.cache;
    operations.push(Object.freeze({
      name: edit.name,
      kind: edit.kind,
      durationMs,
      fullParseCount: result.stats.fullParseCount,
      parsedSourceLength: result.stats.parsedSourceLength,
      reusedNodes: result.stats.reusedNodes,
      reparsedNodes: result.stats.reparsedNodes,
      fallbackReason: result.stats.fallbackReason,
      cacheRevision: cache.revision
    }));
  }

  return Object.freeze({
    sourceLength: input.source.length,
    lineCount: countMarkdownLines(input.source),
    coldParseMs,
    operations: Object.freeze(operations)
  });
}

// The adapter's real placement rules, expressed as offsets into a fixture.
export function createCandidateEdits(input: {
  readonly source: string;
  readonly plainParagraphWord: string;
  readonly documentStartInsert: string;
}): readonly CandidateEdit[] {
  const paragraphOffset = input.source.indexOf(input.plainParagraphWord);
  const paragraphInsertAt = paragraphOffset < 0
    ? Math.min(1, input.source.length)
    : paragraphOffset + input.plainParagraphWord.length;
  const longParagraphOffset = input.source.indexOf("LONGPARAGRAPH");
  const tableOffset = input.source.indexOf("| A |");
  const deepOffset = input.source.indexOf("> ");
  const fenceOffset = input.source.indexOf("```ts");
  const edits: CandidateEdit[] = [
    {
      name: "document-start",
      kind: "document-start",
      from: 0,
      to: 0,
      insert: input.documentStartInsert
    },
    {
      name: "plain-paragraph",
      kind: "plain-paragraph",
      from: paragraphInsertAt,
      to: paragraphInsertAt,
      insert: "x"
    },
    {
      name: "long-paragraph",
      kind: "long-paragraph",
      from: longParagraphOffset < 0 ? paragraphInsertAt : longParagraphOffset + 4,
      to: longParagraphOffset < 0 ? paragraphInsertAt : longParagraphOffset + 4,
      insert: "y"
    },
    {
      name: "fence-and-reference",
      kind: "fence-and-reference",
      from: fenceOffset < 0 ? paragraphInsertAt : fenceOffset + 3,
      to: fenceOffset < 0 ? paragraphInsertAt : fenceOffset + 3,
      insert: "z"
    }
  ];
  if (tableOffset >= 0) {
    edits.push({
      name: "large-table",
      kind: "large-table",
      from: tableOffset,
      to: tableOffset,
      insert: "q"
    });
  }
  if (deepOffset >= 0) {
    edits.push({
      name: "deep-containers",
      kind: "deep-containers",
      from: deepOffset + 2,
      to: deepOffset + 2,
      insert: "d"
    });
  }
  return Object.freeze(edits);
}

export function countMarkdownLines(source: string): number {
  return source.length === 0 ? 0 : source.split("\n").length;
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}
