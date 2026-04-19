import {
  parseBlockMap,
  type BlockMap,
  type MarkdownBlock,
  type MarkdownDocument
} from "@yulora/markdown-engine";
import type { TableCursorState } from "./table-cursor-state";

export type ActiveBlockSelection = {
  anchor: number;
  head: number;
};

export type ActiveBlockState = {
  blockMap: MarkdownDocument;
  activeBlock: MarkdownBlock | null;
  selection: ActiveBlockSelection;
  tableCursor: TableCursorState | null;
};

export function createActiveBlockState(
  source: string,
  selection: ActiveBlockSelection
): ActiveBlockState {
  return createActiveBlockStateFromBlockMap(parseBlockMap(source), selection);
}

export function createActiveBlockStateFromBlockMap(
  blockMap: BlockMap,
  selection: ActiveBlockSelection
): ActiveBlockState {
  return createActiveBlockStateFromMarkdownDocument(blockMap, selection);
}

export function createActiveBlockStateFromMarkdownDocument(
  markdownDocument: MarkdownDocument,
  selection: ActiveBlockSelection
): ActiveBlockState {
  return {
    blockMap: markdownDocument,
    activeBlock: resolveActiveBlock(markdownDocument, selection.head),
    selection,
    tableCursor: null
  };
}

export function resolveActiveBlock(
  markdownDocument: MarkdownDocument,
  selectionOffset: number
): MarkdownBlock | null {
  for (const block of markdownDocument.blocks) {
    if (selectionOffset >= block.startOffset && selectionOffset < block.endOffset) {
      return block;
    }
  }

  for (let index = markdownDocument.blocks.length - 1; index >= 0; index -= 1) {
    const block = markdownDocument.blocks[index]!;

    if (selectionOffset === block.endOffset) {
      return block;
    }
  }

  return null;
}
