import type { EditorView } from "@codemirror/view";
import type { ListItemBlock } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import { buildContinuationPrefix, parseListLine } from "./line-parsers";
import {
  computeIndentListItem,
  computeMoveListItemDown,
  computeMoveListItemUp,
  computeOrderedListEnter,
  computeOutdentListItem,
  type ListEdit
} from "./list-edits";
import { readSemanticContext } from "./semantic-context";

export function runListEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const parsed = parseListLine(line.text);
  if (!parsed) {
    return false;
  }

  const semanticContext = readSemanticContext(view.state, activeState);
  if (activeState.activeBlock?.type === "list" && /^\d+[.)]$/.test(parsed.marker) && selection.head === line.to) {
    const orderedEdit = computeOrderedListEnter(semanticContext, parsed.content.trim().length === 0);

    if (orderedEdit) {
      applyListEdit(view, orderedEdit);
      return true;
    }
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

  const continuationPrefix = buildContinuationPrefix(parsed);
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

export function runListMoveLineUp(view: EditorView, activeState: ActiveBlockState): boolean {
  return runOrderedListEdit(view, activeState, computeMoveListItemUp);
}

export function runListMoveLineDown(view: EditorView, activeState: ActiveBlockState): boolean {
  return runOrderedListEdit(view, activeState, computeMoveListItemDown);
}

function isInsideOrderedList(activeState: ActiveBlockState): boolean {
  return activeState.activeBlock?.type === "list" && activeState.activeBlock.ordered;
}

export function runListIndentOnTab(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty || activeState.activeBlock?.type !== "list") {
    return false;
  }

  if (isInsideOrderedList(activeState)) {
    return runOrderedListEdit(view, activeState, computeIndentListItem);
  }

  const currentItemIndex = activeState.activeBlock.items.findIndex(
    (item) => selection.head >= item.startOffset && selection.head <= item.endOffset
  );
  if (currentItemIndex <= 0) {
    return false;
  }

  const currentItem = activeState.activeBlock.items[currentItemIndex]!;
  const previousSiblingIndex = findPreviousSiblingIndex(activeState.activeBlock.items, currentItemIndex);
  if (previousSiblingIndex === -1) {
    return false;
  }

  const subtreeEndOffset = getListItemSubtreeEndOffset(activeState.activeBlock.items, currentItemIndex);
  const subtreeSource = view.state.doc.sliceString(currentItem.startOffset, subtreeEndOffset);
  const indentedSource = subtreeSource
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const nextAnchor = selection.anchor + 2;

  view.dispatch({
    changes: {
      from: currentItem.startOffset,
      to: subtreeEndOffset,
      insert: indentedSource
    },
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

export function runListOutdentOnShiftTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runOrderedListEdit(view, activeState, computeOutdentListItem);
}

function findPreviousSiblingIndex(
  items: readonly ListItemBlock[],
  currentItemIndex: number
): number {
  const currentItem = items[currentItemIndex]!;

  for (let index = currentItemIndex - 1; index >= 0; index -= 1) {
    const candidate = items[index]!;
    if (candidate.indent === currentItem.indent) {
      return index;
    }
  }

  return -1;
}

function getListItemSubtreeEndOffset(
  items: readonly ListItemBlock[],
  currentItemIndex: number
): number {
  const currentItem = items[currentItemIndex]!;
  let subtreeEndOffset = currentItem.endOffset;

  for (let index = currentItemIndex + 1; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.indent <= currentItem.indent) {
      break;
    }

    subtreeEndOffset = item.endOffset;
  }

  return subtreeEndOffset;
}

function runOrderedListEdit(
  view: EditorView,
  activeState: ActiveBlockState,
  computeEdit: (ctx: ReturnType<typeof readSemanticContext>) => ListEdit | null
): boolean {
  if (!isInsideOrderedList(activeState)) {
    return false;
  }

  const edit = computeEdit(readSemanticContext(view.state, activeState));

  if (!edit) {
    return false;
  }

  applyListEdit(view, edit);

  return true;
}

function applyListEdit(view: EditorView, edit: ListEdit): void {
  view.dispatch({
    changes: edit.changes,
    selection: edit.selection
  });
}
