import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";

export type SemanticLineRole =
  | "paragraph"
  | "heading"
  | "list-item"
  | "list-continuation"
  | "blockquote"
  | "code-fence-boundary"
  | "code-fence-content"
  | "math-block-boundary"
  | "math-block-content"
  | "table-source"
  | "thematic-break"
  | "definition"
  | "html-image"
  | "structural-separator"
  | "extra-blank"
  | "unparsed-text";

export type SemanticLineInput = {
  readonly number: number;
  readonly kind: "empty" | "whitespace" | "text";
  readonly from: number;
  readonly lineBreakTo: number;
  readonly text: string;
};

// Only the facts the role decision needs: the owning node, its source range, its line span and, for
// lists, the start line of every item.
type CanonicalBlock = {
  readonly node: MarkdownNode;
  readonly startLine: number;
  readonly endLine: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly itemStartLines: readonly number[];
};

/**
 * Resolves every physical line's semantic role from the canonical tree, so line presentation and
 * navigation no longer re-derive block structure from the rich projection. The decision table
 * mirrors the previous projection-based one exactly, and `canonical-semantic-lines.test.ts` pins
 * both implementations together over a shared corpus.
 */
export function createCanonicalSemanticLineRoles(
  lines: readonly SemanticLineInput[],
  snapshot: EditorDerivedSnapshot
): readonly SemanticLineRole[] {
  const blocks = createCanonicalBlocks(snapshot);

  return lines.map((line) =>
    resolveSemanticLineRole(line, findBlockForLine(blocks, line.number), blocks, lines)
  );
}

function createCanonicalBlocks(snapshot: EditorDerivedSnapshot): readonly CanonicalBlock[] {
  const lineNumberAt = (offset: number): number => snapshot.lineAt(offset)?.lineNumber ?? 1;

  return childrenOf(snapshot.tree.root).map((node) => ({
    node,
    startLine: lineNumberAt(node.source.startOffset),
    endLine: lineNumberAt(Math.max(node.source.startOffset, node.source.endOffset - 1)),
    startOffset: node.source.startOffset,
    endOffset: node.source.endOffset,
    itemStartLines: node.kind === "list"
      ? childrenOf(node).map((item) => lineNumberAt(item.source.startOffset))
      : []
  }));
}

function findBlockForLine(blocks: readonly CanonicalBlock[], lineNumber: number): CanonicalBlock | null {
  const block = blocks[upperBound(blocks, lineNumber, (entry) => entry.startLine) - 1];

  return block && lineNumber <= block.endLine ? block : null;
}

function resolveSemanticLineRole(
  line: SemanticLineInput,
  block: CanonicalBlock | null,
  blocks: readonly CanonicalBlock[],
  lines: readonly SemanticLineInput[]
): SemanticLineRole {
  if (!block) {
    if (line.kind === "text") {
      return "unparsed-text";
    }

    return isStructuralSeparator(line, blocks, lines) ? "structural-separator" : "extra-blank";
  }

  switch (block.node.kind) {
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "list":
      return block.itemStartLines[upperBound(block.itemStartLines, line.number, (startLine) => startLine) - 1] === line.number
        ? "list-item"
        : "list-continuation";
    case "blockquote":
      return "blockquote";
    case "code-fence":
      return line.number === block.startLine || isCodeFenceClosingLine(line, block, lines)
        ? "code-fence-boundary"
        : "code-fence-content";
    case "block-math":
      return line.number === block.startLine || (isClosedMathBlock(block.node) && line.number === block.endLine)
        ? "math-block-boundary"
        : "math-block-content";
    case "definition":
      return "definition";
    case "thematic-break":
      return "thematic-break";
    case "html-image":
      return "html-image";
    case "table":
      return "table-source";
    case "document":
    case "list-item":
      // Neither kind can own a top-level line; keep the blank/unparsed decision.
      return line.kind === "text" ? "unparsed-text" : "extra-blank";
  }
}

function isCodeFenceClosingLine(
  line: SemanticLineInput,
  block: CanonicalBlock,
  lines: readonly SemanticLineInput[]
): boolean {
  if (line.number !== block.endLine) {
    return false;
  }

  const openingLine = lines.find((candidate) => candidate.number === block.startLine);
  const openingFence = openingLine ? readOpeningFence(openingLine.text) : null;

  if (!openingFence) {
    return false;
  }

  const closingFencePattern = new RegExp(
    `^ {0,3}${openingFence.marker}{${openingFence.length},}[ \\t]*$`,
    "u"
  );

  return closingFencePattern.test(line.text);
}

function readOpeningFence(text: string): { marker: "`" | "~"; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(text);
  const marker = match?.[1];

  if (!marker) {
    return null;
  }

  return {
    marker: marker[0] as "`" | "~",
    length: marker.length
  };
}

function isClosedMathBlock(node: MarkdownNode): boolean {
  return node.data.kind === "block-math" && node.data.closed;
}

function isStructuralSeparator(
  line: SemanticLineInput,
  blocks: readonly CanonicalBlock[],
  lines: readonly SemanticLineInput[]
): boolean {
  if (line.kind !== "empty" || blocks.length === 0) {
    return false;
  }

  const nextIndex = upperBound(blocks, line.number, (block) => block.startLine);
  const nextBlock = blocks[nextIndex]?.startLine === line.number + 1 ? blocks[nextIndex] : undefined;

  if (nextBlock && nextBlock.node.kind !== "paragraph" && nextBlock.node.kind !== "definition") {
    return true;
  }

  if (blocks.length < 2) {
    return false;
  }

  const previousBlock = blocks[upperBound(blocks, line.from, (block) => block.endOffset) - 1];
  const hasNextBlock = blocks[blocks.length - 1]!.startOffset >= line.lineBreakTo;

  if (!previousBlock || !hasNextBlock) {
    return false;
  }

  const previousLineBreakCount = upperBound(lines, line.from, (candidate) => candidate.lineBreakTo) -
    upperBound(lines, previousBlock.endOffset, (candidate) => candidate.lineBreakTo);

  return previousLineBreakCount === 1;
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
