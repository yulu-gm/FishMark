import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import {
  createStructuralLineModel,
  resolveStructuralLineDeleteRange,
  type StructuralLineSeparator
} from "../structural-line-model";
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
  const structuralLineModel = createStructuralLineModel(source, activeState.blockMap);
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

  const currentStructuralSeparator = structuralLineModel.findSeparatorAt(selection.head);

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

  if (
    deleteTrailingEmptyBlockquoteLines(
      view,
      activeBlockquote,
      parsed,
      selection.head,
      contentStart,
      lineStart
    )
  ) {
    return true;
  }

  const previousStructuralSeparator = structuralLineModel.findSeparatorBeforeLine(lineStart);

  if (previousStructuralSeparator) {
    if (
      mergeSameDepthBlockquoteAcrossStructuralSeparator(
        view,
        activeBlockquote,
        previousStructuralSeparator,
        parsed,
        selection.head,
        contentStart
      )
    ) {
      return true;
    }

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
  separator: StructuralLineSeparator
): void {
  const range = resolveStructuralLineDeleteRange(source, separator);
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

function mergeSameDepthBlockquoteAcrossStructuralSeparator(
  view: EditorView,
  activeBlockquote: BlockquoteBlock,
  separator: StructuralLineSeparator,
  currentParsed: NonNullable<ReturnType<typeof parseBlockquoteLine>>,
  selectionHead: number,
  contentStart: number
): boolean {
  if (selectionHead !== contentStart || separator.previousBlockEnd === null) {
    return false;
  }

  if (
    separator.nextBlockStart !== contentStart ||
    !hasParagraphInnerBlocksAroundStructuralSeparator(activeBlockquote, separator)
  ) {
    return false;
  }

  const previousLine = view.state.doc.lineAt(separator.previousBlockEnd);
  const previousParsed = parseBlockquoteLine(previousLine.text);

  if (!previousParsed || previousParsed.quoteDepth !== currentParsed.quoteDepth) {
    return false;
  }

  if (separator.previousBlockEnd >= contentStart) {
    return false;
  }

  view.dispatch({
    changes: {
      from: separator.previousBlockEnd,
      to: contentStart,
      insert: ""
    },
    selection: {
      anchor: separator.previousBlockEnd,
      head: separator.previousBlockEnd
    }
  });

  return true;
}

function hasParagraphInnerBlocksAroundStructuralSeparator(
  activeBlockquote: BlockquoteBlock,
  separator: StructuralLineSeparator
): boolean {
  const innerBlocks = activeBlockquote.innerBlocks;
  if (!innerBlocks || separator.previousBlockEnd === null || separator.nextBlockStart === null) {
    return false;
  }

  const previousBlock = innerBlocks.find(
    (block) => block.endOffset === separator.previousBlockEnd
  );
  const nextBlock = innerBlocks.find((block) => block.startOffset === separator.nextBlockStart);

  return previousBlock?.type === "paragraph" && nextBlock?.type === "paragraph";
}

function deleteTrailingEmptyBlockquoteLines(
  view: EditorView,
  activeBlockquote: BlockquoteBlock,
  currentParsed: NonNullable<ReturnType<typeof parseBlockquoteLine>>,
  selectionHead: number,
  contentStart: number,
  lineStart: number
): boolean {
  if (selectionHead !== contentStart || currentParsed.content.trim().length > 0) {
    return false;
  }

  const previousContentEnd = findPreviousSameDepthBlockquoteContentLineEnd(
    view,
    activeBlockquote,
    lineStart,
    currentParsed.quoteDepth
  );

  if (previousContentEnd === null || previousContentEnd >= contentStart) {
    return false;
  }

  view.dispatch({
    changes: {
      from: previousContentEnd,
      to: contentStart,
      insert: ""
    },
    selection: {
      anchor: previousContentEnd,
      head: previousContentEnd
    }
  });

  return true;
}

function findPreviousSameDepthBlockquoteContentLineEnd(
  view: EditorView,
  activeBlockquote: BlockquoteBlock,
  beforeLineStart: number,
  quoteDepth: number
): number | null {
  let previousLineEnd = getPreviousLineEnd(beforeLineStart);

  while (previousLineEnd !== null) {
    const previousLine = view.state.doc.lineAt(previousLineEnd);

    if (previousLine.from < activeBlockquote.startOffset) {
      return null;
    }

    const previousParsed = parseBlockquoteLine(previousLine.text);
    if (!previousParsed || previousParsed.quoteDepth !== quoteDepth) {
      return null;
    }

    if (previousParsed.content.trim().length > 0) {
      return previousLine.to;
    }

    previousLineEnd = getPreviousLineEnd(previousLine.from);
  }

  return null;
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
