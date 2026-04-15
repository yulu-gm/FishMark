export interface BaseBlock {
  id: string;
  type: "heading" | "paragraph" | "list" | "blockquote";
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

export interface ListBlock extends BaseBlock {
  type: "list";
  ordered: boolean;
}

export interface BlockquoteBlock extends BaseBlock {
  type: "blockquote";
}

export type MarkdownBlock = HeadingBlock | ParagraphBlock | ListBlock | BlockquoteBlock;

export interface BlockMap {
  blocks: MarkdownBlock[];
}
