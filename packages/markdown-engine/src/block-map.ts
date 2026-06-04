import type { FootnoteDefinitionBlockData, InlineRoot } from "./inline-ast";
import type { CodeBlockKind } from "./code-block";

export interface BlockquoteMarker {
  markerStart: number;
  markerEnd: number;
}

export type InlineLine = {
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
  quoteDepth: number;
  markers: readonly BlockquoteMarker[];
  markerEnd: number;
  sourcePrefixEndOffset: number;
  contentStartOffset: number;
  contentEndOffset: number;
  inline: InlineRoot;
};

export interface BaseBlock {
  id: string;
  type:
    | "heading"
    | "paragraph"
    | "list"
    | "blockquote"
    | "codeFence"
    | "blockMath"
    | "definition"
    | "thematicBreak"
    | "htmlImage"
    | "table";
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  depth: number;
  markerEnd?: number;
  inline?: InlineRoot;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  inline?: InlineRoot;
}

export interface ListItemTaskMarker {
  checked: boolean;
  markerStart: number;
  markerEnd: number;
}

export interface ListItemBlock {
  id: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  indent: number;
  marker: string;
  markerStart: number;
  markerEnd: number;
  contentStartOffset?: number;
  contentEndOffset?: number;
  inline?: InlineRoot;
  task: ListItemTaskMarker | null;
  children: readonly ListBlock[];
}

export type OrderedListDelimiter = "." | ")";

interface BaseListBlock extends BaseBlock {
  type: "list";
  items: readonly ListItemBlock[];
}

export interface UnorderedListBlock extends BaseListBlock {
  ordered: false;
}

export interface OrderedListBlock extends BaseListBlock {
  ordered: true;
  startOrdinal: number;
  delimiter: OrderedListDelimiter;
}

export type ListBlock = UnorderedListBlock | OrderedListBlock;

export interface BlockquoteBlock extends BaseBlock {
  type: "blockquote";
  lines?: InlineLine[];
  innerBlocks?: readonly MarkdownBlock[];
}

export interface CodeFenceBlock extends BaseBlock {
  type: "codeFence";
  kind: CodeBlockKind;
  info: string | null;
}

export interface BlockMathBlock extends BaseBlock {
  type: "blockMath";
  markerStartOffset: number;
  markerEndOffset: number;
  closingMarkerStartOffset: number | null;
  closingMarkerEndOffset: number | null;
  contentStartOffset: number;
  contentEndOffset: number;
  value: string;
  closed: boolean;
}

export interface DefinitionBlock extends BaseBlock {
  type: "definition";
  footnoteDefinition?: FootnoteDefinitionBlockData;
}

export interface ThematicBreakBlock extends BaseBlock {
  type: "thematicBreak";
  marker: "-" | "+";
}

export interface HtmlImageBlock extends BaseBlock {
  type: "htmlImage";
  src: string | null;
  alt: string;
  title: string | null;
  width: string | null;
  height: string | null;
  zoom: string | null;
  align: "left" | "center" | "right" | null;
}

export type TableAlignment = "none" | "left" | "center" | "right";
export type TableRowSeparator = "compact" | "loose";

export interface TableCell {
  text: string;
  rowIndex: number;
  columnIndex: number;
  isHeader: boolean;
  startOffset: number;
  endOffset: number;
  contentStartOffset: number;
  contentEndOffset: number;
}

export type TableRow = readonly TableCell[];

export interface TableBlock extends BaseBlock {
  type: "table";
  columnCount: number;
  hasHeader: boolean;
  rowSeparator: TableRowSeparator;
  alignments: readonly TableAlignment[];
  header: readonly TableCell[];
  rows: readonly TableRow[];
}

export type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | BlockquoteBlock
  | CodeFenceBlock
  | BlockMathBlock
  | DefinitionBlock
  | ThematicBreakBlock
  | HtmlImageBlock
  | TableBlock;

export interface BlockMap {
  blocks: MarkdownBlock[];
}
