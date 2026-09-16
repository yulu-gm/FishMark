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
  type EditorSelectionSnapshot,
  type TableCursor
} from "./derived/editor-derived-snapshot";
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

