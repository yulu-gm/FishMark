import { childrenOf, isMarkdownLeafNode, type MarkdownNode } from "@fishmark/markdown-engine";
import {
  getInactiveBlockquoteLines,
  type EditorDerivedSnapshot,
  type InactiveBlockquoteLine
} from "@fishmark/editor-model";

// Canonical replacements for the rich projection's top-level block queries. The interaction layer
// used to walk `MarkdownDocument.blocks`; these read the same root-level nodes off the snapshot, so
// no second document tree is needed. Geometry matches the projection: a block's line span comes from
// its own source range and the visible entry anchor from its markers/container content.
export type BlockEntryDirection = "start" | "end";

function rootBlockNodes(snapshot: EditorDerivedSnapshot): readonly MarkdownNode[] {
  return childrenOf(snapshot.tree.root);
}

export function resolveBlockStartLine(snapshot: EditorDerivedSnapshot, node: MarkdownNode): number {
  return snapshot.lineAt(node.source.startOffset)?.lineNumber ?? 1;
}

export function resolveBlockEndLine(snapshot: EditorDerivedSnapshot, node: MarkdownNode): number {
  return snapshot.lineAt(node.source.endOffset)?.lineNumber ?? 1;
}

export function findBlockForLine(
  snapshot: EditorDerivedSnapshot,
  lineNumber: number
): MarkdownNode | null {
  for (const node of rootBlockNodes(snapshot)) {
    if (lineNumber >= resolveBlockStartLine(snapshot, node) && lineNumber <= resolveBlockEndLine(snapshot, node)) {
      return node;
    }
  }

  return null;
}

export function findBlockStartingAtOffset(
  snapshot: EditorDerivedSnapshot,
  startOffset: number
): MarkdownNode | null {
  return rootBlockNodes(snapshot).find((node) => node.source.startOffset === startOffset) ?? null;
}

export function findBlockEndingAtOffset(
  snapshot: EditorDerivedSnapshot,
  endOffset: number
): MarkdownNode | null {
  return rootBlockNodes(snapshot).find((node) => node.source.endOffset === endOffset) ?? null;
}

export function findBlockEndingOnLine(
  snapshot: EditorDerivedSnapshot,
  lineNumber: number
): MarkdownNode | null {
  return [...rootBlockNodes(snapshot)].reverse()
    .find((node) => resolveBlockEndLine(snapshot, node) === lineNumber) ?? null;
}

export function findBlockStartingOnLine(
  snapshot: EditorDerivedSnapshot,
  lineNumber: number
): MarkdownNode | null {
  return rootBlockNodes(snapshot)
    .find((node) => resolveBlockStartLine(snapshot, node) === lineNumber) ?? null;
}

export function isTableBlockNode(node: MarkdownNode | null): boolean {
  return node !== null && isMarkdownLeafNode(node) && node.data.kind === "table";
}

// The blockquote's own lines, keyed by the physical line each one starts on. The range is widened to
// whole lines the way the projection's line ranges were, so an indented quote still reports the line
// start the pointer/selection actually points at.
export function getCanonicalBlockquoteLineInfos(
  snapshot: EditorDerivedSnapshot,
  node: MarkdownNode
): readonly InactiveBlockquoteLine[] {
  const first = snapshot.lineAt(node.source.startOffset);
  const last = snapshot.lineAt(node.source.endOffset);
  const start = first?.range.startOffset ?? node.source.startOffset;
  const end = Math.max(start, last?.contentRange.endOffset ?? node.source.endOffset);

  return getInactiveBlockquoteLines(start, end, snapshot.source);
}

export function resolveVisibleBlockEntryAnchor(
  snapshot: EditorDerivedSnapshot,
  node: MarkdownNode,
  direction: BlockEntryDirection
): number | null {
  switch (node.kind) {
    case "heading": {
      const markerEnd = node.markers.find((marker) => marker.kind === "heading")?.range.endOffset;

      return direction === "start" ? markerEnd ?? node.source.startOffset : node.source.endOffset;
    }
    case "paragraph":
      return direction === "start" ? node.source.startOffset : node.source.endOffset;
    case "thematic-break":
      return node.source.startOffset;
    case "blockquote": {
      const lines = getCanonicalBlockquoteLineInfos(snapshot, node);
      const line = direction === "start" ? lines[0] : lines.at(-1);

      return line?.contentStartOffset ?? node.source.startOffset;
    }
    case "list": {
      const item = direction === "start" ? findFirstListItem(node) : findLastListItem(node);

      return item === null ? node.source.startOffset : item.content.startOffset;
    }
    case "table": {
      if (!isMarkdownLeafNode(node) || node.data.kind !== "table") {
        return null;
      }

      const cell = direction === "start"
        ? node.data.header[0] ?? node.data.rows[0]?.[0] ?? null
        : node.data.rows.at(-1)?.at(-1) ?? node.data.header.at(-1) ?? null;

      return direction === "start"
        ? cell?.content.startOffset ?? node.source.startOffset
        : cell?.content.endOffset ?? node.source.endOffset;
    }
    case "html-image":
      return direction === "start" ? node.source.startOffset : node.source.endOffset;
    default:
      return null;
  }
}

function findFirstListItem(listNode: MarkdownNode): MarkdownNode | null {
  return childrenOf(listNode).find((child) => child.kind === "list-item") ?? null;
}

// Mirrors the projection's deepest-last-item walk: the last item wins unless it opens a nested list,
// in which case the last item of the innermost nested list is the visible entry point.
function findLastListItem(listNode: MarkdownNode): MarkdownNode | null {
  const lastItem = childrenOf(listNode).filter((child) => child.kind === "list-item").at(-1) ?? null;

  if (lastItem === null) {
    return null;
  }

  const lastNestedList = childrenOf(lastItem).filter((child) => child.kind === "list").at(-1);

  return lastNestedList === undefined ? lastItem : findLastListItem(lastNestedList) ?? lastItem;
}
