export type MarkdownFullDocumentParseKind =
  | "reference-definitions"
  | "block-map"
  | "full-document-tree";

export type MarkdownFullDocumentParseEvent = {
  kind: MarkdownFullDocumentParseKind;
  sourceLength: number;
};

export type MarkdownParseInstrumentation = {
  onFullDocumentParse: (event: MarkdownFullDocumentParseEvent) => void;
  onInlineParse?: (event: { startOffset: number; endOffset: number; sourceLength: number }) => void;
};

export type MarkdownParseOptions = {
  instrumentation?: MarkdownParseInstrumentation;
};
