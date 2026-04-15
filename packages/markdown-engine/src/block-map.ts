export interface BaseBlock {
  id: string;
  type: "heading" | "paragraph" | "list" | "blockquote" | "codeFence";
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  depth: number;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
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
  task: ListItemTaskMarker | null;
}

export interface ListBlock extends BaseBlock {
  type: "list";
  ordered: boolean;
  items: readonly ListItemBlock[];
}

export interface BlockquoteBlock extends BaseBlock {
  type: "blockquote";
}

export interface CodeFenceBlock extends BaseBlock {
  type: "codeFence";
  info: string | null;
}

export type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | BlockquoteBlock
  | CodeFenceBlock;

export interface BlockMap {
  blocks: MarkdownBlock[];
}
