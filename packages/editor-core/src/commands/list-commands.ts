import { moveLineDown, moveLineUp } from "@codemirror/commands";
import type { ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { parseMarkdownDocument, type ListBlock, type ListItemBlock } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import { buildContinuationPrefix, parseListLine } from "./line-parsers";

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

  const changes: ChangeSpec[] = [
    { from: insertAt, to: insertAt, insert: `\n${continuationPrefix}` }
  ];

  const orderedMarkerMatch = /^(\d+)([.)])$/.exec(parsed.marker);
  if (
    orderedMarkerMatch &&
    activeState.activeBlock?.type === "list" &&
    activeState.activeBlock.ordered
  ) {
    const list = activeState.activeBlock;
    const currentIndent = parsed.indent.length;
    const delimiter = orderedMarkerMatch[2] ?? ".";
    const insertedNumber = Number.parseInt(orderedMarkerMatch[1] ?? "1", 10) + 1;
    const currentItemIndex = list.items.findIndex(
      (item) => insertAt >= item.startOffset && insertAt <= item.endOffset
    );

    if (currentItemIndex >= 0) {
      let nextNumber = insertedNumber + 1;
      for (let index = currentItemIndex + 1; index < list.items.length; index += 1) {
        const item = list.items[index]!;
        if (item.indent < currentIndent) {
          break;
        }
        if (item.indent !== currentIndent) {
          continue;
        }
        if (!/^\d+[.)]$/.test(item.marker)) {
          break;
        }
        changes.push({
          from: item.markerStart,
          to: item.markerEnd,
          insert: `${nextNumber}${delimiter}`
        });
        nextNumber += 1;
      }
    }
  }

  view.dispatch({
    changes,
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

export function runListMoveLineUp(view: EditorView, activeState: ActiveBlockState): boolean {
  if (!isInsideOrderedList(activeState)) {
    return false;
  }
  if (!moveLineUp(view)) {
    return false;
  }
  renumberOrderedListAtSelection(view);
  return true;
}

export function runListMoveLineDown(view: EditorView, activeState: ActiveBlockState): boolean {
  if (!isInsideOrderedList(activeState)) {
    return false;
  }
  if (!moveLineDown(view)) {
    return false;
  }
  renumberOrderedListAtSelection(view);
  return true;
}

function isInsideOrderedList(activeState: ActiveBlockState): boolean {
  return activeState.activeBlock?.type === "list" && activeState.activeBlock.ordered;
}

function renumberOrderedListAtSelection(view: EditorView): void {
  const source = view.state.doc.toString();
  const document = parseMarkdownDocument(source);
  const head = view.state.selection.main.head;
  const list = document.blocks.find(
    (block): block is ListBlock =>
      block.type === "list" && head >= block.startOffset && head <= block.endOffset
  );
  if (!list || !list.ordered) {
    return;
  }

  const changes = collectOrderedListRenumberChanges(list, source);
  if (changes.length === 0) {
    return;
  }
  view.dispatch({ changes });
}

function collectOrderedListRenumberChanges(
  list: ListBlock,
  source: string
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const countersByIndent = new Map<number, { value: number; delimiter: string }>();

  for (const item of list.items) {
    for (const key of [...countersByIndent.keys()]) {
      if (key > item.indent) {
        countersByIndent.delete(key);
      }
    }

    const orderedMatch = /^(\d+)([.)])$/.exec(item.marker);
    if (!orderedMatch) {
      countersByIndent.delete(item.indent);
      continue;
    }

    const existing = countersByIndent.get(item.indent);
    const delimiter = existing?.delimiter ?? orderedMatch[2] ?? ".";
    const value = (existing?.value ?? 0) + 1;
    countersByIndent.set(item.indent, { value, delimiter });

    const desiredMarker = `${value}${delimiter}`;
    const currentMarker = source.slice(item.markerStart, item.markerEnd);
    if (currentMarker !== desiredMarker) {
      changes.push({
        from: item.markerStart,
        to: item.markerEnd,
        insert: desiredMarker
      });
    }
  }

  return changes;
}


export function runListIndentOnTab(view: EditorView, activeState: ActiveBlockState): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty || activeState.activeBlock?.type !== "list") {
    return false;
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
