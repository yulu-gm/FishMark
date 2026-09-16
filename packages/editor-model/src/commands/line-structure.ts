import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import type { PrefixSegment } from "../physical-lines/prefix-segment";

// Shared line-level structure helpers for the semantic commands. They read only the semantic
// context: prefix segments, physical lines, and the recursive tree.

export function linePrefixText(line: PhysicalLine): string {
  return line.segments.map((segment: PrefixSegment) => segment.text).join("");
}

// The containers a line belongs to, from the document down to its deepest node. Lines are
// matched by overlap so an empty container line still resolves to that container.
export function lineContainerChain(
  context: EditorSemanticContext,
  line: PhysicalLine
): readonly MarkdownNode[] {
  const chain: MarkdownNode[] = [context.snapshot.tree.root];
  let current: MarkdownNode = context.snapshot.tree.root;

  for (;;) {
    const children = childrenOf(current);
    const next: MarkdownNode | undefined =
      children.find(
        (child) =>
          child.source.startOffset >= line.range.startOffset &&
          child.source.startOffset < line.range.endOffset
      ) ??
      children.find(
        (child) =>
          child.source.startOffset < line.contentEndOffset &&
          child.source.endOffset > line.range.startOffset
      );

    if (next === undefined) {
      return chain;
    }

    chain.push(next);
    current = next;
  }
}

export function lastOfKind(chain: readonly MarkdownNode[], kind: MarkdownNode["kind"]): MarkdownNode | null {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (chain[index]!.kind === kind) {
      return chain[index]!;
    }
  }

  return null;
}

export function parentOf(context: EditorSemanticContext, node: MarkdownNode): MarkdownNode | null {
  if (node.path.length === 0) {
    return null;
  }

  let current: MarkdownNode = context.snapshot.tree.root;
  for (let depth = 0; depth < node.path.length - 1; depth += 1) {
    const next: MarkdownNode | undefined = childrenOf(current)[node.path[depth] ?? -1];
    if (next === undefined) {
      return null;
    }

    current = next;
  }

  return current;
}

export type ListItemPrefix = {
  readonly startOffset: number;
  readonly ancestorText: string;
  readonly indentationText: string;
  readonly markerText: string;
  readonly markerSpacingText: string;
  readonly taskText: string;
};

// The deepest item's own prefix is its marker run plus the indentation that positions it under
// its parent. Everything before that belongs to the enclosing containers.
export function listItemPrefix(
  line: PhysicalLine,
  context: EditorSemanticContext,
  item: MarkdownNode
): ListItemPrefix {
  const segments = line.segments;
  let markerIndex = -1;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]!.kind === "list-marker") {
      markerIndex = index;
      break;
    }
  }

  if (markerIndex === -1) {
    return {
      startOffset: line.contentStartOffset,
      ancestorText: linePrefixText(line),
      indentationText: "",
      markerText: "",
      markerSpacingText: "",
      taskText: ""
    };
  }

  const indentIndex = markerIndex > 0 && segments[markerIndex - 1]!.kind === "indentation"
    ? markerIndex - 1
    : markerIndex;
  const startOffset = segments[indentIndex]!.range.startOffset;
  const ancestorText = context.source.slice(line.range.startOffset, startOffset);
  const indentationText = segments[indentIndex]!.kind === "indentation" ? segments[indentIndex]!.text : "";
  const markerText = segments[markerIndex]!.text;
  let markerSpacingText = "";
  let taskText = "";

  for (let index = markerIndex + 1; index < segments.length; index += 1) {
    const segment = segments[index]!;

    if (segment.kind === "spacing" && taskText.length === 0) {
      markerSpacingText += segment.text;
      continue;
    }

    if (segment.kind === "task-marker") {
      taskText += segment.text;
      continue;
    }

    if (segment.kind === "spacing") {
      taskText += segment.text;
      continue;
    }

    break;
  }

  void item;

  return {
    startOffset,
    ancestorText,
    indentationText,
    markerText,
    markerSpacingText: markerSpacingText.length === 0 ? " " : markerSpacingText,
    taskText
  };
}

export type QuotePrefix = {
  readonly text: string;
  readonly lastMarkerStartOffset: number | null;
};

export function blockquotePrefix(line: PhysicalLine): QuotePrefix {
  const quoteSegments = line.segments.filter(
    (segment) => segment.kind === "quote-marker" || segment.kind === "spacing" || segment.kind === "indentation"
  );
  const lastQuoteMarker = [...line.segments].reverse().find((segment) => segment.kind === "quote-marker");

  return {
    text: quoteSegments.map((segment) => segment.text).join(""),
    lastMarkerStartOffset: lastQuoteMarker?.range.startOffset ?? null
  };
}

// Where indentation belongs on a line: after the enclosing quote and parent prefixes, never
// before them.
export function indentationAnchor(line: PhysicalLine): number {
  const segments = line.segments;
  let markerIndex = -1;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]!.kind === "list-marker") {
      markerIndex = index;
      break;
    }
  }

  if (markerIndex >= 0) {
    const indentIndex = markerIndex > 0 && segments[markerIndex - 1]!.kind === "indentation"
      ? markerIndex - 1
      : markerIndex;

    return segments[indentIndex]!.range.startOffset;
  }

  let offset = line.range.startOffset;

  for (const segment of segments) {
    if (segment.kind !== "quote-marker" && segment.kind !== "spacing" && segment.kind !== "indentation") {
      break;
    }

    offset = segment.range.endOffset;
  }

  return offset;
}

export function nextListMarker(
  context: EditorSemanticContext,
  item: MarkdownNode,
  currentMarker: string
): string {
  const list = deepestAncestorOfKind(context, item, "list");

  if (list === null || list.data.kind !== "list" || !list.data.ordered) {
    // Unordered and task items keep their own marker character.
    return currentMarker.length === 0 ? "-" : currentMarker.replace(/\d+/u, "1");
  }

  const index = childrenOf(list).indexOf(item);
  const start = list.data.startOrdinal ?? 1;
  const delimiter = list.data.delimiter ?? ".";

  return `${start + Math.max(index, 0) + 1}${delimiter}`;
}

export function createTableRowSkeleton(context: EditorSemanticContext, table: MarkdownNode): string | null {
  if (table.data.kind !== "table" || table.data.columnCount <= 0) {
    return null;
  }

  const firstLine = context.lineAt(table.source.startOffset);
  const usesOuterPipes = firstLine !== null &&
    context.source.slice(firstLine.range.startOffset, firstLine.contentEndOffset).trimStart().startsWith("|");
  const cells = Array.from({ length: table.data.columnCount }, () => "  ");

  return usesOuterPipes ? `|${cells.join("|")}|` : cells.join("|");
}

export function isLastLineOfNode(line: PhysicalLine, node: MarkdownNode): boolean {
  return line.contentEndOffset >= node.source.endOffset ||
    node.source.endOffset <= line.range.endOffset;
}

export function deepestAncestorOfKind(
  context: EditorSemanticContext,
  node: MarkdownNode | null,
  kind: MarkdownNode["kind"]
): MarkdownNode | null {
  if (node === null) {
    return null;
  }

  let current: MarkdownNode | null = node;
  while (current !== null) {
    if (current.kind === kind) {
      return current;
    }

    current = parentOf(context, current);
  }

  return null;
}

export function isKind(node: MarkdownNode | null, kind: MarkdownNode["kind"]): boolean {
  return node !== null && node.kind === kind;
}


