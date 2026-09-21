import {
  childrenOf,
  isMarkdownLeafNode,
  type FootnoteDefinition,
  type InlineNode,
  type InlineReferenceDefinition,
  type InlineRoot
} from "@fishmark/markdown-engine";
import type { EditorDerivedSnapshot } from "./editor-derived-snapshot";
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

export type EditorOutlineHeading = {
  /** Canonical node id of the root-level heading, not a projection block id. */
  id: string;
  depth: number;
  label: string;
  startOffset: number;
  startLine: number;
};

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
const documentGeometry = new WeakMap<CanonicalPhysicalDocument, {
  editingDocument: PhysicalEditingDocument;
  outlineHeadings: readonly EditorOutlineHeading[];
}>();

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
          const cached = documentGeometry.get(canonicalDocument);
          return cached?.editingDocument ?? createPhysicalEditingDocument(canonicalDocument, snapshot);
        },
        {
          blocks: rootBlockCount,
          chars: snapshot.source.length
        }
      );
      const activeLine = editingDocument.getLineAtOffset(selection.head) ?? editingDocument.lines[0]!;
      const outlineHeadings = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.outlineHeadings",
        () => documentGeometry.get(canonicalDocument)?.outlineHeadings ?? createOutlineHeadings(snapshot),
        {
          blocks: rootBlockCount,
          chars: snapshot.source.length
        }
      );

      documentGeometry.set(canonicalDocument, { editingDocument, outlineHeadings });

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

// Root-level headings only, in document order. Geometry comes from the canonical leaf the same way
// canonicalLeafView derives widget ranges, so an outline entry and its decoration agree.
function createOutlineHeadings(snapshot: EditorDerivedSnapshot): EditorOutlineHeading[] {
  const headings: EditorOutlineHeading[] = [];

  for (const node of childrenOf(snapshot.tree.root)) {
    if (!isMarkdownLeafNode(node) || node.data.kind !== "heading") {
      continue;
    }

    const line = snapshot.lineAt(node.source.startOffset);

    if (line === null) {
      continue;
    }

    headings.push({
      id: node.id,
      depth: node.data.depth,
      label: normalizeOutlineLabel(readInlineText(node.inline)),
      startOffset: line.range.startOffset,
      startLine: line.lineNumber
    });
  }

  return headings;
}

function readInlineText(inline: InlineRoot | undefined): string {
  if (!inline) {
    return "";
  }

  return inline.children.map((node) => readInlineNode(node)).join("");
}

function readInlineNode(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "hardBreak":
      return " ";
    case "codeSpan":
      return node.text;
    case "footnoteReference":
      return node.label;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.map((child) => readInlineNode(child)).join("");
    default:
      return "";
  }
}

function normalizeOutlineLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : "Untitled heading";
}
