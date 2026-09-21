import { createBlockDecorations } from "../decorations";
import type {
  ActiveBlockSelection,
  ActiveBlockState,
  EditorDerivedSnapshot,
  TableCursorState
} from "@fishmark/editor-model";
import type { TableWidgetCallbacks } from "../decorations";
import {
  createEditorDerivedState,
  type EditorDerivedState
} from "@fishmark/editor-model";
import type { EditorViewMode } from "../editor-view-mode";

export type DeriveInactiveBlockDecorationsStateOptions = {
  snapshot: EditorDerivedSnapshot;
  selection: ActiveBlockSelection;
  hasEditorFocus: boolean;
  editorDerivedState?: EditorDerivedState;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  previousTableCursor?: TableCursorState | null;
  viewMode?: EditorViewMode;
};

export type InactiveBlockDecorationsDerivedState = {
  activeBlockState: ActiveBlockState;
  decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"];
  signature: string;
};

export function deriveInactiveBlockDecorationsState(
  options: DeriveInactiveBlockDecorationsStateOptions
): InactiveBlockDecorationsDerivedState {
  const editorDerivedState = options.editorDerivedState ?? createEditorDerivedState({
    snapshot: options.snapshot,
    selection: options.selection,
    previousTableCursor: options.previousTableCursor ?? null
  });

  const { decorationSet, signature: blockSignature } = createBlockDecorations({
    snapshot: options.snapshot,
    activeBlockState: editorDerivedState.activeBlockState,
    activeLine: editorDerivedState.activeLine,
    editingDocument: editorDerivedState.editingDocument,
    hasEditorFocus: options.hasEditorFocus,
    source: options.snapshot.source,
    referenceDefinitions: editorDerivedState.referenceDefinitions,
    footnoteDefinitions: editorDerivedState.footnoteDefinitions,
    resolveImagePreviewUrl: options.resolveImagePreviewUrl,
    tableWidgetCallbacks: options.tableWidgetCallbacks,
    viewMode: options.viewMode
  });

  return {
    activeBlockState: editorDerivedState.activeBlockState,
    decorationSet,
    signature: blockSignature
  };
}
