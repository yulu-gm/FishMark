import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import type {
  PhysicalEditingDocument as CanonicalPhysicalEditingDocument,
  PhysicalLine as CanonicalPhysicalLine
} from "../physical-lines/physical-editing-document";
import { createCanonicalSemanticLineRoles, type SemanticLineRole } from "./canonical-semantic-lines";

export type { SemanticLineRole };

export type EditingLineKind = "empty" | "whitespace" | "text";

export type EditingLine = {
  number: number;
  from: number;
  to: number;
  text: string;
  lineBreakTo: number;
  kind: EditingLineKind;
  isDocumentStart: boolean;
  isDocumentEnd: boolean;
};

export type SemanticLine = {
  line: EditingLine;
  role: SemanticLineRole;
};

export type SemanticLineMap = {
  lines: readonly SemanticLine[];
  byLineNumber: ReadonlyMap<number, SemanticLine>;
};

export type SemanticEditingDocument = {
  source: string;
  lines: readonly EditingLine[];
  semanticLineMap: SemanticLineMap;
  getLineAtOffset: (offset: number) => EditingLine | null;
};

/**
 * The canonical model owns line geometry and the canonical tree owns the semantic roles, so this
 * view never splits, trims or re-derives document structure: it pairs the model's lines with the
 * roles resolved from the same revision's tree.
 */
export function createSemanticEditingDocument(
  document: CanonicalPhysicalEditingDocument,
  snapshot: EditorDerivedSnapshot
): SemanticEditingDocument {
  const lastLineNumber = document.lines.at(-1)?.lineNumber ?? 0;
  const lines = document.lines.map((line) =>
    createEditingLine(document.source, line, lastLineNumber)
  );
  const semanticLineMap = createSemanticLineMap(lines, snapshot);

  return {
    source: document.source,
    lines,
    semanticLineMap,
    getLineAtOffset: (offset) => findLineAtOffset(lines, document.source, offset)
  };
}

function createEditingLine(
  source: string,
  line: CanonicalPhysicalLine,
  lastLineNumber: number
): EditingLine {
  const from = line.range.startOffset;
  const to = line.contentRange.endOffset;
  const text = source.slice(from, to);

  return {
    number: line.lineNumber,
    from,
    to,
    text,
    lineBreakTo: line.range.endOffset,
    kind: classifyEditingLine(text),
    isDocumentStart: line.lineNumber === 1,
    isDocumentEnd: line.lineNumber === lastLineNumber
  };
}

function classifyEditingLine(text: string): EditingLineKind {
  if (text.length === 0) {
    return "empty";
  }

  return /^[ \t]+$/u.test(text) ? "whitespace" : "text";
}

function findLineAtOffset(
  lines: readonly EditingLine[],
  source: string,
  offset: number
): EditingLine | null {
  const clampedOffset = Math.max(0, Math.min(offset, source.length));

  return lines[Math.max(0, upperBound(lines, clampedOffset, line => line.from) - 1)] ?? null;
}

function createSemanticLineMap(
  lines: readonly EditingLine[],
  snapshot: EditorDerivedSnapshot
): SemanticLineMap {
  const roles = createCanonicalSemanticLineRoles(lines, snapshot);
  const semanticLines = lines.map((line, index) => ({ line, role: roles[index]! }));

  return {
    lines: semanticLines,
    byLineNumber: new Map(semanticLines.map((line) => [line.line.number, line]))
  };
}

// Source-ordered blocks and physical lines have monotonic boundaries. Querying them directly
// avoids copying/scanning the entire document for each blank line in long documents.
function upperBound<T>(values: readonly T[], target: number, read: (value: T) => number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (read(values[middle]!) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
