// `@fishmark/codemirror-adapter` is the CodeMirror side of the semantic engine. It converts
// browser transactions to and from `@fishmark/editor-model` plans, owns the per-view document
// structure cache, and owns composition (IME) and history grouping. It holds no Markdown rules
// and no transport state: the renderer's existing pending queue and edit client stay the only
// owners of sequencing and acknowledgement.

export {
  IDLE_COMPOSITION_STATE,
  COMPOSITION_GEOMETRY_REFRESH_REASON,
  beginComposition,
  finishComposition,
  isComposing,
  noteCompositionDataChange,
  noteCompositionGeometryEvent,
  readCompositionStatus,
  type CompositionFinishReceipt,
  type CompositionState,
  type CompositionStatus
} from "./composition-controller";

export {
  SelectionMapper,
  assertPlanRevisionCurrent,
  checkPlanRevision,
  createEditorLocalRevision,
  createSelectionMapper,
  requiresStructureRefresh,
  sameEditorSelection,
  type EditorLocalRevision,
  type PlanRevisionCheck
} from "./selection-mapper";

export {
  EditorPlanSessions,
  beginCompositionEffect,
  buildFrame,
  buildTransactionSpec,
  compositionStateField,
  createEditorTransactionAdapter,
  editorStructureCacheField,
  editorStructureObserver,
  type EditorStructureObserver,
  finishCompositionEffect,
  historyAnnotationFor,
  noteCompositionGeometryEffect,
  readCompositionState,
  readEditorStructureCache,
  resetCompositionEffect,
  type AdapterTextChange,
  type CreateEditorTransactionAdapterOptions,
  type EditorAdapterSession,
  type EditorChangeFrame,
  type EditorChangeFramePort,
  type EditorDispatchOutcome,
  type EditorPlanSession,
  type EditorPreparedCommand,
  type EditorStructureCacheReader,  type EditorTransactionAdapter,
  type FrameAdmission
} from "./transaction-adapter";
export {
  createSemanticCommandBindings,
  runSemanticCommand,
  planSemanticEnter,
  planSemanticBackspace,
  planSemanticDelete,
  planSemanticTab,
  planSemanticShiftTab,
  planSemanticArrow,
  type SemanticCommandBindings,
  type SemanticCommandPlanner,
  type SemanticCommandResult
} from "./semantic-keypress";
export { createCanonicalSeparatorField } from "./canonical-separators";
export {
  resolveArrowDown,
  resolveArrowUp,
  resolvePointerSelectionAnchor,
  type VerticalNavigationResult
} from "./interactions";
export {
  runMarkdownArrowDown,
  runMarkdownArrowUp,
  runMarkdownBackspace,
  runMarkdownEnter,
  runMarkdownHardBreak,
  runMarkdownShiftTab,
  runMarkdownTab
} from "./codemirror-markdown-commands";
export {
  createBlockDecorations,
  createBlockDecorationSignature,
  createInactiveInlineDecorations,
  createTableWidgetDecoration,
  getBlockLineInfos,
  getInactiveBlockquoteLines,
  getInactiveCodeFenceLines,
  getInactiveHeadingMarkerEnd,
  type BlockDecorationsResult,
  type BlockLineInfo,
  type InactiveBlockquoteLine,
  type InactiveCodeFenceLine,
  type TableWidgetCallbacks
} from "./decorations";
export { createSelectionScopedBlockDecorations } from "./decorations/block-decorations";
export {
  INACTIVE_INLINE_LINK_HREF_ATTRIBUTE,
  INACTIVE_INLINE_LINK_SELECTOR
} from "./decorations/inline-decorations";
export {
  INACTIVE_INLINE_FOOTNOTE_REFERENCE_IDENTIFIER_ATTRIBUTE,
  INACTIVE_INLINE_FOOTNOTE_REFERENCE_SELECTOR
} from "./decorations/footnote-widgets";
export { clearCodeHighlightCache } from "./decorations/code-highlight-cache";
export {
  clearCodeHighlightLanguageLoaderState,
  subscribeCodeHighlightParserLoaded,
  waitForPendingCodeHighlightLanguageLoads
} from "./decorations/code-highlight-language-loader";
export {
  findActiveTableBlock,
  getTableCell,
  locateTablePosition,
  readTableContext,
  type TableContext,
  type TablePosition
} from "./table-context";
export {
  runTableBackspaceFromLineBelow,
  runTableDelete,
  runTableDeleteColumn,
  runTableDeleteRow,
  runTableEnterFromLineAbove,
  runTableEnterFromLineBelow,
  runTableInsertColumnLeft,
  runTableInsertColumnRight,
  runTableInsertRowAbove,
  runTableInsertRowBelow,
  runTableMoveDown,
  runTableMoveDownOrExit,
  runTableMoveLeft,
  runTableMoveRight,
  runTableMoveUp,
  runTableNextCell,
  runTablePreviousCell,
  runTableSelectCell,
  runTableUpdateCell
} from "./table-commands";
export {
  runListEnter,
  runListIndentOnTab,
  runListMoveLineDown,
  runListMoveLineUp,
  runListOutdentOnShiftTab
} from "./list-commands";
export { toggleEmphasis, toggleStrong } from "./toggle-inline-commands";
export {
  toggleBlockquote,
  toggleBulletList,
  toggleCodeFence,
  toggleHeading
} from "./toggle-block-commands";
export {
  createFishMarkMarkdownExtensions,
  refreshMarkdownDecorations,
  type CreateFishMarkMarkdownExtensionsOptions
} from "./extensions/markdown";
export {
  DEFAULT_EDITOR_VIEW_MODE,
  createMarkdownEditorViewModeExtension,
  getMarkdownEditorViewMode,
  markdownEditorViewModeField,
  setMarkdownEditorViewMode,
  setMarkdownEditorViewModeEffect,
  type EditorViewMode
} from "./editor-view-mode";
export {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  SHORTCUT_GROUPS,
  TABLE_EDITING_SHORTCUT_GROUP,
  formatShortcutHintKey,
  type ShortcutDescriptor,
  type ShortcutGroup,
  type ShortcutGroupId,
  type ShortcutId
} from "./shortcut-descriptors";
export {
  TEXT_EDITING_SHORTCUTS,
  createGroupedShortcutKeymaps,
  createTextEditingShortcutKeymap,
  type TextEditingShortcut
} from "./markdown-shortcuts";
export {
  measureEditorPerformanceProbe,
  type EditorPerformanceOperationName,
  type EditorPerformanceOperationResult,
  type EditorPerformanceProbeReport
} from "./performance/editor-performance-probe";
export {
  INCREMENTAL_STRUCTURE_CACHE_REASON,
  type EditorPerformanceCounters,
  type EditorPerformanceParserEntries
} from "./performance-counters";
export {
  deriveInactiveBlockDecorationsState,
  type DeriveInactiveBlockDecorationsStateOptions,
  type InactiveBlockDecorationsDerivedState
} from "./derived-state/inactive-block-decorations";
