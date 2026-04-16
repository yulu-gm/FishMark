import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { getBlockLineInfos } from "../decorations";
import {
  getBackspaceLineStart,
  getCodeFenceEditableAnchor,
  parseCodeFenceLine
} from "./line-parsers";

type CodeFenceBlock = Extract<ActiveBlockState["activeBlock"], { type: "codeFence" }>;

export function runCodeFenceEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const activeCodeFence = activeState.activeBlock?.type === "codeFence" ? activeState.activeBlock : null;
  if (activeCodeFence && isClosedCodeFenceBlock(view.state.doc.toString(), activeCodeFence)) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to) {
    return false;
  }

  const parsed = parseCodeFenceLine(line.text);
  if (!parsed) {
    return false;
  }

  const closingFence = `${parsed.indent}${parsed.fence}`;
  const insertAt = selection.head;
  const insertText = `\n\n${closingFence}`;
  const nextAnchor = insertAt + 1;

  view.dispatch({
    changes: {
      from: insertAt,
      to: insertAt,
      insert: insertText
    },
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

export function runCodeFenceBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const source = view.state.doc.toString();
  const line = view.state.doc.lineAt(selection.head);
  const lineStart = getBackspaceLineStart(source, selection.head, line.from);

  if (selection.head !== lineStart) {
    return false;
  }

  const adjacentCodeFence = getAdjacentClosedCodeFenceBlock(activeState, lineStart, source);
  if (!adjacentCodeFence) {
    return false;
  }

  const nextAnchor = getCodeFenceEditableAnchor(source, adjacentCodeFence);

  view.dispatch({
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

function getAdjacentClosedCodeFenceBlock(
  activeState: ActiveBlockState,
  lineStart: number,
  source: string
): CodeFenceBlock | null {
  if (activeState.activeBlock?.type === "codeFence" && activeState.activeBlock.startOffset === lineStart) {
    return null;
  }

  for (const block of [...activeState.blockMap.blocks].reverse()) {
    if (block.type !== "codeFence") {
      continue;
    }

    const blockLines = getBlockLineInfos(block.startOffset, block.endOffset, source);
    const closingFenceLine = blockLines.at(-1);
    const separatorLineStart = closingFenceLine ? closingFenceLine.lineEnd + 1 : block.endOffset;

    if (separatorLineStart !== lineStart) {
      continue;
    }

    return isClosedCodeFenceBlock(source, block) ? block : null;
  }

  return null;
}

function isClosedCodeFenceBlock(source: string, block: CodeFenceBlock): boolean {
  const blockSource = source.slice(block.startOffset, block.endOffset);
  const lines = blockSource.split("\n");
  const nonEmptyLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.length > 0);
  const firstEntry = nonEmptyLines[0];
  const lastEntry = nonEmptyLines.at(-1);
  const firstLine = firstEntry?.line ?? "";
  const lastLine = lastEntry?.line ?? "";
  const openingFence = parseCodeFenceLine(firstLine);
  const closingFence = parseCodeFenceLine(lastLine);

  if (!openingFence || !closingFence || !firstEntry || !lastEntry || firstEntry.index === lastEntry.index) {
    return false;
  }

  if (openingFence.indent !== closingFence.indent) {
    return false;
  }

  if (openingFence.fence[0] !== closingFence.fence[0]) {
    return false;
  }

  return closingFence.fence.length >= openingFence.fence.length;
}
