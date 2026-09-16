import type {
  BlockMathBlock,
  BlockquoteBlock,
  CodeFenceBlock,
  DefinitionBlock,
  HeadingBlock,
  HtmlImageBlock,
  InlineLine,
  ListBlock,
  ListItemBlock,
  MarkdownBlock,
  ParagraphBlock,
  TableBlock,
  OrderedListDelimiter,
  TableCell,
  ThematicBreakBlock
} from "../block-map";
import type { FootnoteDefinition, InlineReferenceDefinition, InlineRoot } from "../inline-ast";
import { parseBlockquoteLinePrefix } from "../blockquote";
import type { MarkdownDocument } from "../markdown-document";
import type { MarkdownDocumentTree } from "../model/document-tree";
import { createContainerPrefixedSource } from "../model/document-tree";
import {
  isMarkdownContainerNode,
  type MarkdownContainerNode,
  type MarkdownLeafNode,
  type MarkdownNode,
  type MarkdownTableRow
} from "../model/markdown-node";
import { createSourceRange, type SourceRange } from "../model/source-range";
import { createLineInfos } from "./leaf-blocks";
import { consumeHorizontalSpace, findLineEndOffset } from "./leaf-nodes";
import { parseInlineAst } from "../parse-inline-ast";
import { collectBlockquotePrefixSpans } from "../blockquote";
import { readFlatListItems, readListScopes, type ListItemGeometry, type ListScope } from "./list-scopes";

// The rich document view is a projection of the recursive tree. Structure, container nesting,
// and source geometry all come from the tree, so no consumer needs a second Markdown scanner.
// Inline text inside containers is parsed over container-masked source, which keeps document
// offsets while never treating `> ` prefixes as content.
export function projectMarkdownDocument(tree: MarkdownDocumentTree): MarkdownDocument {
  const source = tree.source;
  const lineAt = createLineLookup(source);
  const blocks = projectChildren(tree.root.children, {
    source,
    lineAt,
    referenceDefinitions: tree.referenceDefinitions,
    footnoteDefinitions: tree.footnoteDefinitions,
    maskPrefixes: [],
    lineRanges: false
  });

  return {
    blocks,
    referenceDefinitions: tree.referenceDefinitions,
    footnoteDefinitions: tree.footnoteDefinitions
  };
}

// One Markdown list can reach the tree as several adjacent list containers (a marker-only line or
// an indent the container above cannot own starts a new one). The rich view scopes every run of
// whitespace-separated list siblings as a single list, which is also how items keep nesting by
// indentation across those container boundaries.
function projectChildren(
  nodes: readonly MarkdownNode[],
  context: ProjectionContext
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index]!;

    if (node.kind !== "list") {
      blocks.push(...projectNode(node, context));
      index += 1;
      continue;
    }

    let end = index;
    while (
      end + 1 < nodes.length &&
      nodes[end + 1]!.kind === "list" &&
      whitespaceOnlyGap(context.source, nodes[end]!.source.endOffset, nodes[end + 1]!.source.startOffset)
    ) {
      end += 1;
    }

    blocks.push(...projectListRun(nodes.slice(index, end + 1) as readonly MarkdownContainerNode[], context));
    index = end + 1;
  }

  return blocks;
}

function whitespaceOnlyGap(source: string, from: number, to: number): boolean {
  return /^[\s]*$/u.test(source.slice(from, to));
}

function projectListRun(
  nodes: readonly MarkdownContainerNode[],
  context: ProjectionContext
): MarkdownBlock[] {
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const span = createSourceRange(
    lineRangeFor(context.source, first.source).startOffset,
    lineRangeFor(context.source, last.source).endOffset
  );

  if (nodes.length === 1) {
    return projectListWithin(span, first, context);
  }

  const data = first.data as { kind: "list"; ordered: boolean };
  const scopes = readListScopes(context.source, span, context.maskPrefixes);

  // A run only merges when one indentation scope covers it; otherwise every container in the run
  // is projected on its own.
  if (scopes !== null && scopes.length === 1 && scopes[0]!.ordered === data.ordered) {
    return scopes.map((scope) => projectScope(scope, context));
  }

  const blocks: MarkdownBlock[] = [];
  for (const node of nodes) {
    blocks.push(...projectListWithin(lineRangeFor(context.source, node.source), node, context));
  }

  return blocks;
}

function projectListWithin(
  range: SourceRange,
  node: MarkdownContainerNode,
  context: ProjectionContext
): MarkdownBlock[] {
  const data = node.data as { kind: "list"; ordered: boolean };
  const scopes = readListScopes(context.source, range, context.maskPrefixes);

  if (scopes === null || scopes.length === 0 || scopes.some((scope) => scope.ordered !== data.ordered)) {
    const flatItems = readFlatListItems(context.source, range, context.maskPrefixes);

    // A marker that is never followed by content or a space is paragraph text, not a list.
    return flatItems.length === 0
      ? [projectParagraphRange(range, context)]
      : [projectFlatList(flatItems, data.ordered, context)];
  }

  return scopes.map((scope) => projectScope(scope, context));
}

interface ProjectionContext {
  readonly source: string;
  readonly lineAt: (offset: number) => number;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly maskPrefixes: readonly SourceRange[];
  // Inside a blockquote the legacy view reports whole source lines for every block except
  // paragraphs and headings, because container-editing commands replace raw document text.
  readonly lineRanges: boolean;
}

function projectNode(node: MarkdownNode, context: ProjectionContext): MarkdownBlock[] {
  if (isMarkdownContainerNode(node)) {
    if (node.kind === "blockquote") return [projectBlockquote(node, context)];
    if (node.kind === "list") return projectListRun([node], context);
    return [];
  }

  return [projectLeaf(node, context)];
}

function projectLeaf(node: MarkdownLeafNode, context: ProjectionContext): MarkdownBlock {
  const base = blockBase(node, context);

  switch (node.kind) {
    case "heading":
      return projectHeading(node, base);
    case "paragraph":
      return projectParagraph(node, base);
    case "code-fence":
      return projectCodeFence(node, base);
    case "block-math":
      return projectBlockMath(node, base);
    case "thematic-break":
      return projectThematicBreak(node, base);
    case "html-image":
      return projectHtmlImage(node, base);
    case "table":
      return projectTable(node, base);
    default:
      return base as DefinitionBlock;
  }
}

const BLOCK_TYPES: Readonly<Record<string, string>> = {
  "code-fence": "codeFence",
  "block-math": "blockMath",
  "thematic-break": "thematicBreak",
  "html-image": "htmlImage"
};

// Block ids keep the historical camelCase type names consumers and signature caches expect.
function legacyBlockType(kind: MarkdownNode["kind"]): MarkdownBlock["type"] {
  return (BLOCK_TYPES[kind] ?? kind) as MarkdownBlock["type"];
}

function blockBase(
  node: MarkdownNode,
  context: ProjectionContext
): MarkdownBlock {
  // Paragraphs and headings keep their content range; every other block inside a blockquote
  // reports the whole source lines it covers, which is the range container commands edit.
  const range = context.lineRanges && node.kind !== "paragraph" && node.kind !== "heading"
    ? lineRangeFor(context.source, node.source)
    : node.source;

  const type = legacyBlockType(node.kind);

  return {
    id: `${type}:${range.startOffset}-${range.endOffset}`,
    type,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    startLine: context.lineAt(node.source.startOffset),
    endLine: context.lineAt(node.source.endOffset)
  } as MarkdownBlock;
}

function projectHeading(
  node: MarkdownLeafNode,
  base: MarkdownBlock
): HeadingBlock {
  const data = node.data as { kind: "heading"; depth: number };
  const marker = node.markers.find((entry) => entry.kind === "heading");

  return {
    ...(base as HeadingBlock),
    depth: data.depth,
    markerEnd: marker ? marker.range.endOffset : node.source.startOffset,
    ...(node.inline === undefined ? {} : { inline: node.inline })
  };
}

function projectParagraph(
  node: MarkdownLeafNode,
  base: MarkdownBlock
): ParagraphBlock {
  return {
    ...(base as ParagraphBlock),
    ...(node.inline === undefined ? {} : { inline: node.inline })
  };
}

function projectCodeFence(node: MarkdownLeafNode, base: MarkdownBlock): CodeFenceBlock {
  const data = node.data as { kind: "code-fence"; fence: "fenced" | "indented"; info: string | null };

  return {
    ...(base as CodeFenceBlock),
    kind: data.fence,
    info: data.info
  };
}

function projectBlockMath(node: MarkdownLeafNode, base: MarkdownBlock): BlockMathBlock {
  const data = node.data as { kind: "block-math"; value: string; closed: boolean };
  const fences = node.markers.filter((marker) => marker.kind === "fence");
  const open = fences[0];
  const close = fences[1] ?? null;

  return {
    ...(base as BlockMathBlock),
    markerStartOffset: open?.range.startOffset ?? node.source.startOffset,
    markerEndOffset: open?.range.endOffset ?? node.source.startOffset,
    closingMarkerStartOffset: close ? close.range.startOffset : null,
    closingMarkerEndOffset: close ? close.range.endOffset : null,
    contentStartOffset: node.content.startOffset,
    contentEndOffset: node.content.endOffset,
    value: data.value,
    closed: data.closed
  };
}

function projectThematicBreak(node: MarkdownLeafNode, base: MarkdownBlock): ThematicBreakBlock {
  const data = node.data as { kind: "thematic-break"; marker: "-" | "+" };

  return {
    ...(base as ThematicBreakBlock),
    marker: data.marker
  };
}

function projectHtmlImage(node: MarkdownLeafNode, base: MarkdownBlock): HtmlImageBlock {
  const data = node.data as {
    kind: "html-image";
    src: string | null;
    alt: string;
    title: string | null;
    width: string | null;
    height: string | null;
    zoom: string | null;
    align: "left" | "center" | "right" | null;
  };

  return {
    ...(base as HtmlImageBlock),
    src: data.src,
    alt: data.alt,
    title: data.title,
    width: data.width,
    height: data.height,
    zoom: data.zoom,
    align: data.align
  };
}

function projectTable(node: MarkdownLeafNode, base: MarkdownBlock): TableBlock {
  const data = node.data as {
    kind: "table";
    columnCount: number;
    hasHeader: boolean;
    rowSeparator: TableBlock["rowSeparator"];
    alignments: readonly (TableCell["text"] extends never ? never : "left" | "center" | "right" | null)[];
    header: MarkdownTableRow;
    rows: readonly MarkdownTableRow[];
  };

  return {
    ...(base as TableBlock),
    columnCount: data.columnCount,
    hasHeader: data.hasHeader,
    rowSeparator: data.rowSeparator,
    alignments: data.alignments.map((alignment) => (alignment === null ? "none" : alignment)),
    header: data.header.map(toTableCell),
    rows: data.rows.map((row) => row.map(toTableCell))
  };
}

function toTableCell(cell: MarkdownTableRow[number]): TableCell {
  return {
    text: cell.text,
    rowIndex: cell.rowIndex,
    columnIndex: cell.columnIndex,
    isHeader: cell.isHeader,
    startOffset: cell.source.startOffset,
    endOffset: cell.source.endOffset,
    contentStartOffset: cell.content.startOffset,
    contentEndOffset: cell.content.endOffset
  };
}

function projectBlockquote(node: MarkdownContainerNode, context: ProjectionContext): BlockquoteBlock {
  const lines = createBlockquoteLines(node, context);
  const prefixes = collectBlockquotePrefixSpans(context.source, node.source).prefixes;
  // The rich view reports one blockquote per quoted region and carries nesting in each
  // line's depth, so nested quote blocks are flattened into this block's inner blocks.
  const innerBlocks = flattenBlockquoteBlocks(projectChildren(node.children, {
    ...context,
    lineRanges: true,
    maskPrefixes: [...context.maskPrefixes, ...prefixes]
  }));

  return {
    id: `blockquote:${node.source.startOffset}-${node.source.endOffset}`,
    type: "blockquote",
    startOffset: node.source.startOffset,
    endOffset: node.source.endOffset,
    startLine: context.lineAt(node.source.startOffset),
    endLine: context.lineAt(node.source.endOffset),
    lines,
    innerBlocks
  };
}

function flattenBlockquoteBlocks(blocks: readonly MarkdownBlock[]): MarkdownBlock[] {
  return blocks.flatMap((block) =>
    block.type === "blockquote"
      ? flattenBlockquoteBlocks(block.innerBlocks ?? [])
      : [block]
  );
}

function createBlockquoteLines(
  node: MarkdownContainerNode,
  context: ProjectionContext
): InlineLine[] {
  const lines = createLineInfos(
    context.source.slice(node.source.startOffset, node.source.endOffset),
    node.source.startOffset,
    context.lineAt(node.source.startOffset)
  );

  return lines.map((line) => {
    const contentLineEndOffset = trimTrailingCarriageReturn(context.source, line.startOffset, line.endOffset);
    const prefix = parseBlockquoteLinePrefix(context.source, line.startOffset, contentLineEndOffset);

    return {
      text: context.source.slice(line.startOffset, contentLineEndOffset),
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      lineNumber: line.lineNumber,
      quoteDepth: prefix.markers.length,
      markers: prefix.markers,
      markerEnd: prefix.markerEnd,
      sourcePrefixEndOffset: prefix.sourcePrefixEndOffset,
      contentStartOffset: prefix.contentStartOffset,
      contentEndOffset: contentLineEndOffset,
      inline: parseInlineAst(context.source, prefix.contentStartOffset, contentLineEndOffset, {
        referenceDefinitions: context.referenceDefinitions,
        footnoteDefinitions: context.footnoteDefinitions
      })
    };
  });
}

function projectParagraphRange(range: SourceRange, context: ProjectionContext): ParagraphBlock {
  const contentEnd = trimTrailingCarriageReturn(context.source, range.startOffset, range.endOffset);

  return {
    id: `paragraph:${range.startOffset}-${range.endOffset}`,
    type: "paragraph",
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    startLine: context.lineAt(range.startOffset),
    endLine: context.lineAt(range.endOffset),
    inline: parseInlineAst(context.source, range.startOffset, contentEnd, {
      referenceDefinitions: context.referenceDefinitions,
      footnoteDefinitions: context.footnoteDefinitions
    })
  };
}

function projectFlatList(
  items: readonly ListItemGeometry[],
  ordered: boolean,
  context: ProjectionContext
): ListBlock {
  const projected = items.map((item) => projectScopeItem(item, context));
  const first = projected[0]!;
  const last = projected[projected.length - 1]!;
  const base = {
    id: `list:${first.startOffset}-${last.endOffset}`,
    type: "list" as const,
    startOffset: first.startOffset,
    endOffset: last.endOffset,
    startLine: first.startLine,
    endLine: last.endLine,
    items: projected
  };

  if (!ordered) {
    return { ...base, ordered: false };
  }

  const marker = /^(\d+)([.)])$/u.exec(first.marker);

  return {
    ...base,
    ordered: true,
    startOrdinal: marker ? Number.parseInt(marker[1] ?? "1", 10) : 1,
    delimiter: (marker?.[2] ?? ".") as OrderedListDelimiter
  };
}

function projectScope(scope: ListScope, context: ProjectionContext): ListBlock {
  const items = scope.items.map((item) => projectScopeItem(item, context));
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const base: ListBlock = scope.ordered
    ? {
        id: `list:${first.startOffset}-${last.endOffset}`,
        type: "list",
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        startLine: first.startLine,
        endLine: last.endLine,
        items,
        ordered: true,
        startOrdinal: scope.startOrdinal,
        delimiter: scope.delimiter
      }
    : {
        id: `list:${first.startOffset}-${last.endOffset}`,
        type: "list",
        startOffset: first.startOffset,
        endOffset: last.endOffset,
        startLine: first.startLine,
        endLine: last.endLine,
        items,
        ordered: false
      };

  // A quoted list nests through the same `> ` prefixes at every depth, so a nested scope whose
  // items are no deeper than its parent item belongs to the parent list instead.
  return context.lineRanges ? promoteQuotedListItems(base, context) : base;
}

function promoteQuotedListItems(block: ListBlock, context: ProjectionContext): ListBlock {
  const items: ListItemBlock[] = [];

  for (const item of block.items) {
    const normalizedChildren = item.children.map((child) => promoteQuotedListItems(child, context));
    const keptChildren: ListBlock[] = [];
    const promotedItems: ListItemBlock[] = [];
    let normalizedItem: ListItemBlock = { ...item, children: normalizedChildren };

    for (const child of normalizedChildren) {
      if (shouldPromoteQuotedChild(block, normalizedItem, child)) {
        promotedItems.push(...child.items);
        continue;
      }

      keptChildren.push(child);
    }

    normalizedItem = promotedItems.length > 0
      ? truncateItemBefore(normalizedItem, promotedItems[0]!.startOffset, keptChildren, context)
      : { ...normalizedItem, children: keptChildren };

    items.push(normalizedItem, ...promotedItems);
  }

  return block.ordered
    ? { ...block, ordered: true, items }
    : { ...block, ordered: false, items };
}

function shouldPromoteQuotedChild(
  parentList: ListBlock,
  parentItem: ListItemBlock,
  childList: ListBlock
): boolean {
  const kindsMatch = parentList.ordered === childList.ordered &&
    (!parentList.ordered || !childList.ordered || parentList.delimiter === childList.delimiter);

  return (
    kindsMatch &&
    childList.items.length > 0 &&
    childList.items.every((childItem) => childItem.indent <= parentItem.indent)
  );
}

function truncateItemBefore(
  item: ListItemBlock,
  nextItemStartOffset: number,
  children: readonly ListBlock[],
  context: ProjectionContext
): ListItemBlock {
  const endOffset = lineEndBefore(context.source, item.startOffset, nextItemStartOffset);

  return {
    ...item,
    id: `list-item:${item.startOffset}-${endOffset}`,
    endOffset,
    endLine: context.lineAt(endOffset),
    children
  };
}

function lineEndBefore(source: string, startOffset: number, offset: number): number {
  let end = Math.min(offset, source.length);

  while (end > startOffset && (source[end - 1] === "\n" || source[end - 1] === "\r")) {
    end -= 1;
  }

  return Math.max(startOffset, end);
}

function projectScopeItem(item: ListItemGeometry, context: ProjectionContext): ListItemBlock {
  const children = item.scopes.map((scope) => projectScope(scope, context));
  const contentBound = Math.min(children[0]?.startOffset ?? item.endOffset, item.endOffset);
  const content = itemContentRange(context.source, item, contentBound);
  const maskPrefixes = [
    ...context.maskPrefixes,
    { startOffset: item.markerStart, endOffset: item.markerEnd },
    ...(item.task === null
      ? []
      : [{ startOffset: item.task.markerStart, endOffset: item.task.markerEnd }])
  ];
  // Masking rewrites the whole document, so it only runs when a prefix actually overlaps the
  // content being parsed; a single-line item is parsed straight from the source.
  const needsMask = maskPrefixes.some((range) =>
    range.startOffset < content.endOffset && range.endOffset > content.startOffset
  );
  const inlineSource = needsMask
    ? createContainerPrefixedSource(context.source, maskPrefixes).masked
    : context.source;

  return {
    id: `list-item:${item.startOffset}-${item.endOffset}`,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
    startLine: context.lineAt(item.startOffset),
    endLine: context.lineAt(item.endOffset),
    indent: item.indent,
    marker: item.marker,
    markerStart: item.markerStart,
    markerEnd: item.markerEnd,
    contentStartOffset: content.startOffset,
    contentEndOffset: content.endOffset,
    inline: parseInlineAst(inlineSource, content.startOffset, content.endOffset, {
      referenceDefinitions: context.referenceDefinitions,
      footnoteDefinitions: context.footnoteDefinitions
    }),
    task: item.task,
    children
  };
}

// An item's own content runs from after its marker, padding, and task marker to the start of its
// first nested list, with trailing whitespace trimmed.
function itemContentRange(
  source: string,
  item: ListItemGeometry,
  contentUpperBound: number
): SourceRange {
  const firstLineEnd = findLineEndOffset(source, item.startOffset, contentUpperBound);
  const firstLineContentEnd = trimTrailingCarriageReturn(source, item.startOffset, firstLineEnd);
  let contentStart = consumeHorizontalSpace(source, item.markerEnd, firstLineContentEnd);

  if (item.task !== null && item.task.markerStart === contentStart) {
    contentStart = consumeHorizontalSpace(source, item.task.markerEnd, firstLineContentEnd);
  }

  const boundedStart = Math.min(contentStart, contentUpperBound);

  return {
    startOffset: boundedStart,
    endOffset: trimTrailingListItemContent(source, boundedStart, contentUpperBound)
  };
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
// The whole source lines a node covers, without a trailing line break. Container editing
// commands replace raw document text, so their ranges must include the `> ` prefixes.
function lineRangeFor(source: string, range: SourceRange): SourceRange {
  const lineStart = source.lastIndexOf("\n", Math.max(0, range.startOffset - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", range.endOffset);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;

  return { startOffset: lineStart, endOffset: Math.max(lineStart, trimTrailingCarriageReturn(source, lineStart, lineEnd)) };
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {  let cursor = endOffset;

  if (cursor > startOffset && source[cursor - 1] === "\r") {
    cursor -= 1;
  }

  return cursor;
}

// 1-based line lookup matching the parser's line numbering: the line an offset sits on, where an
// offset exactly at a line start belongs to that line.
function createLineLookup(source: string): (offset: number) => number {
  const lineStarts: number[] = [0];

  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\n") {
      lineStarts.push(offset + 1);
    }
  }

  return (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lineStarts[middle]! <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low + 1;
  };
}

export type { InlineRoot };


















