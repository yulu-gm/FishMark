import type { MarkdownDocument } from "@yulora/markdown-engine";

import { createBlockDecorations } from "../decorations";
import type { TableWidgetCallbacks } from "../decorations";
import {
  createActiveBlockStateFromMarkdownDocument,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active-block";
import {
  deriveTableCursorState,
  type TableCursorState
} from "../table-cursor-state";
import type { BlockMapCache } from "./block-map-cache";
import type { MarkdownDocumentCache } from "./markdown-document-cache";

export type DeriveInactiveBlockDecorationsStateOptions = {
  source: string;
  selection: ActiveBlockSelection;
  hasEditorFocus: boolean;
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
  if (!options.markdownDocumentCache && !options.blockMapCache) {
    throw new Error(
      "deriveInactiveBlockDecorationsState requires markdownDocumentCache or blockMapCache"
    );
  }

  const markdownDocument: MarkdownDocument = options.markdownDocumentCache
    ? options.markdownDocumentCache.read(options.source)
    : options.blockMapCache!.read(options.source);

  const activeBlockState = createActiveBlockStateFromMarkdownDocument(
    markdownDocument,
    options.selection
  );
  const tableCursor = deriveTableCursorState(
    options.source,
    options.selection,
    markdownDocument,
    options.previousTableCursor ?? null
  );
  const nextActiveBlockState: ActiveBlockState = {
    ...activeBlockState,
    tableCursor
  };

  const { decorationSet, signature: blockSignature } = createBlockDecorations({
    activeBlockState: nextActiveBlockState,
    hasEditorFocus: options.hasEditorFocus,
    source: options.source,
    resolveImagePreviewUrl: options.resolveImagePreviewUrl,
    tableWidgetCallbacks: options.tableWidgetCallbacks
  });

  return {
    activeBlockState: nextActiveBlockState,
    decorationSet,
    signature: blockSignature
  };
}
