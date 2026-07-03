import type { MarkdownBlock, MarkdownDocument } from "@fishmark/markdown-engine";

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
  createStructuralLineModel,
  type StructuralLineModel,
  type StructuralLineRole
} from "../structural-line-model";
import { parseBlockquoteLine } from "../commands/line-parsers";
import { findBlockPathAt, type BlockPathEntry } from "./block-path";
import { detectDraftSyntax, type DraftSyntax } from "./draft-syntax";

export type EditorContainerContext = {
  readonly type: "blockquote";
  readonly depth: number;
  readonly sourcePrefix: string;
  readonly contentStartOffset: number;
};

export type EditorLeafContext =
  | {
      readonly type: MarkdownBlock["type"];
      readonly block: MarkdownBlock;
    }
  | {
      readonly type: "plainLine";
      readonly block: null;
    };

export type EditorSemanticContext = {
  readonly source: string;
  readonly selection: Readonly<ActiveBlockSelection>;
  readonly markdownDocument: MarkdownDocument;
  readonly editingDocument: PhysicalEditingDocument;
  readonly structuralLineModel: StructuralLineModel;
  readonly activeLine: EditingLine;
  readonly activeLineRole: StructuralLineRole;
  readonly activeBlock: MarkdownBlock | null;
  readonly activeState: ActiveBlockState;
  readonly blockPath: readonly BlockPathEntry[];
  readonly containers: readonly EditorContainerContext[];
  readonly leaf: EditorLeafContext | null;
  readonly draft: DraftSyntax | null;
};

export type CreateEditorSemanticContextOptions = {
  source: string;
  markdownDocument: MarkdownDocument;
  selection: ActiveBlockSelection;
  editingDocument?: PhysicalEditingDocument;
  activeState?: ActiveBlockState;
};

export function createEditorSemanticContext(
  options: CreateEditorSemanticContextOptions
): EditorSemanticContext {
  const { source, markdownDocument, selection } = options;
  const editingDocument = getCompatibleEditingDocument(options);
  const structuralLineModel = createStructuralLineModel(source, markdownDocument);
  const activeLine =
    editingDocument.getLineAtOffset(selection.head) ?? editingDocument.lines[0]!;
  const activeLineRole = structuralLineModel.getLineRole(activeLine.number);
  const activeState = getCompatibleActiveState(options);
  const blockPath = findBlockPathAt(markdownDocument, selection.head);
  const leafBlock = blockPath[blockPath.length - 1]?.block ?? null;

  return {
    source,
    selection,
    markdownDocument,
    editingDocument,
    structuralLineModel,
    activeLine,
    activeLineRole,
    activeBlock: activeState.activeBlock,
    activeState,
    blockPath,
    containers: createEditorContainers(activeLine.text),
    leaf: leafBlock ? { type: leafBlock.type, block: leafBlock } : { type: "plainLine", block: null },
    draft: selection.anchor === selection.head ? detectDraftSyntax(activeLine.text) : null
  };
}

function getCompatibleEditingDocument(
  options: CreateEditorSemanticContextOptions
): PhysicalEditingDocument {
  if (
    options.editingDocument &&
    options.editingDocument.source === options.source &&
    hasCompatibleSemanticLineMap(options.editingDocument, options.markdownDocument)
  ) {
    return options.editingDocument;
  }

  return createPhysicalEditingDocument(options.source, options.markdownDocument);
}

function hasCompatibleSemanticLineMap(
  editingDocument: PhysicalEditingDocument,
  markdownDocument: MarkdownDocument
): boolean {
  if (markdownDocument.blocks.length === 0) {
    return true;
  }

  const topLevelBlocks = new Set<MarkdownBlock>(markdownDocument.blocks);
  let hasMappedBlock = false;

  for (const semanticLine of editingDocument.semanticLineMap.lines) {
    if (!semanticLine.block) {
      continue;
    }

    hasMappedBlock = true;

    if (!topLevelBlocks.has(semanticLine.block)) {
      return false;
    }
  }

  return hasMappedBlock;
}

function getCompatibleActiveState(options: CreateEditorSemanticContextOptions): ActiveBlockState {
  if (
    options.activeState &&
    options.activeState.blockMap === options.markdownDocument &&
    options.activeState.selection.anchor === options.selection.anchor &&
    options.activeState.selection.head === options.selection.head
  ) {
    return options.activeState;
  }

  return createActiveBlockStateFromMarkdownDocument(options.markdownDocument, options.selection);
}

function createEditorContainers(lineText: string): readonly EditorContainerContext[] {
  const blockquote = parseBlockquoteLine(lineText);

  if (!blockquote) {
    return [];
  }

  return blockquote.markers.map((_, index) => {
    const nextMarker = blockquote.markers[index + 1];

    return {
      type: "blockquote",
      depth: index + 1,
      sourcePrefix: lineText.slice(
        0,
        nextMarker?.markerStart ?? blockquote.contentStartOffset
      ),
      contentStartOffset: nextMarker?.markerStart ?? blockquote.contentStartOffset
    };
  });
}
