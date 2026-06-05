import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import {
  findBlockquoteStructuralSeparatorAt,
  findPreviousBlockquoteStructuralSeparator,
  type BlockquoteStructuralSeparator
} from "../blockquote-structural-separators";
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
    if (parsed.quoteDepth > 1) {
      const parentPrefix = buildParentBlockquoteEmptyPrefix(line.text, parsed);

      view.dispatch({
        changes: {
          from: line.from,
          to: line.to,
          insert: parentPrefix
        },
        selection: {
          anchor: line.from + parentPrefix.length,
          head: line.from + parentPrefix.length
        }
      });
      return true;
    }

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

  const continuationPrefix = buildBlockquoteContinuationPrefix(parsed.sourcePrefix);
  const separatorPrefix = buildBlockquoteStructuralSeparatorPrefix(parsed.sourcePrefix, parsed.quoteDepth);
  const insertAt = selection.head;
  const insertText = `\n${separatorPrefix}\n${continuationPrefix}`;
  const nextAnchor = insertAt + insertText.length;

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

  const currentStructuralSeparator = findBlockquoteStructuralSeparatorAt(
    activeState.blockMap.blocks,
    selection.head
  );

  if (currentStructuralSeparator) {
    deleteBlockquoteStructuralSeparator(view, source, currentStructuralSeparator);
    return true;
  }

  const contentStart = line.from + parsed.contentStartOffset;

  if (selection.head !== lineStart && selection.head !== contentStart) {
    return false;
  }

  if (activeBlockquote.startOffset === lineStart) {
    const previousLineEnd = getPreviousLineEnd(lineStart);
    if (previousLineEnd !== null && view.state.doc.lineAt(previousLineEnd).text.trim().length === 0) {
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
  }

  if (selection.head === contentStart && activeBlockquote.startOffset === lineStart) {
    const deleteTo = line.from + resolveBlockquoteLayerDeleteEnd(parsed);

    if (deleteTo <= line.from) {
      return false;
    }

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

  const previousStructuralSeparator = findPreviousBlockquoteStructuralSeparator(
    activeState.blockMap.blocks,
    lineStart
  );

  if (previousStructuralSeparator) {
    deleteBlockquoteStructuralSeparator(view, source, previousStructuralSeparator);
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

function deleteBlockquoteStructuralSeparator(
  view: EditorView,
  source: string,
  separator: BlockquoteStructuralSeparator
): void {
  const range = resolveBlockquoteStructuralSeparatorDeleteRange(source, separator);
  const deleteLength = range.to - range.from;
  const selectionAnchor =
    separator.nextBlockStart !== null && separator.nextBlockStart >= range.to
      ? separator.nextBlockStart - deleteLength
      : separator.previousBlockEnd ?? range.from;

  view.dispatch({
    changes: {
      from: range.from,
      to: range.to,
      insert: ""
    },
    selection: {
      anchor: selectionAnchor,
      head: selectionAnchor
    }
  });
}

function resolveBlockquoteStructuralSeparatorDeleteRange(
  source: string,
  separator: BlockquoteStructuralSeparator
): { from: number; to: number } {
  const lineBreakEnd = getLineBreakEndAfter(source, separator.lineEndOffset);

  if (lineBreakEnd > separator.lineEndOffset) {
    return {
      from: separator.lineStartOffset,
      to: lineBreakEnd
    };
  }

  if (separator.lineStartOffset > 0) {
    return {
      from: getLineBreakStartBefore(source, separator.lineStartOffset),
      to: separator.lineEndOffset
    };
  }

  return {
    from: separator.lineStartOffset,
    to: separator.lineEndOffset
  };
}

function getLineBreakEndAfter(source: string, lineEndOffset: number): number {
  if (source.slice(lineEndOffset, lineEndOffset + 2) === "\r\n") {
    return lineEndOffset + 2;
  }

  if (source[lineEndOffset] === "\n") {
    return lineEndOffset + 1;
  }

  return lineEndOffset;
}

function getLineBreakStartBefore(source: string, lineStartOffset: number): number {
  if (lineStartOffset >= 2 && source.slice(lineStartOffset - 2, lineStartOffset) === "\r\n") {
    return lineStartOffset - 2;
  }

  return Math.max(0, lineStartOffset - 1);
}

function getPreviousLineEnd(lineStart: number): number | null {
  if (lineStart <= 0) {
    return null;
  }

  return lineStart - 1;
}

function resolveBlockquoteLayerDeleteEnd(parsed: NonNullable<ReturnType<typeof parseBlockquoteLine>>): number {
  const secondMarker = parsed.markers[1];

  return secondMarker?.markerStart ?? parsed.contentStartOffset;
}

function buildBlockquoteContinuationPrefix(sourcePrefix: string): string {
  if (sourcePrefix.endsWith(" ") || sourcePrefix.endsWith("\t")) {
    return sourcePrefix;
  }

  return `${sourcePrefix} `;
}

function buildBlockquoteStructuralSeparatorPrefix(sourcePrefix: string, quoteDepth: number): string {
  if (quoteDepth > 1) {
    return buildBlockquoteContinuationPrefix(sourcePrefix);
  }

  return sourcePrefix.replace(/[ \t]+$/u, "");
}

function buildParentBlockquoteEmptyPrefix(
  lineText: string,
  parsed: NonNullable<ReturnType<typeof parseBlockquoteLine>>
): string {
  const lastMarker = parsed.markers.at(-1);
  if (!lastMarker) {
    return buildBlockquoteContinuationPrefix(parsed.sourcePrefix);
  }

  return buildBlockquoteContinuationPrefix(lineText.slice(0, lastMarker.markerStart));
}
