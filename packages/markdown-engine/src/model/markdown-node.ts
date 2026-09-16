import type { InlineRoot } from "../inline-ast";
import type { ContainerPath } from "./container-path";
import { containerPathDepth } from "./container-path";
import type { SourceMarker, SourceRange } from "./source-range";

// The recursive document model. Containers nest arbitrarily (blockquote inside list item
// inside blockquote, ...), so a node's kind alone never implies a fixed nesting position.
// Every node keeps both its full source (markers included) and its content source (container
// prefixes excluded), which is what makes container children parse like document children.

export type MarkdownContainerKind = "document" | "blockquote" | "list" | "list-item";

export type MarkdownLeafKind =
  | "heading"
  | "paragraph"
  | "code-fence"
  | "block-math"
  | "table"
  | "thematic-break"
  | "definition"
  | "html-image";

export type MarkdownNodeKind = MarkdownContainerKind | MarkdownLeafKind;

export type MarkdownTableAlignment = "left" | "center" | "right" | null;

export interface MarkdownHeadingData {
  readonly kind: "heading";
  readonly depth: number;
}

export interface MarkdownListData {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly startOrdinal: number | null;
  readonly delimiter: "." | ")" | null;
}

export interface MarkdownListItemData {
  readonly kind: "list-item";
  readonly marker: string;
  readonly checked: boolean | null;
}

export interface MarkdownCodeFenceData {
  readonly kind: "code-fence";
  readonly info: string | null;
  readonly closed: boolean;
}

export interface MarkdownBlockMathData {
  readonly kind: "block-math";
  readonly closed: boolean;
}

export interface MarkdownTableData {
  readonly kind: "table";
  readonly alignments: readonly MarkdownTableAlignment[];
}

export interface MarkdownPlainData {
  readonly kind: "document" | "blockquote" | "paragraph" | "thematic-break" | "definition" | "html-image";
}

export type MarkdownNodeData =
  | MarkdownHeadingData
  | MarkdownListData
  | MarkdownListItemData
  | MarkdownCodeFenceData
  | MarkdownBlockMathData
  | MarkdownTableData
  | MarkdownPlainData;

export interface MarkdownNodeBase {
  readonly id: string;
  readonly kind: MarkdownNodeKind;
  readonly path: ContainerPath;
  readonly depth: number;
  readonly source: SourceRange;
  readonly content: SourceRange;
  readonly markers: readonly SourceMarker[];
  readonly data: MarkdownNodeData;
}

export interface MarkdownContainerNode extends MarkdownNodeBase {
  readonly kind: MarkdownContainerKind;
  readonly children: readonly MarkdownNode[];
}

export interface MarkdownLeafNode extends MarkdownNodeBase {
  readonly kind: MarkdownLeafKind;
  readonly inline?: InlineRoot;
}

export type MarkdownNode = MarkdownContainerNode | MarkdownLeafNode;

const CONTAINER_KINDS: ReadonlySet<MarkdownNodeKind> = new Set<MarkdownNodeKind>([
  "document",
  "blockquote",
  "list",
  "list-item"
]);

export function isMarkdownContainerNode(
  node: MarkdownNode
): node is MarkdownContainerNode {
  return CONTAINER_KINDS.has(node.kind);
}

export function isMarkdownLeafNode(node: MarkdownNode): node is MarkdownLeafNode {
  return !CONTAINER_KINDS.has(node.kind);
}

export function isMarkdownContainerKind(kind: MarkdownNodeKind): kind is MarkdownContainerKind {
  return CONTAINER_KINDS.has(kind);
}

// A node's depth is exactly its container-path length, so the two can never disagree.
export function markdownNodeDepth(node: Pick<MarkdownNodeBase, "path">): number {
  return containerPathDepth(node.path);
}

export function collectMarkdownNodeMarkers(
  markers: readonly SourceMarker[],
  kind: SourceMarker["kind"]
): readonly SourceMarker[] {
  return markers.filter((marker) => marker.kind === kind);
}

export function createMarkdownContainerNode(input: {
  readonly id: string;
  readonly kind: MarkdownContainerKind;
  readonly path: ContainerPath;
  readonly source: SourceRange;
  readonly content: SourceRange;
  readonly markers: readonly SourceMarker[];
  readonly data: MarkdownNodeData;
  readonly children: readonly MarkdownNode[];
}): MarkdownContainerNode {
  assertNodeRanges(input.id, input.source, input.content);
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    path: input.path,
    depth: containerPathDepth(input.path),
    source: input.source,
    content: input.content,
    markers: Object.freeze([...input.markers]),
    data: input.data,
    children: Object.freeze([...input.children])
  });
}

export function createMarkdownLeafNode(input: {
  readonly id: string;
  readonly kind: MarkdownLeafKind;
  readonly path: ContainerPath;
  readonly source: SourceRange;
  readonly content: SourceRange;
  readonly markers: readonly SourceMarker[];
  readonly data: MarkdownNodeData;
  readonly inline?: InlineRoot;
}): MarkdownLeafNode {
  assertNodeRanges(input.id, input.source, input.content);
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    path: input.path,
    depth: containerPathDepth(input.path),
    source: input.source,
    content: input.content,
    markers: Object.freeze([...input.markers]),
    data: input.data,
    ...(input.inline === undefined ? {} : { inline: input.inline })
  });
}

function assertNodeRanges(id: string, source: SourceRange, content: SourceRange): void {
  if (content.startOffset < source.startOffset || content.endOffset > source.endOffset) {
    throw new Error(`Node '${id}' content range must be contained by its source range.`);
  }
}
