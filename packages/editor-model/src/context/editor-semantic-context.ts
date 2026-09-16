import type { ContainerPath, MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalEditingDocument, PhysicalLine } from "../physical-lines/physical-editing-document";

import {
  assertSnapshotRevision,
  deriveSelectionSnapshot,
  type EditorDerivedSnapshot,
  type EditorSelectionSnapshot,
  type TableCursor
} from "../derived/editor-derived-snapshot";
import type { EditorSelection, SelectionContext } from "./selection-context";

// One immutable semantic context per command invocation. It is the only thing commands read:
// no command parses Markdown, and no command touches CodeMirror state.
export interface EditorSemanticContext {
  readonly revision: number;
  readonly source: string;
  readonly snapshot: EditorDerivedSnapshot;
  readonly selection: EditorSelectionSnapshot;
  readonly lines: PhysicalEditingDocument;
  lineAt(offset: number): PhysicalLine | null;
  nodeAt(offset: number): MarkdownNode | null;
  nodeById(id: string): MarkdownNode | null;
  containerPathAt(offset: number): ContainerPath | null;
  tableAt(offset: number): TableCursor | null;
  selectionContext: SelectionContext;
}

export function createEditorSemanticContext(input: {
  readonly snapshot: EditorDerivedSnapshot;
  readonly selection: EditorSelection;
  readonly revision?: number;
}): EditorSemanticContext {
  if (input.revision !== undefined) {
    // A command that was scheduled against an older revision must fail closed instead of
    // editing a document it never saw.
    assertSnapshotRevision(input.snapshot, input.revision);
  }

  const selection = deriveSelectionSnapshot(input.snapshot, input.selection);

  return Object.freeze({
    revision: input.snapshot.revision,
    source: input.snapshot.source,
    snapshot: input.snapshot,
    selection,
    lines: input.snapshot.document,
    selectionContext: selection.selection,
    lineAt: (offset: number) => input.snapshot.lineAt(offset),
    nodeAt: (offset: number) => input.snapshot.nodeAt(offset),
    nodeById: (id: string) => input.snapshot.nodeById(id),
    containerPathAt: (offset: number) => input.snapshot.containerPathAt(offset),
    tableAt: (offset: number) => input.snapshot.tableAt(offset)
  });
}

// Only the selection-derived part is recomputed when the cursor moves; the document-derived
// snapshot is passed through untouched.
export function reselectEditorSemanticContext(
  context: EditorSemanticContext,
  selection: EditorSelection
): EditorSemanticContext {
  return createEditorSemanticContext({ snapshot: context.snapshot, selection });
}

