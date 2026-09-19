import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lastOfKind, lineContainerChain, parentOf } from "./line-structure";

// Ordered-list normalization renumbers the scopes of the list the caret is in. Numbering restarts
// at one after an item whose own text continues below its first line, which is how a loose item
// ends a run.
export function planNormalizeOrderedListScopes(
  context: EditorSemanticContext,
  options?: { readonly changedRanges: readonly { readonly from: number; readonly to: number }[] }
): EditTransactionPlan | null {
  if (options !== undefined) {
    const roots: MarkdownNode[] = [];
    const visit = (node: MarkdownNode): void => {
      if (node.kind === "list") {
        roots.push(node);
        return;
      }
      for (const child of childrenOf(node)) visit(child);
    };
    visit(context.snapshot.tree.root);
    const changed = options.changedRanges.length === 1 ? options.changedRanges[0] : undefined;
    const edits = roots.filter((root) => changed === undefined || (
      changed.from === changed.to
        ? changed.from >= root.source.startOffset && changed.from <= root.source.endOffset
        : changed.from < root.source.endOffset && changed.to > root.source.startOffset
    )).flatMap((root) => collectScopeChanges(context, root));
    return normalizationPlan(context, edits);
  }
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const chain = lineContainerChain(context, line);
  const item = lastOfKind(chain, "list-item");
  const rootList = item === null ? lastOfKind(chain, "list") : parentOf(context, item);

  if (rootList === null || rootList.kind !== "list") {
    return null;
  }

  const edits = collectScopeChanges(context, rootList);

  return normalizationPlan(context, edits);
}

function normalizationPlan(context: EditorSemanticContext, edits: readonly TextEditOperation[]): EditTransactionPlan | null {
  if (edits.length === 0) return null;
  const ordered = [...edits].sort((left, right) => left.from - right.from);
  return createEditTransactionPlan({
    context,
    commandId: "format-inline",
    intent: "structural",
    edits: ordered,
    selection: {
      anchor: mapOffset(context.selectionContext.selection.anchor, ordered),
      head: mapOffset(context.selectionContext.selection.head, ordered)
    }
  });
}

function mapOffset(offset: number, edits: readonly TextEditOperation[]): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset <= edit.from) break;
    if (offset <= edit.to) return edit.from + delta + edit.insert.length;
    delta += edit.insert.length - (edit.to - edit.from);
  }
  return offset + delta;
}

function collectScopeChanges(
  context: EditorSemanticContext,
  list: MarkdownNode
): TextEditOperation[] {
  const edits: TextEditOperation[] = [];
  appendScopeChanges(context, list, edits);

  return edits;
}

function appendScopeChanges(
  context: EditorSemanticContext,
  list: MarkdownNode,
  edits: TextEditOperation[]
): void {
  if (list.data.kind === "list" && list.data.ordered) {
    let ordinal = list.data.startOrdinal ?? 1;
    const delimiter = list.data.delimiter ?? ".";
    const items = childrenOf(list).filter((child) => child.kind === "list-item");

    for (const item of items) {
      const marker = item.markers.find((entry) => entry.kind === "list-marker");

      if (marker !== undefined) {
        const desired = `${ordinal}${delimiter}`;

        if (context.source.slice(marker.range.startOffset, marker.range.endOffset) !== desired) {
          edits.push({ from: marker.range.startOffset, to: marker.range.endOffset, insert: desired });
        }
      }

      ordinal = hasPlainTextTail(context, item) ? 1 : ordinal + 1;
    }
  }

  for (const child of childrenOf(list)) {
    if (child.kind === "list-item") {
      for (const nested of childrenOf(child)) {
        if (nested.kind === "list") {
          appendScopeChanges(context, nested, edits);
        }
      }
    }
  }
}

// An item whose text continues at the parent indentation ends its numbered run; an indented
// continuation line or a nested marker does not.
function hasPlainTextTail(context: EditorSemanticContext, item: MarkdownNode): boolean {
  const source = context.source.slice(item.source.startOffset, item.source.endOffset);
  const lines = source.split("\n");

  if (lines.length <= 1) {
    return false;
  }

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

