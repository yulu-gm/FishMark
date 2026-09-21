import type { BlockMathBlock, BlockquoteBlock, CodeFenceBlock, DefinitionBlock, HeadingBlock, HtmlImageBlock, InlineLine, ListBlock, ListItemBlock, MarkdownBlock, ParagraphBlock, TableBlock, TableCell, ThematicBreakBlock } from "../block-map";
import type { InlineRoot } from "../inline-ast";
import type { MarkdownDocument } from "../markdown-document";
import { flattenMarkdownTree, type MarkdownDocumentTree } from "../model/document-tree";
import { isMarkdownContainerNode, type MarkdownContainerNode, type MarkdownLeafNode, type MarkdownNode, type MarkdownTableRow } from "../model/markdown-node";
import type { SourceRange, SourceMarker } from "../model/source-range";
import { consumeHorizontalSpace } from "./leaf-nodes";

interface ProjectionContext {
  readonly source: string;
  readonly lineAt: (offset: number) => number;
  readonly lineRanges: boolean;
  readonly quoteMarkers: ReadonlyMap<number, readonly SourceMarker[]>;
  readonly inlineRoots: readonly InlineRoot[];
}

// Compatibility serialization only: no scope inference, Markdown scanning or inline parsing.
// Arbitrary container children are retained in item.blocks and quote.innerBlocks.
export function projectMarkdownDocument(tree: MarkdownDocumentTree): MarkdownDocument {
  const lineAt = createLineLookup(tree.source);
  const markers = new Map<number, SourceMarker>();
  const inlineRoots: InlineRoot[] = [];
  for (const node of flattenMarkdownTree(tree)) {
    for (const marker of node.markers) if (marker.kind === "blockquote") markers.set(marker.range.startOffset, marker);
    if (!isMarkdownContainerNode(node) && node.inline !== undefined) inlineRoots.push(node.inline);
  }
  const quoteMarkers = new Map<number, SourceMarker[]>();
  for (const marker of [...markers.values()].sort((a, b) => a.range.startOffset - b.range.startOffset)) {
    const line = lineAt(marker.range.startOffset);
    const entries = quoteMarkers.get(line) ?? [];
    entries.push(marker);
    quoteMarkers.set(line, entries);
  }
  return { blocks: projectChildren(tree.root.children, { source: tree.source, lineAt, lineRanges: false, quoteMarkers, inlineRoots }),
    referenceDefinitions: tree.referenceDefinitions, footnoteDefinitions: tree.footnoteDefinitions };
}

function projectChildren(nodes: readonly MarkdownNode[], context: ProjectionContext): MarkdownBlock[] {
  return nodes.flatMap((node) => {
    if (!isMarkdownContainerNode(node)) return [projectLeaf(node, context)];
    if (node.kind === "blockquote") return [projectBlockquote(node, context)];
    if (node.kind === "list") return [projectList(node, context)];
    return projectChildren(node.children, context);
  });
}

function projectList(node: MarkdownContainerNode, context: ProjectionContext): ListBlock {
  if (node.data.kind !== "list") throw new Error("Expected canonical list data");
  const items = node.children.filter((child): child is MarkdownContainerNode => child.kind === "list-item")
    .map((item) => projectItem(item, context));
  const base = { ...blockBase(node, context), type: "list" as const, items };
  return node.data.ordered ? { ...base, ordered: true, startOrdinal: node.data.startOrdinal ?? 1, delimiter: node.data.delimiter ?? "." }
    : { ...base, ordered: false };
}

function projectItem(node: MarkdownContainerNode, context: ProjectionContext): ListItemBlock {
  if (node.data.kind !== "list-item") throw new Error("Expected canonical list item data");
  const blocks = projectChildren(node.children, context);
  const children = blocks.filter((block): block is ListBlock => block.type === "list");
  const marker = node.markers.find((entry) => entry.kind === "list-marker");
  const task = node.markers.find((entry) => entry.kind === "task-marker");
  const range = lineRangeFor(context.source, node.source);
  const paragraphs = node.children.filter((child): child is MarkdownLeafNode => child.kind === "paragraph");
  const roots = paragraphs.flatMap((paragraph) => paragraph.inline === undefined ? [] : [paragraph.inline]);
  const inline = roots.length === 1 ? roots[0] : roots.length === 0 ? undefined : {
    type: "root" as const, startOffset: roots[0]!.startOffset, endOffset: roots.at(-1)!.endOffset,
    children: roots.flatMap((root) => root.children)
  };
  return { id: "list-item:" + range.startOffset + "-" + range.endOffset,
    startOffset: range.startOffset, endOffset: range.endOffset, startLine: context.lineAt(range.startOffset), endLine: context.lineAt(range.endOffset),
    indent: node.data.indent, marker: node.data.marker, markerStart: marker?.range.startOffset ?? node.source.startOffset,
    markerEnd: marker?.range.endOffset ?? node.source.startOffset, contentStartOffset: node.content.startOffset,
    contentEndOffset: node.content.endOffset, ...(inline === undefined ? {} : { inline }),
    task: task === undefined ? null : { checked: node.data.checked ?? false, markerStart: task.range.startOffset, markerEnd: task.range.endOffset },
    blocks, children };
}

function projectBlockquote(node: MarkdownContainerNode, context: ProjectionContext): BlockquoteBlock {
  const range = lineRangeFor(context.source, node.source);
  const lines: InlineLine[] = [];
  let start = range.startOffset;
  while (start <= range.endOffset) {
    const newline = context.source.indexOf("\n", start);
    const end = Math.min(newline < 0 ? range.endOffset : newline, range.endOffset);
    const contentEnd = trimTrailingCarriageReturn(context.source, start, end);
    const lineNumber = context.lineAt(start);
    const markers = (context.quoteMarkers.get(lineNumber) ?? []).map((marker) => ({ markerStart: marker.range.startOffset, markerEnd: marker.range.endOffset }));
    const markerEnd = markers.at(-1)?.markerEnd ?? start;
    const contentStart = consumeHorizontalSpace(context.source, markerEnd, contentEnd);
    const roots = inlineRootsOverlapping(context.inlineRoots, contentStart, contentEnd);
    // Legacy line geometry retains references to complete leaves. Consumers must
    // traverse innerBlocks once instead of rendering one full AST per source line.
    const inline = roots.length === 1 ? roots[0]! : { type: "root" as const, startOffset: contentStart, endOffset: contentEnd,
      children: roots.flatMap((root) => root.children) };
    lines.push({ text: context.source.slice(start, contentEnd), startOffset: start, endOffset: end, lineNumber,
      quoteDepth: markers.length, markers, markerEnd, sourcePrefixEndOffset: contentStart, contentStartOffset: contentStart,
      contentEndOffset: contentEnd, inline });
    if (end >= range.endOffset) break;
    start = end + 1;
  }
  return { ...blockBase(node, context), type: "blockquote", lines,
    innerBlocks: projectChildren(node.children, { ...context, lineRanges: true }) };
}

function inlineRootsOverlapping(roots: readonly InlineRoot[], from: number, to: number): InlineRoot[] {
  let low = 0;
  let high = roots.length;
  while (low < high) { const middle = (low + high) >>> 1; if (roots[middle]!.endOffset <= from) low = middle + 1; else high = middle; }
  const matches: InlineRoot[] = [];
  for (let index = low; index < roots.length && roots[index]!.startOffset < to; index += 1) matches.push(roots[index]!);
  return matches;
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
      return { ...(base as DefinitionBlock), ...(node.data.kind === "definition" && node.data.footnote !== undefined
        ? { footnoteDefinition: node.data.footnote } : {}) };
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
    contentEndOffset: cell.content.endOffset,
    inline: cell.inline
  };
}

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

