export type InlineNode =
  | InlineText
  | InlineHardBreak
  | InlineStrong
  | InlineEmphasis
  | InlineStrikethrough
  | InlineCodeSpan
  | InlineLink
  | InlineImage;
export type InlineASTNode = InlineRoot | InlineNode;

export interface InlineBaseNode {
  type: string;
  startOffset: number;
  endOffset: number;
}

export interface InlineMarker {
  startOffset: number;
  endOffset: number;
}

export interface InlineText extends InlineBaseNode {
  type: "text";
  value: string;
}

export interface InlineHardBreak extends InlineBaseNode {
  type: "hardBreak";
}

export interface InlineContainerNode extends InlineBaseNode {
  type: "strong" | "emphasis" | "strikethrough" | "link" | "image";
  children: InlineNode[];
  openMarker: InlineMarker;
  closeMarker: InlineMarker;
}

export interface InlineStrong extends InlineContainerNode {
  type: "strong";
}

export interface InlineEmphasis extends InlineContainerNode {
  type: "emphasis";
}

export interface InlineStrikethrough extends InlineContainerNode {
  type: "strikethrough";
}

export interface InlineCodeSpan extends InlineBaseNode {
  type: "codeSpan";
  text: string;
  openMarker: InlineMarker;
  closeMarker: InlineMarker;
}

export interface InlineLink extends InlineContainerNode {
  type: "link";
  href: string | null;
  title: string | null;
  destinationStartOffset: number | null;
  destinationEndOffset: number | null;
  titleStartOffset: number | null;
  titleEndOffset: number | null;
}

export interface InlineImage extends InlineContainerNode {
  type: "image";
  href: string | null;
  title: string | null;
  destinationStartOffset: number | null;
  destinationEndOffset: number | null;
  titleStartOffset: number | null;
  titleEndOffset: number | null;
}

export interface InlineReferenceDefinition {
  href: string;
  title: string | null;
  destinationStartOffset: number;
  destinationEndOffset: number;
  titleStartOffset: number | null;
  titleEndOffset: number | null;
}

export interface InlineRoot extends InlineBaseNode {
  type: "root";
  children: InlineNode[];
}
