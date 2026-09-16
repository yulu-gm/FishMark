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
  OrderedListDelimiter,
  ParagraphBlock,
  TableBlock,
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
import type { SourceRange } from "../model/source-range";
import { createLineInfos } from "./leaf-blocks";
import { parseInlineAst } from "../parse-inline-ast";

// The rich document view is a projection of the recursive tree. Structure, container nesting,
// and source geometry all come from the tree, so no consumer needs a second Markdown scanner.
// Inline text inside containers is parsed over container-masked source, which keeps document
// offsets while never treating `> ` prefixes as content.
export function projectMarkdownDocument(tree: MarkdownDocumentTree): MarkdownDocument {
  const source = tree.source;
  const lineAt = createLineLookup(source);
  const blocks = tree.root.children.flatMap((node) =>
    projectNode(node, {
      source,
      lineAt,
      referenceDefinitions: tree.referenceDefinitions,
      footnoteDefinitions: tree.footnoteDefinitions,
      maskPrefixes: []
    })
  );

  return {
    blocks,
    referenceDefinitions: tree.referenceDefinitions,
    footnoteDefinitions: tree.footnoteDefinitions
  };
}

interface ProjectionContext {
  readonly source: string;
  readonly lineAt: (offset: number) => number;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly maskPrefixes: readonly SourceRange[];
}

function projectNode(node: MarkdownNode, context: ProjectionContext): MarkdownBlock[] {
  if (isMarkdownContainerNode(node)) {
    if (node.kind === "blockquote") return [projectBlockquote(node, context)];
    if (node.kind === "list") return projectList(node, context);
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

function blockBase(
  node: MarkdownNode,
  context: ProjectionContext
): MarkdownBlock {
  return {
    id: `${node.kind}:${node.source.startOffset}-${node.source.endOffset}`,
    type: node.kind === "code-fence" ? "codeFence" : node.kind === "block-math" ? "blockMath" : node.kind === "thematic-break" ? "thematicBreak" : node.kind === "html-image" ? "htmlImage" : node.kind,
    startOffset: node.source.startOffset,
    endOffset: node.source.endOffset,
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
  const innerBlocks = node.children.flatMap((child) =>
    projectNode(child, {
      ...context,
      maskPrefixes: [...context.maskPrefixes, ...node.markers.map((marker) => marker.range)]
    })
  );

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

function projectList(node: MarkdownContainerNode, context: ProjectionContext): MarkdownBlock[] {
  const directItems = node.children
    .filter((child): child is MarkdownContainerNode => isMarkdownContainerNode(child) && child.kind === "list-item")
    .map((child) => projectListItem(child, context));

  return rescopeListItems(directItems);
}

// FishMark's list editing model nests items by indentation, which is what every editor and
// decoration consumer expects. The recursive tree keeps CommonMark's marker-width nesting, so
// the rich view re-scopes the projected items into the indentation scopes legacy behaviour used.
function rescopeListItems(items: readonly ListItemBlock[]): MarkdownBlock[] {
  const flat = flattenListItems(items);
  const rootScopes: DraftScope[] = [];
  const openItems: DraftItem[] = [];

  for (const entry of flat) {
    const metadata = parseListMarker(entry.item.marker);

    while (openItems.length > 0 && openItems[openItems.length - 1]!.indent >= entry.item.indent) {
      openItems.pop();
    }

    const draft: DraftItem = { item: entry.item, indent: entry.item.indent, scopes: [] };
    const parent = openItems[openItems.length - 1];

    if (parent !== undefined) {
      const currentScope = parent.scopes[parent.scopes.length - 1];
      if (currentScope !== undefined && draftScopeMatches(currentScope, metadata, draft.indent)) {
        currentScope.items.push(draft);
      } else {
        parent.scopes.push(createDraftScope(metadata, draft.indent, draft));
      }
    } else {
      const currentRoot = rootScopes[rootScopes.length - 1];
      if (currentRoot !== undefined && draftScopeMatches(currentRoot, metadata, draft.indent)) {
        currentRoot.items.push(draft);
      } else {
        rootScopes.push(createDraftScope(metadata, draft.indent, draft));
      }
    }

    openItems.push(draft);
  }

  if (rootScopes.length === 0) {
    return [];
  }

  return rootScopes.map((scope) => materializeScope(scope));
}

type DraftItem = {
  readonly item: ListItemBlock;
  readonly indent: number;
  readonly scopes: DraftScope[];
};

type DraftScope = {
  readonly ordered: boolean;
  readonly delimiter: string | null;
  readonly indent: number;
  readonly items: DraftItem[];
};

function flattenListItems(items: readonly ListItemBlock[]): Array<{ item: ListItemBlock }> {
  const flat: Array<{ item: ListItemBlock }> = [];

  for (const item of items) {
    flat.push({ item: { ...item, children: [] } });
    for (const child of item.children) {
      flat.push(...flattenListItems(child.items));
    }
  }

  return flat;
}

function parseListMarker(marker: string): { ordered: boolean; delimiter: string | null } {
  const match = /^(\d{1,9})([.)])$/u.exec(marker);

  return match ? { ordered: true, delimiter: match[2] ?? "." } : { ordered: false, delimiter: null };
}

function draftScopeMatches(scope: DraftScope, metadata: { ordered: boolean; delimiter: string | null }, indent: number): boolean {
  if (scope.indent !== indent || scope.ordered !== metadata.ordered) {
    return false;
  }

  return scope.ordered ? scope.delimiter === metadata.delimiter : true;
}

function createDraftScope(
  metadata: { ordered: boolean; delimiter: string | null },
  indent: number,
  item: DraftItem
): DraftScope {
  return {
    ordered: metadata.ordered,
    delimiter: metadata.delimiter,
    indent,
    items: [item]
  };
}

function materializeScope(scope: DraftScope): ListBlock {
  const items = scope.items.map((draft) => materializeItem(draft));
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const base = {
    id: `list:${first.startOffset}-${last.endOffset}`,
    type: "list" as const,
    startOffset: first.startOffset,
    endOffset: last.endOffset,
    startLine: first.startLine,
    endLine: last.endLine,
    items
  };

  if (!scope.ordered) {
    return { ...base, ordered: false };
  }

  const marker = /^(\d{1,9})([.)])$/u.exec(first.marker);

  return {
    ...base,
    ordered: true,
    startOrdinal: marker ? Number.parseInt(marker[1] ?? "1", 10) : 1,
    delimiter: (marker?.[2] ?? ".") as OrderedListDelimiter
  };
}

function materializeItem(draft: DraftItem): ListItemBlock {
  const children = draft.scopes.map((scope) => materializeScope(scope));
  const lastChild = children[children.length - 1];
  const endOffset = lastChild === undefined
    ? draft.item.endOffset
    : Math.max(draft.item.endOffset, lastChild.endOffset);

  return {
    ...draft.item,
    id: `list-item:${draft.item.startOffset}-${endOffset}`,
    endOffset,
    endLine: lastChild === undefined ? draft.item.endLine : Math.max(draft.item.endLine, lastChild.endLine),
    children
  };
}

function projectListItem(item: MarkdownContainerNode, context: ProjectionContext): ListItemBlock {
  const data = item.data as {
    kind: "list-item";
    marker: string;
    checked: boolean | null;
    indent: number;
  };
  const marker = item.markers.find((entry) => entry.kind === "list-marker");
  const taskMarker = item.markers.find((entry) => entry.kind === "task-marker");
  const children = item.children
    .filter((child): child is MarkdownContainerNode => isMarkdownContainerNode(child) && child.kind === "list")
    .flatMap((child) => projectList(child, context).filter((block): block is ListBlock => block.type === "list"));
  const itemMaskPrefixes = [...context.maskPrefixes, ...item.markers.map((entry) => entry.range)];
  const inlineSource = itemMaskPrefixes.length === 0
    ? context.source
    : createContainerPrefixedSource(context.source, itemMaskPrefixes).masked;

  return {
    id: `list-item:${item.source.startOffset}-${item.source.endOffset}`,
    startOffset: item.source.startOffset,
    endOffset: item.source.endOffset,
    startLine: context.lineAt(item.source.startOffset),
    endLine: context.lineAt(item.source.endOffset),
    indent: data.indent,
    marker: data.marker,
    markerStart: marker?.range.startOffset ?? item.source.startOffset,
    markerEnd: marker?.range.endOffset ?? item.source.startOffset,
    contentStartOffset: item.content.startOffset,
    contentEndOffset: item.content.endOffset,
    inline: parseInlineAst(inlineSource, item.content.startOffset, item.content.endOffset, {
      referenceDefinitions: context.referenceDefinitions,
      footnoteDefinitions: context.footnoteDefinitions
    }),
    task: taskMarker && data.checked !== null
      ? {
          checked: data.checked,
          markerStart: taskMarker.range.startOffset,
          markerEnd: taskMarker.range.endOffset
        }
      : null,
    children
  };
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

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
