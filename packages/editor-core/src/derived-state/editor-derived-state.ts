import type {
  HeadingBlock,
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
  outlineHeadings: readonly EditorOutlineHeading[];
};

export type CreateEditorDerivedStateOptions = {
  source: string;
  selection: ActiveBlockSelection;
  parseMarkdownDocument: ParseEditorMarkdownDocument;
  previousTableCursor?: TableCursorState | null;
};

export function createEditorDerivedState(
  options: CreateEditorDerivedStateOptions
): EditorDerivedState {
  const markdownDocument = options.parseMarkdownDocument(options.source);
  const editingDocument = createPhysicalEditingDocument(options.source, markdownDocument);
  const activeLine = editingDocument.getLineAtOffset(options.selection.head) ?? editingDocument.lines[0]!;
  const tableCursor = deriveTableCursorState(
    options.source,
    options.selection,
    markdownDocument,
    options.previousTableCursor ?? null
  );
  const activeBlockState: ActiveBlockState = {
    ...createActiveBlockStateFromMarkdownDocument(markdownDocument, options.selection),
    tableCursor
  };

  return {
    source: options.source,
    selection: options.selection,
    markdownDocument,
    editingDocument,
    activeLine,
    activeBlockState,
    tableCursor,
    referenceDefinitions: markdownDocument.referenceDefinitions,
    outlineHeadings: createOutlineHeadings(markdownDocument)
  };
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
