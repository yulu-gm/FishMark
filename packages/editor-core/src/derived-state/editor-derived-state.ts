import type {
  HeadingBlock,
  FootnoteDefinition,
  InlineNode,
  InlineReferenceDefinition,
  InlineRoot,
  MarkdownDocument
} from "@fishmark/markdown-engine";

import {
  createActiveBlockStateFromMarkdownDocument,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active-block";
import {
  createPhysicalEditingDocument,
  type EditingLine,
  type PhysicalEditingDocument
} from "../physical-editing-document";
import {
  deriveTableCursorState,
  type TableCursorState
} from "../table-cursor-state";
import { measureEditorCorePerformance } from "../performance/runtime-performance-log";

export type ParseEditorMarkdownDocument = (source: string) => MarkdownDocument;

export type EditorOutlineHeading = {
  id: string;
  depth: number;
  label: string;
  startOffset: number;
  startLine: number;
};

export type EditorDerivedState = {
  source: string;
  selection: ActiveBlockSelection;
  markdownDocument: MarkdownDocument;
  editingDocument: PhysicalEditingDocument;
  activeLine: EditingLine;
  activeBlockState: ActiveBlockState;
  tableCursor: TableCursorState | null;
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
  outlineHeadings: readonly EditorOutlineHeading[];
};

export type CreateEditorDerivedStateOptions = {
  source: string;
  selection: ActiveBlockSelection;
  parseMarkdownDocument: ParseEditorMarkdownDocument;
  previousTableCursor?: TableCursorState | null;
};

// Only document-derived geometry is retained. Selection, active block and table focus are always
// recomputed, while the rich projection's identity changes on every document revision.
const documentGeometry = new WeakMap<MarkdownDocument, {
  source: string;
  editingDocument: PhysicalEditingDocument;
  outlineHeadings: readonly EditorOutlineHeading[];
}>();

export function createEditorDerivedState(
  options: CreateEditorDerivedStateOptions
): EditorDerivedState {
  return measureEditorCorePerformance(
    "editorCore:createEditorDerivedState.total",
    () => {
      const markdownDocument = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.parseMarkdownDocument",
        () => options.parseMarkdownDocument(options.source),
        { chars: options.source.length }
      );
      const editingDocument = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.physicalEditingDocument",
        () => {
          const cached = documentGeometry.get(markdownDocument);
          return cached?.source === options.source
            ? cached.editingDocument
            : createPhysicalEditingDocument(options.source, markdownDocument);
        },
        {
          blocks: markdownDocument.blocks.length,
          chars: options.source.length
        }
      );
      const activeLine = editingDocument.getLineAtOffset(options.selection.head) ?? editingDocument.lines[0]!;
      const tableCursor = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.tableCursor",
        () =>
          deriveTableCursorState(
            options.source,
            options.selection,
            markdownDocument,
            options.previousTableCursor ?? null
          ),
        {
          blocks: markdownDocument.blocks.length,
          chars: options.source.length
        }
      );
      const activeBlockState: ActiveBlockState = {
        ...measureEditorCorePerformance(
          "editorCore:createEditorDerivedState.activeBlock",
          () => createActiveBlockStateFromMarkdownDocument(markdownDocument, options.selection),
          {
            blocks: markdownDocument.blocks.length,
            chars: options.source.length
          }
        ),
        tableCursor
      };
      const outlineHeadings = measureEditorCorePerformance(
        "editorCore:createEditorDerivedState.outlineHeadings",
        () => documentGeometry.get(markdownDocument)?.outlineHeadings ?? createOutlineHeadings(markdownDocument),
        {
          blocks: markdownDocument.blocks.length,
          chars: options.source.length
        }
      );

      documentGeometry.set(markdownDocument, { source: options.source, editingDocument, outlineHeadings });

      return {
        source: options.source,
        selection: options.selection,
        markdownDocument,
        editingDocument,
        activeLine,
        activeBlockState,
        tableCursor,
        referenceDefinitions: markdownDocument.referenceDefinitions,
        footnoteDefinitions: markdownDocument.footnoteDefinitions,
        outlineHeadings
      };
    },
    { chars: options.source.length }
  );
}

function createOutlineHeadings(markdownDocument: MarkdownDocument): EditorOutlineHeading[] {
  return markdownDocument.blocks
    .filter((block): block is HeadingBlock => block.type === "heading")
    .map((heading) => ({
      id: heading.id,
      depth: heading.depth,
      label: normalizeOutlineLabel(readInlineText(heading.inline)),
      startOffset: heading.startOffset,
      startLine: heading.startLine
    }));
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
