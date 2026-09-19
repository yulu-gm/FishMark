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
