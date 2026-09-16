export type {
  BlockMap,
  BlockMathBlock,
  BlockquoteBlock,
  BlockquoteMarker,
  CodeFenceBlock,
  DefinitionBlock,
  HeadingBlock,
  HtmlImageBlock,
  InlineLine,
  TableAlignment,
  TableBlock,
  TableCell,
  TableRow,
  TableRowSeparator,
  ListItemBlock,
  ListBlock,
  MarkdownBlock,
  ParagraphBlock,
  ThematicBreakBlock
} from "./block-map";
export type { MarkdownDocument } from "./markdown-document";
// The recursive document model. It is intentionally parser-agnostic and is not yet the
// production parse path: the legacy block-map parser stays authoritative until RF-405.
export {
  ROOT_CONTAINER_PATH,
  childContainerPath,
  compareContainerPaths,
  containerPathDepth,
  containerPathKey,
  isContainerPathAncestor,
  isRootContainerPath,
  sameContainerPath,
  type ContainerPath
} from "./model/container-path";
export {
  collectMarkdownNodeMarkers,
  createMarkdownContainerNode,
  createMarkdownLeafNode,
  isMarkdownContainerKind,
  isMarkdownContainerNode,
  isMarkdownLeafNode,
  markdownNodeDepth,
  type MarkdownBlockMathData,
  type MarkdownCodeFenceData,
  type MarkdownContainerKind,
  type MarkdownContainerNode,
  type MarkdownHeadingData,
  type MarkdownLeafKind,
  type MarkdownLeafNode,
  type MarkdownListData,
  type MarkdownListItemData,
  type MarkdownNode,
  type MarkdownNodeBase,
  type MarkdownNodeData,
  type MarkdownNodeKind,
  type MarkdownPlainData,
  type MarkdownTableAlignment,
  type MarkdownTableCell,
  type MarkdownTableData,
  type MarkdownTableRow
} from "./model/markdown-node";
export {
  collectUnmaskedRanges,
  createSourceRange,
  isEmptySourceRange,
  maskSourceRanges,
  sameSourceRange,
  sourceRangeContainsOffset,
  sourceRangeContainsRange,
  sourceRangeLength,
  sourceRangesOverlap,
  type MarkdownMarkerKind,
  type SourceMarker,
  type SourceRange
} from "./model/source-range";
export {
  assertMarkdownTreeInvariants,
  childrenOf,
  createContainerPrefixedSource,
  createMarkdownDocumentTree,
  createMarkdownNodeId,
  createNodeIdForSource,
  findMarkdownNodeByPath,
  fingerprintMarkdownSource,
  flattenMarkdownTree,
  getMarkdownNodeById,
  type ContainerPrefixedSource,
  type MarkdownDocumentTree
} from "./model/document-tree";
export type {
  MarkdownFullDocumentParseEvent,
  MarkdownFullDocumentParseKind,
  MarkdownParseInstrumentation,
  MarkdownParseOptions
} from "./parse-instrumentation";
export type {
  InlineASTNode,
  InlineBaseNode,
  InlineCodeSpan,
  InlineContainerNode,
  InlineEmphasis,
  InlineFootnoteReference,
  InlineHardBreak,
  InlineImage,
  InlineLink,
  InlineMarker,
  InlineMath,
  InlineNode,
  InlineReferenceDefinition,
  InlineRoot,
  InlineStrong,
  InlineStrikethrough,
  InlineText,
  FootnoteDefinition,
  FootnoteDefinitionBlockData,
  FootnoteDefinitionContentLine,
  FootnoteDefinitionStatus
} from "./inline-ast";
export { parseBlockquoteLinePrefix, type BlockquoteLinePrefix } from "./blockquote";
export {
  resolveIndentedCodeContentStartOffset,
  type CodeBlockKind
} from "./code-block";
export { parseFullDocumentTree } from "./parse/full-document-parser";
export { projectMarkdownDocument } from "./parse/document-projection";
export {
  collectMicromarkEventViews,
  type MicromarkEventView
} from "./parse/micromark-event-adapter";
export {
  collectParseCheckpoints,
  findCheckpointAfter,
  findCheckpointBefore,
  isSafeCheckpoint,
  type OpenFence,
  type ParseCheckpoint
} from "./parse/parse-checkpoint";
export {
  applyTextEdit,
  computeInvalidationWindow,
  type InvalidationWindow,
  type TextEdit
} from "./cache/invalidation-range";
export {
  createDocumentStructureCache,
  createDocumentStructureCacheFromTree,
  type DocumentStructureCache
} from "./cache/document-structure-cache";
export {
  applyIncrementalEdit,
  type IncrementalParseResult,
  type IncrementalParseStats
} from "./cache/incremental-document-parser";
export {
  formatTableMarkdown,
  formatTableMarkdownWithOffsets,
  type FormattedTableWithOffsets,
  type TableCellOffset
} from "./format-table-markdown";
export {
  computeTableColumnLayout,
  formatTableColumnWidthPercent,
  TABLE_COLUMN_CELL_PADDING_WEIGHT,
  TABLE_COLUMN_MAX_CONTENT_WEIGHT,
  TABLE_COLUMN_MIN_READABLE_WEIGHT,
  type TableColumnLayout,
  type TableColumnLayoutInput
} from "./table-column-layout";
export { normalizeReferenceIdentifier, parseInlineAst, type ParseInlineAstOptions } from "./parse-inline-ast";
export { collectFootnoteDefinitions, collectReferenceDefinitions, parseMarkdownDocument } from "./parse-markdown-document";
export {
  createCanonicalTableModel,
  isTableDelimiterLine,
  looksLikeLoosePipeTable,
  looksLikePipeTable,
  parseLoosePipeTable,
  normalizeTableCells,
  parsePipeTable,
  parseTableAlignment,
  splitTableLine,
  tableBlockToCanonicalModel,
  type CanonicalTableModel
} from "./table-model";


