export {
  advanceVisibleColumn,
  createPrefixSegment,
  hiddenPrefixColumns,
  prefixSegmentAtColumn,
  type PrefixSegment,
  type PrefixSegmentKind
} from "./physical-lines/prefix-segment";
export {
  createPhysicalEditingDocument,
  type PhysicalEditingDocument,
  type PhysicalLine,
  type PhysicalLineRole
} from "./physical-lines/physical-editing-document";
export {
  createSelectionContext,
  sameSelection,
  clampSelectionToSource,
  type EditorSelection,
  type SelectionContext
} from "./context/selection-context";
export {
  createEditorSemanticContext,
  reselectEditorSemanticContext,
  type EditorSemanticContext
} from "./context/editor-semantic-context";
export {
  applyEditorDerivedEdit,
  assertSnapshotRevision,
  createEditorDerivedSnapshot,
  createEditorDerivedSnapshotFromCache,
  deriveSelectionSnapshot,
  type EditorDerivedEditResult,
  type EditorDerivedSnapshot,
  type EditorDocumentMetrics,
  type EditorOutlineHeading,
  type EditorSelectionSnapshot,
  type TableCursor
} from "./derived/editor-derived-snapshot";
export {
  createEditorDerivedState,
  type CreateEditorDerivedStateOptions,
  type EditorDerivedState
} from "./derived/editor-derived-state";
export {
  createActiveBlockState,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "./active/active-block";
export {
  deriveTableCursorState,
  isInsideTableCursor,
  type TableCursorMode,
  type TableCursorState
} from "./active/table-cursor-state";
export {
  assertPlanAppliesToRevision,
  createEditTransactionPlan,
  createEditorCommandRegistry,
  type EditTransactionPlan,
  type EditorCommand,
  type EditorCommandId,
  type EditorCommandRegistry,
  type TextEditOperation
} from "./transactions/edit-transaction-plan";
export {
  decideEnter,
  planEnter,
  type EnterDecision,
  type EnterPlanKind
} from "./commands/enter";

export {
  decideBackspace,
  planBackspace,
  type BackspaceDecision,
  type BackspacePlanKind
} from "./commands/backspace";
export {
  decideDelete,
  planDelete,
  type DeleteDecision,
  type DeletePlanKind
} from "./commands/delete";

export {
  INDENT_UNIT,
  decideIndentIn,
  decideIndentOut,
  planIndent,
  planIndentIn,
  planIndentOut,
  type IndentDecision,
  type IndentPlanKind
} from "./commands/indent";
export {
  INTENT_POLICIES,
  planPointerSelection,
  planPrintableInput,
  planHardBreak,
  planProgrammaticNormalization,
  planVerticalNavigation,
  policyFor,
  type IntentPolicy,
  type NavigationIntent
} from "./commands/navigation";

export {
  decideBlockquoteToggle,
  decideBulletListToggle,
  decideEmphasisToggle,
  decideHeadingToggle,
  decideStrongToggle,
  planBlockquoteToggle,
  planBulletListToggle,
  planEmphasisToggle,
  planHeadingToggle,
  planStrongToggle,
  type FormattingDecision,
  type FormattingPlanKind
} from "./commands/formatting";
export {
  planTableDelete,
  planTableDeleteColumn,
  planTableDeleteRow,
  planTableExitBelow,
  planTableInsertColumnLeft,
  planTableInsertColumnRight,
  planTableInsertRowAbove,
  planTableInsertRowBelow,
  planTableMoveToCell,
  planTableNextCell,
  planTablePreviousCell,
  planTableMoveHorizontal,
  planTableMoveVertical,
  planTableBackspaceFromBelow,
  planTableUpdateCell,
  readTableSnapshot,
  tablePositionAt,
  type TableDecision,
  type TablePlanKind,
  type TablePosition,
  type TableSnapshot
} from "./commands/table";
export {
  decideCodeFenceToggle,
  planCodeFenceCompletion,
  planCodeFenceEnter,
  planCodeFenceIndent,
  planCodeFenceToggle,
  type CodeFenceDecision,
  type CodeFencePlanKind
} from "./commands/code-fence";

export {
  decideMoveListItem,
  planMoveListItemDown,
  planMoveListItemUp,
  type ListMoveDecision,
  type ListMovePlanKind
} from "./commands/list-move";
export { planNormalizeOrderedListScopes } from "./commands/ordered-list";

// Semantic line layer: pairs the canonical PhysicalLine geometry with the roles resolved from the
// canonical tree, plus the pure source/line helpers the interaction layer reads.
export {
  createCanonicalSemanticLineRoles,
  type SemanticLineInput,
  type SemanticLineRole
} from "./semantic-lines/canonical-semantic-lines";
export {
  createSemanticEditingDocument,
  type EditingLine,
  type EditingLineKind,
  type SemanticEditingDocument,
  type SemanticLine,
  type SemanticLineMap
} from "./semantic-lines/semantic-editing-document";
export {
  findCanonicalBlockquoteStructuralSeparatorAt,
  findCanonicalPreviousBlockquoteStructuralSeparator,
  type BlockquoteStructuralSeparator
} from "./semantic-lines/blockquote-structural-separators";
export {
  createStructuralLineModel,
  resolveStructuralLineDeleteRange,
  type StructuralLineModel,
  type StructuralLineRole,
  type StructuralLineSeparator
} from "./semantic-lines/structural-line-model";
export {
  anchorForVisibleLineColumn,
  createVisibleLine,
  normalizeHiddenLineSelectionAnchor,
  normalizeHiddenSelectionAnchor,
  normalizeStructuralBlankSelectionAnchor,
  visibleLineColumn,
  type LineVisibilityParams,
  type VisibleLine
} from "./semantic-lines/line-visibility";
export {
  normalizeHiddenInlineAnchor,
  normalizeHiddenInlineSelectionAnchor,
  resolveVisibleInlineStartAnchor
} from "./semantic-lines/hidden-markers";
export {
  createLineInfosInRange,
  resolveLineStartOffset,
  trimTrailingCarriageReturn,
  type SourceLineInfo
} from "./semantic-lines/source-utils";
export { nodeRequiresLeadingStructuralSeparator } from "./semantic-lines/structural-blank-lines";
export {
  getBlockLineInfos,
  getInactiveBlockquoteLines,
  getInactiveCodeFenceLines,
  type BlockLineInfo,
  type InactiveBlockquoteLine,
  type InactiveCodeFenceLine
} from "./semantic-lines/block-lines";
export {
  buildContinuationPrefix,
  getBackspaceLineStart,
  getCodeFenceEditableAnchor,
  parseBlockquoteLine,
  parseCodeFenceLine,
  parseListLine,
  type ParsedBlockquoteLine,
  type ParsedListLine
} from "./semantic-lines/line-parsers";
export {
  countMarkdownLines,
  createLongMarkdownFixture,
  type LongMarkdownFixture,
  type LongMarkdownFixtureInput,
  type LongMarkdownFixtureKind
} from "./performance/long-document-fixtures";

