import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

export type BlockquoteStructuralSeparator = {
  blankLineStart: number;
  lineEndOffset: number;
  lineStartOffset: number;
  nextBlockStart: number | null;
  previousBlockEnd: number | null;
};

// Blockquote structural separators (a bare `>` line between two quote inner blocks) resolved from
// the canonical tree and the model's physical lines, so navigation never reads the rich projection.
export function findCanonicalBlockquoteStructuralSeparatorAt(
  snapshot: EditorDerivedSnapshot,
  anchor: number
): BlockquoteStructuralSeparator | null {
  for (const node of childrenOf(snapshot.tree.root)) {
    if (node.kind !== "blockquote") {
      continue;
    }

    const lines = quoteLinesOf(snapshot, node);
    for (const [index, line] of lines.entries()) {
      if (anchor < line.range.startOffset || anchor > line.contentEndOffset) {
        continue;
      }

      const separator = resolveCanonicalSeparator(snapshot, node, lines, index);
      if (separator) {
        return separator;
      }
    }
  }

  return null;
}

export function findCanonicalPreviousBlockquoteStructuralSeparator(
  snapshot: EditorDerivedSnapshot,
  lineStartOffset: number
): BlockquoteStructuralSeparator | null {
  for (const node of childrenOf(snapshot.tree.root)) {
    if (node.kind !== "blockquote") {
      continue;
    }

    const lines = quoteLinesOf(snapshot, node);
    const lineIndex = lines.findIndex((line) => line.range.startOffset === lineStartOffset);

    if (lineIndex <= 0) {
      continue;
    }

    const separator = resolveCanonicalSeparator(snapshot, node, lines, lineIndex - 1);
    if (separator) {
      return separator;
    }
  }

  return null;
}

function quoteLinesOf(
  snapshot: EditorDerivedSnapshot,
  node: MarkdownNode
): readonly PhysicalLine[] {
  return snapshot.document.lineForNode(node).filter((line) => countQuoteMarkers(line) > 0);
}

function countQuoteMarkers(line: PhysicalLine): number {
  return line.segments.reduce((count, segment) => segment.kind === "quote-marker" ? count + 1 : count, 0);
}

function resolveCanonicalSeparator(
  snapshot: EditorDerivedSnapshot,
  node: MarkdownNode,
  lines: readonly PhysicalLine[],
  lineIndex: number
): BlockquoteStructuralSeparator | null {
  const line = lines[lineIndex];
  const innerNodes = childrenOf(node);

  if (line === undefined || !isEmptyQuoteLine(line) || innerNodes.length < 2) {
    return null;
  }

  // Inner offsets follow the projection's rule: paragraphs and headings keep their content range,
  // every other block inside a quote reports the whole source lines it covers.
  const lineStartOf = (offset: number): number => snapshot.lineAt(offset)?.range.startOffset ?? offset;
  const lineContentEndOf = (offset: number): number =>
    snapshot.lineAt(Math.max(0, offset - 1))?.contentRange.endOffset ?? offset;
  const startOf = (inner: MarkdownNode): number =>
    inner.kind === "paragraph" || inner.kind === "heading" ? inner.source.startOffset : lineStartOf(inner.source.startOffset);
  const endOf = (inner: MarkdownNode): number =>
    inner.kind === "paragraph" || inner.kind === "heading" ? inner.source.endOffset : lineContentEndOf(inner.source.endOffset);
  const contentEndOffset = line.contentRange.endOffset;
  const previousNode = [...innerNodes].reverse().find((inner) => endOf(inner) <= line.range.startOffset);
  const nextNode = innerNodes.find((inner) => startOf(inner) >= contentEndOffset);

  if (!previousNode || !nextNode) {
    return null;
  }

  const previousBlockEnd = endOf(previousNode);
  const hasEarlierSeparatorInSameGap = lines.slice(0, lineIndex).some(
    (candidate) =>
      candidate.range.startOffset > previousBlockEnd &&
      candidate.range.startOffset < line.range.startOffset &&
      isEmptyQuoteLine(candidate)
  );

  if (hasEarlierSeparatorInSameGap) {
    return null;
  }

  return {
    blankLineStart: line.range.startOffset,
    // The legacy line geometry ends a line before its break (so a CRLF line keeps its CR);
    // consumers replace this with the CR-trimmed content end, but the raw value stays identical.
    lineEndOffset: snapshot.source[line.range.endOffset - 1] === "\n" ? line.range.endOffset - 1 : line.range.endOffset,
    lineStartOffset: line.range.startOffset,
    nextBlockStart: startOf(nextNode),
    previousBlockEnd
  };
}

function isEmptyQuoteLine(line: PhysicalLine): boolean {
  return line.contentEndOffset === line.contentStartOffset;
}
