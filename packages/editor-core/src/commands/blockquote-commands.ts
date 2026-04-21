import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { getBackspaceLineStart, parseBlockquoteLine } from "./line-parsers";

type BlockquoteBlock = Extract<ActiveBlockState["activeBlock"], { type: "blockquote" }>;

export function runBlockquoteEnter(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const parsed = parseBlockquoteLine(line.text);
  if (!parsed) {
    return false;
  }

  if (parsed.content.trim().length === 0) {
    const deleteTo =
      line.to < view.state.doc.length && view.state.doc.sliceString(line.to, line.to + 1) === "\n"
        ? line.to + 1
        : line.to;

    view.dispatch({
      changes: {
        from: line.from,
        to: deleteTo,
        insert: ""
      },
      selection: {
        anchor: line.from,
        head: line.from
      }
    });
    return true;
  }

  const continuationPrefix = `${parsed.indent}> `;
  const insertAt = selection.head;
  const nextAnchor = insertAt + 1 + continuationPrefix.length;

  view.dispatch({
    changes: {
      from: insertAt,
      to: insertAt,
      insert: `\n${continuationPrefix}`
    },
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

export function runBlockquoteBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const source = view.state.doc.toString();
  const line = view.state.doc.lineAt(selection.head);
  const lineStart = getBackspaceLineStart(source, selection.head, line.from);

  const activeBlockquote = getActiveBlockquote(activeState, lineStart);
  if (!activeBlockquote) {
    return false;
  }

  const parsed = parseBlockquoteLine(line.text);
  if (!parsed) {
    return false;
  }

  const contentStart = getActiveBlockquoteContentStart(activeBlockquote, lineStart);

  if (selection.head !== lineStart && selection.head !== contentStart) {
    return false;
  }

  if (activeBlockquote.startOffset === lineStart) {
    const previousLineEnd = getPreviousLineEnd(lineStart);
    if (previousLineEnd === null) {
      return false;
    }

    view.dispatch({
      changes: {
        from: previousLineEnd,
        to: lineStart,
        insert: ""
      },
      selection: {
        anchor: previousLineEnd,
        head: previousLineEnd
      }
    });

    return true;
  }

  const previousLineEnd = getPreviousLineEnd(lineStart);
  if (previousLineEnd === null) {
    return false;
  }

  view.dispatch({
    selection: {
      anchor: previousLineEnd,
      head: previousLineEnd
    }
  });

  return true;
}

function getActiveBlockquoteContentStart(
  activeBlockquote: BlockquoteBlock,
  lineStart: number
): number {
  const line = activeBlockquote.lines?.find((entry) => entry.startOffset === lineStart);

  return line?.contentStartOffset ?? lineStart;
}

function getActiveBlockquote(
  activeState: ActiveBlockState,
  lineStart: number
): BlockquoteBlock | null {
  for (const block of activeState.blockMap.blocks) {
    if (block.type !== "blockquote") {
      continue;
    }

    if (lineStart >= block.startOffset && lineStart <= block.endOffset) {
      return block;
    }
  }

  return null;
}

function getPreviousLineEnd(lineStart: number): number | null {
  if (lineStart <= 0) {
    return null;
  }

  return lineStart - 1;
}
