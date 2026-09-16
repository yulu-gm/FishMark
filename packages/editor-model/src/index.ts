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
