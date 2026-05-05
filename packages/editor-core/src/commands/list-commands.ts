import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { buildContinuationPrefix, parseListLine } from "./line-parsers";
import {
  computeBackspaceOrderedListMarker,
  computeExitEmptyNestedListItem,
  computeIndentListItem,
  computeMoveListItemDown,
  computeMoveListItemUp,
  computeOrderedListEnter,
  computeUpgradeEmptyLeftListItemEnter,
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
  const contentStartOffset = line.to - parsed.content.length;
  const leftContent = view.state.doc.sliceString(contentStartOffset, selection.head);

  if (activeState.activeBlock?.type === "list" && leftContent.trim().length === 0) {
    const splitUpgradeEdit = computeUpgradeEmptyLeftListItemEnter(semanticContext, contentStartOffset);

    if (splitUpgradeEdit) {
      applyListEdit(view, splitUpgradeEdit);
      return true;
    }
  }

  if (activeState.activeBlock?.type === "list" && /^\d+[.)]$/.test(parsed.marker) && selection.head === line.to) {
    const orderedEdit = computeOrderedListEnter(semanticContext, parsed.content.trim().length === 0);

    if (orderedEdit) {
      applyListEdit(view, orderedEdit);
      return true;
    }
  }

  if (activeState.activeBlock?.type === "list" && parsed.content.trim().length === 0 && selection.head === line.to) {
    const nestedExitEdit = computeExitEmptyNestedListItem(semanticContext);

    if (nestedExitEdit) {
      applyListEdit(view, nestedExitEdit);
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

export function runListBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  return runOrderedListEdit(view, activeState, computeBackspaceOrderedListMarker);
}

export function runListMoveLineDown(view: EditorView, activeState: ActiveBlockState): boolean {
  return runOrderedListEdit(view, activeState, computeMoveListItemDown);
}

function isInsideOrderedList(activeState: ActiveBlockState): boolean {
  return activeState.activeBlock?.type === "list" && activeState.activeBlock.ordered;
}

export function runListIndentOnTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runListEdit(view, activeState, computeIndentListItem);
}

export function runListOutdentOnShiftTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runListEdit(view, activeState, computeOutdentListItem);
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

function runListEdit(
  view: EditorView,
  activeState: ActiveBlockState,
  computeEdit: (ctx: ReturnType<typeof readSemanticContext>) => ListEdit | null
): boolean {
  if (activeState.activeBlock?.type !== "list") {
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
