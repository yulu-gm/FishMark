import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";

import {
  findCanonicalBlockquoteStructuralSeparatorAt,
  findCanonicalPreviousBlockquoteStructuralSeparator,
  type BlockquoteStructuralSeparator
} from "./blockquote-structural-separators";
import {
  createSemanticEditingDocument,
  type EditingLine,
  type SemanticLine
} from "./semantic-editing-document";

export type StructuralLineRole =
  | "editable-content"
  | "editable-empty"
  | "structural-separator"
  | "extra-blank"
  | "hidden-marker-line";

export type StructuralLineSeparator = {
  lineNumber: number;
  lineStartOffset: number;
  lineEndOffset: number;
  lineBreakTo: number;
  previousBlockEnd: number | null;
  nextBlockStart: number | null;
};

export type StructuralLineModel = {
  getLineRole: (lineNumber: number) => StructuralLineRole;
  getLineAtOffset: (offset: number) => EditingLine | null;
  findPreviousEditableLine: (offset: number, goalColumn?: number) => EditingLine | null;
  findNextEditableLine: (offset: number, goalColumn?: number) => EditingLine | null;
  findSeparatorAt: (offset: number) => StructuralLineSeparator | null;
  findSeparatorBeforeLine: (lineStartOffset: number) => StructuralLineSeparator | null;
};

export function createStructuralLineModel(
  snapshot: EditorDerivedSnapshot
): StructuralLineModel {
  const physicalDocument = createSemanticEditingDocument(snapshot.document, snapshot);
  const semanticLines = physicalDocument.semanticLineMap.lines;
  const lineIndexes = new Map(semanticLines.map((line, index) => [line.line.number, index]));

  const getLineRole = (lineNumber: number): StructuralLineRole => {
    const semanticLine = physicalDocument.semanticLineMap.byLineNumber.get(lineNumber);

    if (!semanticLine) {
      return "editable-empty";
    }

    return resolveStructuralLineRole(snapshot, semanticLine);
  };

  const isEditableLine = (line: EditingLine): boolean => {
    const role = getLineRole(line.number);

    return role !== "structural-separator" && role !== "hidden-marker-line";
  };

  const findPreviousEditableLine = (offset: number): EditingLine | null => {
    const line = physicalDocument.getLineAtOffset(offset);
    if (!line) {
      return null;
    }

    const lineIndex = lineIndexes.get(line.number);
    if (lineIndex === undefined) {
      return null;
    }

    for (let index = lineIndex - 1; index >= 0; index -= 1) {
      const candidate = semanticLines[index]?.line;

      if (candidate && isEditableLine(candidate)) {
        return candidate;
      }
    }

    return null;
  };

  const findNextEditableLine = (offset: number): EditingLine | null => {
    const line = physicalDocument.getLineAtOffset(offset);
    if (!line) {
      return null;
    }

    const lineIndex = lineIndexes.get(line.number);
    if (lineIndex === undefined) {
      return null;
    }

    for (let index = lineIndex + 1; index < semanticLines.length; index += 1) {
      const candidate = semanticLines[index]?.line;

      if (candidate && isEditableLine(candidate)) {
        return candidate;
      }
    }

    return null;
  };

  const findSeparatorAt = (offset: number): StructuralLineSeparator | null => {
    const line = physicalDocument.getLineAtOffset(offset);

    return line ? findSeparatorOnLine(snapshot, semanticLines, line) : null;
  };

  const findSeparatorBeforeLine = (lineStartOffset: number): StructuralLineSeparator | null => {
    const quoteSeparator = findCanonicalPreviousBlockquoteStructuralSeparator(snapshot, lineStartOffset);

    if (quoteSeparator) {
      return toStructuralLineSeparator(quoteSeparator, semanticLines);
    }

    const lineIndex = semanticLines.findIndex((line) => line.line.from === lineStartOffset);
    if (lineIndex <= 0) {
      return null;
    }

    return findBodySeparatorOnLine(snapshot, semanticLines[lineIndex - 1] ?? null);
  };

  return {
    getLineRole,
    getLineAtOffset: physicalDocument.getLineAtOffset,
    findPreviousEditableLine,
    findNextEditableLine,
    findSeparatorAt,
    findSeparatorBeforeLine
  };
}

export function resolveStructuralLineDeleteRange(
  source: string,
  separator: StructuralLineSeparator
): { from: number; to: number } {
  const lineBreakEnd = getLineBreakEndAfter(source, separator.lineEndOffset);

  if (lineBreakEnd > separator.lineEndOffset) {
    return {
      from: separator.lineStartOffset,
      to: lineBreakEnd
    };
  }

  if (separator.lineStartOffset > 0) {
    return {
      from: getLineBreakStartBefore(source, separator.lineStartOffset),
      to: separator.lineEndOffset
    };
  }

  return {
    from: separator.lineStartOffset,
    to: separator.lineEndOffset
  };
}

function resolveStructuralLineRole(
  snapshot: EditorDerivedSnapshot,
  semanticLine: SemanticLine
): StructuralLineRole {
  if (findBlockquoteSeparatorOnLine(snapshot, semanticLine.line)) {
    return "structural-separator";
  }

  if (isEditableEmptyBlockquoteLine(snapshot, semanticLine.line)) {
    return "editable-empty";
  }

  if (semanticLine.role === "structural-separator") {
    return "structural-separator";
  }

  if (semanticLine.role === "extra-blank") {
    return "extra-blank";
  }

  if (semanticLine.line.kind === "empty" || semanticLine.line.kind === "whitespace") {
    return "editable-empty";
  }

  return "editable-content";
}

function findSeparatorOnLine(
  snapshot: EditorDerivedSnapshot,
  semanticLines: readonly SemanticLine[],
  line: EditingLine
): StructuralLineSeparator | null {
  const quoteSeparator = findBlockquoteSeparatorOnLine(snapshot, line);

  if (quoteSeparator) {
    return toStructuralLineSeparator(quoteSeparator, semanticLines);
  }

  const semanticLine = semanticLines.find((candidate) => candidate.line.number === line.number);

  return findBodySeparatorOnLine(snapshot, semanticLine ?? null);
}

function findBodySeparatorOnLine(
  snapshot: EditorDerivedSnapshot,
  semanticLine: SemanticLine | null
): StructuralLineSeparator | null {
  if (!semanticLine || semanticLine.role !== "structural-separator") {
    return null;
  }

  const line = semanticLine.line;

  return {
    lineNumber: line.number,
    lineStartOffset: line.from,
    lineEndOffset: line.to,
    lineBreakTo: line.lineBreakTo,
    previousBlockEnd: findPreviousBlockEnd(snapshot, line),
    nextBlockStart: findNextBlockStart(snapshot, line)
  };
}

function findBlockquoteSeparatorOnLine(
  snapshot: EditorDerivedSnapshot,
  line: EditingLine
): BlockquoteStructuralSeparator | null {
  const separator = findCanonicalBlockquoteStructuralSeparatorAt(snapshot, line.from);

  if (!separator || separator.lineStartOffset !== line.from) {
    return null;
  }

  return separator;
}

function toStructuralLineSeparator(
  separator: BlockquoteStructuralSeparator,
  semanticLines: readonly SemanticLine[]
): StructuralLineSeparator {
  const line = semanticLines.find((candidate) => candidate.line.from === separator.lineStartOffset)?.line;

  return {
    lineNumber: line?.number ?? 1,
    lineStartOffset: separator.lineStartOffset,
    lineEndOffset: line?.to ?? separator.lineEndOffset,
    lineBreakTo: line?.lineBreakTo ?? separator.lineEndOffset,
    previousBlockEnd: separator.previousBlockEnd,
    nextBlockStart: separator.nextBlockStart
  };
}

function isEditableEmptyBlockquoteLine(
  snapshot: EditorDerivedSnapshot,
  line: EditingLine
): boolean {
  const physicalLine = snapshot.document.lineAtOffset(line.from);

  if (physicalLine === null) {
    return false;
  }

  const quoteDepth = physicalLine.segments.reduce(
    (count, segment) => segment.kind === "quote-marker" ? count + 1 : count,
    0
  );

  return quoteDepth > 0 && physicalLine.contentEndOffset === physicalLine.contentStartOffset;
}

function rootNodesOf(snapshot: EditorDerivedSnapshot): readonly MarkdownNode[] {
  return childrenOf(snapshot.tree.root);
}

function findPreviousBlockEnd(snapshot: EditorDerivedSnapshot, line: EditingLine): number | null {
  return [...rootNodesOf(snapshot)]
    .reverse()
    .find((node) => node.source.endOffset <= line.from)?.source.endOffset ?? null;
}

function findNextBlockStart(snapshot: EditorDerivedSnapshot, line: EditingLine): number | null {
  return rootNodesOf(snapshot).find((node) => node.source.startOffset >= line.lineBreakTo)?.source.startOffset ?? null;
}

function getLineBreakEndAfter(source: string, lineEndOffset: number): number {
  if (source.slice(lineEndOffset, lineEndOffset + 2) === "\r\n") {
    return lineEndOffset + 2;
  }

  if (source[lineEndOffset] === "\n") {
    return lineEndOffset + 1;
  }

  return lineEndOffset;
}

function getLineBreakStartBefore(source: string, lineStartOffset: number): number {
  if (lineStartOffset >= 2 && source.slice(lineStartOffset - 2, lineStartOffset) === "\r\n") {
    return lineStartOffset - 2;
  }

  return Math.max(0, lineStartOffset - 1);
}
