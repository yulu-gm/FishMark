import {
  childrenOf,
  collectBlockquotePrefixSpans,
  createSourceRange,
  readListScopes,
  type ListItemGeometry,
  type ListScope,
  type MarkdownNode,
  type SourceRange
} from "@fishmark/markdown-engine";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lastOfKind, lineContainerChain, parentOf } from "./line-structure";

// Moving a list item moves the whole subtree, including continuation and nested lines, as one
// transaction, and keeps the caret on the item the user was editing. Items come from the
// canonical list scopes, so a nested list that the tree keeps as a sibling container still
// travels with its parent item. Ordered scopes are renumbered afterwards.
export type ListMovePlanKind = "move-up" | "move-down";

export interface ListMoveDecision {
  readonly kind: ListMovePlanKind;
  readonly plan: EditTransactionPlan;
}

interface ItemSlice {
  readonly item: ListItemGeometry;
  readonly text: string;
}

interface ResolvedScope {
  readonly scope: ListScope;
  readonly items: readonly ItemSlice[];
  readonly itemIndex: number;
}

export function planMoveListItemUp(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideMoveListItem(context, "up")?.plan ?? null;
}

export function planMoveListItemDown(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideMoveListItem(context, "down")?.plan ?? null;
}

export function decideMoveListItem(
  context: EditorSemanticContext,
  direction: "up" | "down"
): ListMoveDecision | null {
  const resolved = resolveScope(context);

  if (resolved === null) {
    return null;
  }

  const { scope, items, itemIndex } = resolved;
  const neighbourIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;

  if (neighbourIndex < 0 || neighbourIndex >= items.length) {
    return null;
  }

  const reordered = [...items];
  const swapped = reordered[itemIndex]!;
  reordered[itemIndex] = reordered[neighbourIndex]!;
  reordered[neighbourIndex] = swapped;

  const separators = separatorsBetween(context, items);
  const texts = scope.ordered
    ? renumber(reordered, scope.startOrdinal, scope.delimiter)
    : reordered.map((entry) => entry.text);
  const insert = texts.map((text, position) => `${text}${separators[position] ?? ""}`).join("");
  const regionStart = items[0]!.item.startOffset;
  const edits: TextEditOperation[] = [
    { from: regionStart, to: items[items.length - 1]!.item.endOffset, insert }
  ];

  const movedIndex = reordered.indexOf(items[itemIndex]!);
  const movedStart = regionStart +
    texts.slice(0, movedIndex).reduce(
      (length, text, position) => length + text.length + (separators[position]?.length ?? 0),
      0
    );
  const offsetInItem = Math.max(0, context.selectionContext.from - items[itemIndex]!.item.startOffset);
  const anchor = Math.min(movedStart + offsetInItem, regionStart + insert.length);

  return {
    kind: direction === "up" ? "move-up" : "move-down",
    plan: createEditTransactionPlan({
      context,
      commandId: "indent",
      intent: "structural",
      edits,
      selection: { anchor, head: anchor }
    })
  };
}

function resolveScope(context: EditorSemanticContext): ResolvedScope | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const chain = lineContainerChain(context, line);
  const activeItem = lastOfKind(chain, "list-item");

  if (activeItem === null) {
    return null;
  }

  const list = parentOf(context, activeItem);

  if (list === null || list.kind !== "list") {
    return null;
  }

  const scopes = readListScopes(
    context.source,
    listRunSpan(context, list),
    maskPrefixRanges(context, list)
  );

  if (scopes === null) {
    return null;
  }

  const caret = context.selectionContext.from;

  for (const scope of scopes) {
    const found = findScopeForCaret(context, scope, caret);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

function findScopeForCaret(
  context: EditorSemanticContext,
  scope: ListScope,
  caret: number
): ResolvedScope | null {
  const items = scope.items.map((item) => ({
    item,
    text: context.source.slice(item.startOffset, item.endOffset)
  }));
  const itemIndex = items.findIndex(
    (entry) => caret >= entry.item.startOffset && caret <= entry.item.endOffset
  );

  if (itemIndex !== -1) {
    return { scope, items, itemIndex };
  }

  for (const entry of items) {
    for (const nested of entry.item.scopes) {
      const found = findScopeForCaret(context, nested, caret);

      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

// One Markdown list can reach the tree as several adjacent containers; the scopes are read over
// the merged run, exactly like the rich document view does.
function listRunSpan(context: EditorSemanticContext, list: MarkdownNode): SourceRange {
  const parent = parentOf(context, list);
  const siblings = parent === null ? [list] : childrenOf(parent);
  const index = siblings.indexOf(list);
  let first = list;
  let last = list;

  if (index !== -1) {
    const previous = siblings[index - 1];

    if (previous !== undefined && previous.kind === "list" &&
        isWhitespaceGap(context, previous.source.endOffset, first.source.startOffset)) {
      first = previous;
    }

    let cursor = index;

    while (cursor + 1 < siblings.length) {
      const next = siblings[cursor + 1];

      if (next === undefined || next.kind !== "list" ||
          !isWhitespaceGap(context, last.source.endOffset, next.source.startOffset)) {
        break;
      }

      last = next;
      cursor += 1;
    }
  }

  return createSourceRange(
    lineStartOf(context, first.source.startOffset),
    lineEndOf(context, last.source.endOffset)
  );
}

function isWhitespaceGap(context: EditorSemanticContext, from: number, to: number): boolean {
  return /^\s*$/u.test(context.source.slice(from, to));
}

function maskPrefixRanges(context: EditorSemanticContext, list: MarkdownNode): readonly SourceRange[] {
  const prefixes: SourceRange[] = [];
  let current: MarkdownNode | null = list;

  while (current !== null) {
    const parent: MarkdownNode | null = parentOf(context, current);

    if (parent !== null && parent.kind === "blockquote") {
      prefixes.push(...collectBlockquotePrefixSpans(context.source, parent.source).prefixes);
    }

    current = parent;
  }

  return prefixes;
}

function separatorsBetween(context: EditorSemanticContext, items: readonly ItemSlice[]): readonly string[] {
  return items.map((entry, index) => {
    const next = items[index + 1];

    return next === undefined ? "" : context.source.slice(entry.item.endOffset, next.item.startOffset);
  });
}

// Renumbering restarts at one after an item whose text continues below its first line.
function renumber(items: readonly ItemSlice[], startOrdinal: number, delimiter: string): string[] {
  let ordinal = startOrdinal;

  return items.map((entry) => {
    const rewritten = replaceItemMarker(entry.text, `${ordinal}${delimiter}`);
    ordinal = hasPlainTextTail(entry.text) ? 1 : ordinal + 1;

    return rewritten;
  });
}

function replaceItemMarker(text: string, marker: string): string {
  const match = /^((?:[ \t]*>[ \t]*)*[ \t]*)(\d{1,9}[.)])(?=[ \t]|$)/u.exec(text);

  if (match === null) {
    return text;
  }

  const prefixLength = match[1]?.length ?? 0;

  return `${text.slice(0, prefixLength)}${marker}${text.slice(prefixLength + (match[2]?.length ?? 0))}`;
}

// An item whose text continues at the parent indentation ends its numbered run; an indented
// continuation line or a nested marker does not.
function hasPlainTextTail(itemText: string): boolean {
  const lines = itemText.split("\n");

  for (let index = 1; index < lines.length; index += 1) {
    const withoutQuotes = (lines[index] ?? "").replace(/^(?:[ \t]*>[ \t]*)+/u, "");

    if (withoutQuotes.trim().length === 0 || /^\s/u.test(withoutQuotes)) {
      continue;
    }

    if (/^[-+*](?=[ \t]|$)/u.test(withoutQuotes) || /^\d{1,9}[.)](?=[ \t]|$)/u.test(withoutQuotes)) {
      continue;
    }

    return true;
  }

  return false;
}

function lineStartOf(context: EditorSemanticContext, offset: number): number {
  let cursor = Math.max(0, offset);

  while (cursor > 0 && context.source[cursor - 1] !== "\n") {
    cursor -= 1;
  }

  return cursor;
}

function lineEndOf(context: EditorSemanticContext, offset: number): number {
  let cursor = Math.min(offset, context.source.length);

  while (cursor > 0 && (context.source[cursor - 1] === "\n" || context.source[cursor - 1] === "\r")) {
    cursor -= 1;
  }

  return cursor;
}
