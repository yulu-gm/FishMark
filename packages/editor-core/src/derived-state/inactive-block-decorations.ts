import { createBlockDecorations } from "../decorations";
import type { TableWidgetCallbacks } from "../decorations";
import type { ActiveBlockSelection, ActiveBlockState } from "../active-block";
import type { TableCursorState } from "../table-cursor-state";
import type { BlockMapCache } from "./block-map-cache";
import {
  createEditorDerivedState,
  type EditorDerivedState
} from "./editor-derived-state";
import type { MarkdownDocumentCache } from "./markdown-document-cache";

export type DeriveInactiveBlockDecorationsStateOptions = {
  source: string;
  selection: ActiveBlockSelection;
  hasEditorFocus: boolean;
  editorDerivedState?: EditorDerivedState;
  markdownDocumentCache?: MarkdownDocumentCache;
  blockMapCache?: BlockMapCache;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  previousTableCursor?: TableCursorState | null;
};

export type InactiveBlockDecorationsDerivedState = {
  activeBlockState: ActiveBlockState;
  decorationSet: ReturnType<typeof createBlockDecorations>["decorationSet"];
  signature: string;
};

export function deriveInactiveBlockDecorationsState(
  options: DeriveInactiveBlockDecorationsStateOptions
): InactiveBlockDecorationsDerivedState {
  if (!options.editorDerivedState && !options.markdownDocumentCache && !options.blockMapCache) {
    throw new Error(
      "deriveInactiveBlockDecorationsState requires editorDerivedState, markdownDocumentCache, or blockMapCache"
    );
  }

  const editorDerivedState = options.editorDerivedState ?? createEditorDerivedState({
    source: options.source,
    selection: options.selection,
    parseMarkdownDocument: options.markdownDocumentCache
      ? options.markdownDocumentCache.read
      : options.blockMapCache!.read,
    previousTableCursor: options.previousTableCursor ?? null
  });

  const { decorationSet, signature: blockSignature } = createBlockDecorations({
    activeBlockState: editorDerivedState.activeBlockState,
    activeLine: editorDerivedState.activeLine,
    editingDocument: editorDerivedState.editingDocument,
    hasEditorFocus: options.hasEditorFocus,
    source: options.source,
    referenceDefinitions: editorDerivedState.referenceDefinitions,
    resolveImagePreviewUrl: options.resolveImagePreviewUrl,
    tableWidgetCallbacks: options.tableWidgetCallbacks
  });

  return {
    activeBlockState: editorDerivedState.activeBlockState,
    decorationSet,
    signature: blockSignature
  };
}
