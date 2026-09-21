import {
  childrenOf,
  type FootnoteDefinition,
  type InlineReferenceDefinition
} from "@fishmark/markdown-engine";
import type {
  EditorDerivedSnapshot,
  EditorOutlineHeading
} from "./editor-derived-snapshot";
import type {
  PhysicalEditingDocument as CanonicalPhysicalDocument
} from "../physical-lines/physical-editing-document";

import {
  createActiveBlockState,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active/active-block";
import { deriveTableCursorState, type TableCursorState } from "../active/table-cursor-state";
import {
  createSemanticEditingDocument as createPhysicalEditingDocument,
  type EditingLine,
  type SemanticEditingDocument as PhysicalEditingDocument
} from "../semantic-lines/semantic-editing-document";
import { measureEditorCorePerformance } from "./runtime-performance-log";

export type { EditorOutlineHeading } from "./editor-derived-snapshot";

export type EditorDerivedState = {
  source: string;
  selection: ActiveBlockSelection;
  editingDocument: PhysicalEditingDocument;
  activeLine: EditingLine;
  activeBlockState: ActiveBlockState;
  tableCursor: TableCursorState | null;
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
  outlineHeadings: readonly EditorOutlineHeading[];
};

export type CreateEditorDerivedStateOptions = {
  snapshot: EditorDerivedSnapshot;
  selection: ActiveBlockSelection;
  previousTableCursor?: TableCursorState | null;
};

// Only document-derived geometry is retained. Selection, active block and table focus are always
// recomputed, while the canonical model document changes identity on every revision.
const documentGeometry = new WeakMap<CanonicalPhysicalDocument, PhysicalEditingDocument>();

// Everything here is derived from the canonical snapshot: the active block, the table cursor and
// the outline all read the same tree, so no consumer needs a second document representation.
export function createEditorDerivedState(
  options: CreateEditorDerivedStateOptions
): EditorDerivedState {
  const { snapshot, selection } = options;

  return measureEditorCorePerformance(
    "editorCore:createEditorDerivedState.total",
    () => {
      const activeBlockState = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.activeBlock",
        (): ActiveBlockState => ({
          ...createActiveBlockState(snapshot, selection),
          tableCursor: measureEditorCorePerformance(
            "editorCore:createEditorDerivedState.tableCursor",
            () => deriveTableCursorState(snapshot, selection, options.previousTableCursor ?? null),
            {
              chars: snapshot.source.length
            }
          )
        }),
        {
          chars: snapshot.source.length
        }
      );
      const canonicalDocument = snapshot.document;
      const rootBlockCount = childrenOf(snapshot.tree.root).length;
      const editingDocument = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.physicalEditingDocument",
        () => {
          return documentGeometry.get(canonicalDocument) ??
            createPhysicalEditingDocument(canonicalDocument, snapshot);
        },
        {
          blocks: rootBlockCount,
          chars: snapshot.source.length
        }
      );
      const activeLine = editingDocument.getLineAtOffset(selection.head) ?? editingDocument.lines[0]!;
      const outlineHeadings = snapshot.outlineHeadings;

      documentGeometry.set(canonicalDocument, editingDocument);

      return {
        source: snapshot.source,
        selection,
        editingDocument,
        activeLine,
        activeBlockState,
        tableCursor: activeBlockState.tableCursor,
        referenceDefinitions: snapshot.tree.referenceDefinitions,
        footnoteDefinitions: snapshot.tree.footnoteDefinitions,
        outlineHeadings
      };
    },
    { chars: snapshot.source.length }
  );
}

