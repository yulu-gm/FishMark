import type {
  ListBlock,
  ListItemBlock,
  MarkdownBlock
} from "../block-map";
import type { BlockMathBlock, TableBlock, TableCell as LegacyTableCell } from "../block-map";
import type { CodeBlockKind } from "../code-block";
import type { FootnoteDefinition, InlineReferenceDefinition, InlineRoot } from "../inline-ast";
import { childContainerPath, type ContainerPath } from "../model/container-path";
import { createNodeIdForSource } from "../model/document-tree";
import {
  createMarkdownContainerNode,
  createMarkdownLeafNode,
  type MarkdownLeafKind,
  type MarkdownNode,
  type MarkdownNodeData,
  type MarkdownTableAlignment,
  type MarkdownTableCell,
  type MarkdownTableRow
} from "../model/markdown-node";
import { createSourceRange, type SourceMarker, type SourceRange } from "../model/source-range";
import { parseInlineAst } from "../parse-inline-ast";

// Turning concrete leaf blocks into recursive nodes. Leaf classification itself lives in
// `leaf-blocks.ts`; this module owns the node-level concerns: identity, container paths,
// content ranges, marker metadata, inline attachment over container-masked source, and
// list-item geometry.

export interface LeafNodeContext {
  readonly source: string;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly maskedSource: string;
}

export function createLeafNodeContext(input: {
  readonly source: string;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly maskedSource: string;
}): LeafNodeContext {
  return {
    source: input.source,
    referenceDefinitions: input.referenceDefinitions,
    footnoteDefinitions: input.footnoteDefinitions,
    maskedSource: input.maskedSource
  };
}

// A leaf token can expand into several sibling blocks (table derivation, thematic-break
// splits), and a derived `list` block becomes a real container subtree.
export function createNodesFromBlocks(input: {
  readonly blocks: readonly MarkdownBlock[];
  readonly context: LeafNodeContext;
  readonly parentPath: ContainerPath;
  readonly startIndex: number;
}): MarkdownNode[] {
  return input.blocks.map((block, offset) =>
    createNodeFromBlock(block, childContainerPath(input.parentPath, input.startIndex + offset), input.context)
  );
}

export function createNodeFromBlock(
  block: MarkdownBlock,
  path: ContainerPath,
  context: LeafNodeContext
): MarkdownNode {
  if (block.type === "list") {
    return createListNode(block, path, context);
  }

  return createLeafNode(block, path, context);
}

function createListNode(block: ListBlock, path: ContainerPath, context: LeafNodeContext): MarkdownNode {
  const items = block.items.map((item, index) =>
    createListItemNode(item, childContainerPath(path, index), context)
  );
  const data: MarkdownNodeData = block.ordered
    ? { kind: "list", ordered: true, startOrdinal: block.startOrdinal, delimiter: block.delimiter }
    : { kind: "list", ordered: false, startOrdinal: null, delimiter: null };

  return createMarkdownContainerNode({
    id: createNodeIdForSource({ path, kind: "list", source: context.source.slice(block.startOffset, block.endOffset) }),
    kind: "list",
    path,
    source: createSourceRange(block.startOffset, block.endOffset),
    content: createSourceRange(block.startOffset, block.endOffset),
    markers: [],
    data,
    children: items
  });
}

function createListItemNode(
  item: ListItemBlock,
  path: ContainerPath,
  context: LeafNodeContext
): MarkdownNode {
  const children: MarkdownNode[] = item.children.map((child, index) =>
    createNodeFromBlock(child, childContainerPath(path, index), context)
  );
  const markers: SourceMarker[] = [
    { kind: "list-marker", range: createSourceRange(item.markerStart, item.markerEnd) }
  ];

  if (item.task) {
    markers.push({
      kind: "task-marker",
      range: createSourceRange(item.task.markerStart, item.task.markerEnd)
    });
  }

  return createMarkdownContainerNode({
    id: createNodeIdForSource({ path, kind: "list-item", source: context.source.slice(item.startOffset, item.endOffset) }),
    kind: "list-item",
    path,
    source: createSourceRange(item.startOffset, item.endOffset),
    content: createListItemContentRange({
      source: context.source,
      markerEnd: item.markerEnd,
      task: item.task,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      children
    }),
    markers,
    data: {
      kind: "list-item",
      marker: item.marker,
      checked: item.task ? item.task.checked : null,
      indent: item.indent
    },
    children
  });
}

function createLeafNode(block: MarkdownBlock, path: ContainerPath, context: LeafNodeContext): MarkdownNode {
  const kind = leafKindForBlock(block);
  const content = leafContentRange(block, context.source);
  const inline = createLeafInline(content, kind, context);
  const markers = leafMarkers(block, context.source);

  return createMarkdownLeafNode({
    id: createNodeIdForSource({
      path,
      kind,
      source: context.source.slice(block.startOffset, block.endOffset)
    }),
    kind,
    path,
    source: createSourceRange(block.startOffset, block.endOffset),
    content,
    markers,
    data: blockNodeData(block),
    ...(inline === undefined ? {} : { inline })
  });
}

function leafKindForBlock(block: MarkdownBlock): MarkdownLeafKind {
  if (block.type === "codeFence") return "code-fence";
  if (block.type === "blockMath") return "block-math";
  if (block.type === "thematicBreak") return "thematic-break";
  if (block.type === "htmlImage") return "html-image";
  if (block.type === "definition") return "definition";
  if (block.type === "table") return "table";
  if (block.type === "heading") return "heading";
  return "paragraph";
}

function leafMarkers(block: MarkdownBlock, source: string): readonly SourceMarker[] {
  if (block.type === "heading") {
    const range = resolveHeadingContentRange(block.startOffset, block.endOffset, source);
    return range.markerEnd > block.startOffset
      ? [{ kind: "heading", range: createSourceRange(block.startOffset, range.markerEnd) }]
      : [];
  }

  if (block.type === "thematicBreak") {
    return [{ kind: "thematic-break", range: createSourceRange(block.startOffset, block.endOffset) }];
  }

  if (block.type === "blockMath") {
    const markers: SourceMarker[] = [
      { kind: "fence", range: createSourceRange(block.markerStartOffset, block.markerEndOffset) }
    ];

    if (block.closingMarkerStartOffset !== null && block.closingMarkerEndOffset !== null) {
      markers.push({
        kind: "fence",
        range: createSourceRange(block.closingMarkerStartOffset, block.closingMarkerEndOffset)
      });
    }

    return markers;
  }

  return [];
}

function leafContentRange(block: MarkdownBlock, source: string): SourceRange {
  if (block.type === "heading") {
    const range = resolveHeadingContentRange(block.startOffset, block.endOffset, source);
    return createSourceRange(range.contentStartOffset, range.contentEndOffset);
  }

  if (block.type === "paragraph") {
    return createSourceRange(
      block.startOffset,
      trimTrailingCarriageReturn(source, block.startOffset, block.endOffset)
    );
  }

  if (block.type === "blockMath") {
    return createSourceRange(block.contentStartOffset, block.contentEndOffset);
  }

  return createSourceRange(block.startOffset, block.endOffset);
}

function createLeafInline(
  content: SourceRange,
  kind: MarkdownLeafKind,
  context: LeafNodeContext
): InlineRoot | undefined {
  if (kind !== "paragraph" && kind !== "heading") {
    return undefined;
  }

  return parseInlineAst(context.maskedSource, content.startOffset, content.endOffset, {
    referenceDefinitions: context.referenceDefinitions,
    footnoteDefinitions: context.footnoteDefinitions
  });
}

function blockNodeData(block: MarkdownBlock): MarkdownNodeData {
  if (block.type === "heading") {
    return { kind: "heading", depth: block.depth };
  }

  if (block.type === "codeFence") {
    return { kind: "code-fence", fence: fenceKind(block.kind), info: block.info };
  }

  if (block.type === "blockMath") {
    return blockMathNodeData(block);
  }

  if (block.type === "thematicBreak") {
    return { kind: "thematic-break", marker: block.marker };
  }

  if (block.type === "htmlImage") {
    return {
      kind: "html-image",
      src: block.src,
      alt: block.alt,
      title: block.title,
      width: block.width,
      height: block.height,
      zoom: block.zoom,
      align: block.align
    };
  }

  if (block.type === "table") {
    return tableNodeData(block);
  }

  if (block.type === "definition") {
    return { kind: "definition" };
  }

  return { kind: "paragraph" };
}

function fenceKind(kind: CodeBlockKind): "fenced" | "indented" {
  return kind === "indented" ? "indented" : "fenced";
}

function blockMathNodeData(block: BlockMathBlock): MarkdownNodeData {
  return {
    kind: "block-math",
    value: block.value,
    closed: block.closed
  };
}

function tableNodeData(block: TableBlock): MarkdownNodeData {
  return {
    kind: "table",
    columnCount: block.columnCount,
    hasHeader: block.hasHeader,
    rowSeparator: block.rowSeparator,
    alignments: block.alignments.map(tableAlignment),
    header: convertTableRow(block.header),
    rows: block.rows.map(convertTableRow)
  };
}

function tableAlignment(alignment: TableBlock["alignments"][number]): MarkdownTableAlignment {
  return alignment === "none" ? null : alignment;
}

function convertTableRow(row: readonly LegacyTableCell[]): MarkdownTableRow {
  return Object.freeze(row.map((cell) => ({
    text: cell.text,
    rowIndex: cell.rowIndex,
    columnIndex: cell.columnIndex,
    isHeader: cell.isHeader,
    source: createSourceRange(cell.startOffset, cell.endOffset),
    content: createSourceRange(cell.contentStartOffset, cell.contentEndOffset)
  } satisfies MarkdownTableCell)));
}

export type HeadingContentRange = {
  markerEnd: number;
  contentStartOffset: number;
  contentEndOffset: number;
};

export function resolveHeadingContentRange(
  startOffset: number,
  endOffset: number,
  source: string
): HeadingContentRange {
  const lineEndOffset = findLineEndOffset(source, startOffset, endOffset);
  const contentLineEndOffset = trimTrailingCarriageReturn(source, startOffset, lineEndOffset);
  const lineText = source.slice(startOffset, contentLineEndOffset);
  const atxMatch = /^([ \t]{0,3})(#{1,6})(?:([ \t]+)|$)/.exec(lineText);

  if (!atxMatch) {
    return {
      markerEnd: startOffset,
      contentStartOffset: startOffset,
      contentEndOffset: contentLineEndOffset
    };
  }

  const markerEnd = startOffset + atxMatch[0].length;
  let contentEndOffset = contentLineEndOffset;
  const remainder = source.slice(markerEnd, contentLineEndOffset);
  const closingMatch = /(?:[ \t]+#+[ \t]*)$/.exec(remainder);

  if (closingMatch) {
    contentEndOffset = contentLineEndOffset - closingMatch[0].length;
  }

  return {
    markerEnd,
    contentStartOffset: markerEnd,
    contentEndOffset: Math.max(markerEnd, contentEndOffset)
  };
}

// A list item's content starts after its marker, its padding, and any task marker, and ends
// before the first nested child block. This is the range item-level inline parsing uses.
export function createListItemContentRange(input: {
  readonly source: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly markerEnd: number;
  readonly task: ListItemBlock["task"];
  readonly children: readonly MarkdownNode[];
}): SourceRange {
  const nestedListStart = firstListChildStartOffset(input.children);
  const firstChildStartOffset = nestedListStart === null
    ? input.endOffset
    : Math.max(input.startOffset, lineStartOf(input.source, nestedListStart));
  const contentUpperBound = Math.min(firstChildStartOffset, input.endOffset);
  const firstLineEndOffset = findLineEndOffset(input.source, input.startOffset, contentUpperBound);
  const firstLineContentEndOffset = trimTrailingCarriageReturn(input.source, input.startOffset, firstLineEndOffset);

  let contentStartOffset = input.markerEnd;
  contentStartOffset = consumeHorizontalSpace(input.source, contentStartOffset, firstLineContentEndOffset);

  if (input.task && input.task.markerStart === contentStartOffset) {
    contentStartOffset = input.task.markerEnd;
    contentStartOffset = consumeHorizontalSpace(input.source, contentStartOffset, firstLineContentEndOffset);
  }

  const boundedContentStartOffset = Math.min(contentStartOffset, contentUpperBound);
  const contentEndOffset = trimTrailingListItemContent(input.source, boundedContentStartOffset, contentUpperBound);

  return createSourceRange(boundedContentStartOffset, contentEndOffset);
}

// Only nested lists bound an item's own content: a nested block means the item's text stopped,
// while the item's own leaf blocks are the text itself.
function firstListChildStartOffset(children: readonly MarkdownNode[]): number | null {  let start: number | null = null;

  for (const child of children) {
    if (child.kind !== "list") continue;
    start = start === null ? child.source.startOffset : Math.min(start, child.source.startOffset);
  }

  return start;
}

function lineStartOf(source: string, offset: number): number {
  return source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

export function findLineEndOffset(source: string, startOffset: number, endOffset: number): number {
  const lineEndIndex = source.indexOf("\n", startOffset);
  return lineEndIndex === -1 || lineEndIndex > endOffset ? endOffset : lineEndIndex;
}

export function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  if (cursor > startOffset && source[cursor - 1] === "\r") {
    cursor -= 1;
  }

  return cursor;
}

export function consumeHorizontalSpace(source: string, startOffset: number, endOffset: number): number {
  let cursor = startOffset;

  while (cursor < endOffset && (source[cursor] === " " || source[cursor] === "\t")) {
    cursor += 1;
  }

  return cursor;
}

function trimTrailingListItemContent(source: string, startOffset: number, endOffset: number): number {
  let cursor = trimTrailingCarriageReturn(source, startOffset, endOffset);

  while (cursor > startOffset) {
    const character = source[cursor - 1];

    if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") {
      break;
    }

    cursor -= 1;
  }

  return cursor;
}

