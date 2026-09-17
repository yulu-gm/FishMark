import { childrenOf, parseBlockquoteLinePrefix, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lineContainerChain, lastOfKind, linePrefixText, listItemPrefix } from "./line-structure";

// Backspace degrades exactly one structural step at a time: first the hidden marker run, then
// the container level. Whole subtrees move with their item, and nothing here reads DOM state.
export type BackspacePlanKind =
  | "default"
  | "range-delete"
  | "marker-degrade"
  | "indent-degrade"
  | "quote-degrade"
  | "subtree-join";

export interface BackspaceDecision {
  readonly kind: BackspacePlanKind;
  readonly plan: EditTransactionPlan;
}

export function planBackspace(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideBackspace(context)?.plan ?? null;
}

// Every blank line at the end of the document — plain, whitespace-only, or a bare quote marker —
// is one step to remove: the whole run goes back to the end of the last line with content.
function planTrailingBlankCollapse(
  context: EditorSemanticContext,
  line: PhysicalLine,
  chain: readonly MarkdownNode[]
): BackspaceDecision | null {
  const offset = context.selectionContext.activeOffset;
  const lines = context.lines.lines;

  if (
    line.lineNumber !== lines.length ||
    (offset !== line.contentEndOffset && offset !== line.range.endOffset)
  ) {
    return null;
  }

  const item = lastOfKind(chain, "list-item");

  if (item !== null && listItemPrefix(line, context, item).markerText.length > 0) {
    return null;
  }

  const prefix = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);
  const text = context.source.slice(line.range.startOffset, line.contentEndOffset);

  // Whitespace is its own kind of blank line: Backspace removes it one character at a time.
  if (/^[ \t]+$/u.test(text)) {
    return null;
  }

  if (context.source.slice(prefix.contentStartOffset, line.contentEndOffset).trim().length > 0) {
    return null;
  }

  for (let number = line.lineNumber - 1; number >= 1; number -= 1) {
    const previous = lines[number - 1]!;
    const previousPrefix = parseBlockquoteLinePrefix(
      context.source,
      previous.range.startOffset,
      previous.contentEndOffset
    );

    if (context.source.slice(previousPrefix.contentStartOffset, previous.contentEndOffset).trim().length === 0) {
      continue;
    }

    return rangeDelete(context, previous.contentEndOffset, offset, "subtree-join");
  }

  return null;
}

export function decideBackspace(context: EditorSemanticContext): BackspaceDecision | null {
  const selection = context.selectionContext;
  const line = context.lineAt(selection.activeOffset);

  if (line === null) {
    return null;
  }

  // A non-empty selection deletes exactly the selected range.
  if (!selection.empty) {
    return rangeDelete(context, selection.from, selection.to);
  }

  const offset = selection.activeOffset;
  const chain = lineContainerChain(context, line);
  const contentStart = line.contentStartOffset;

  // 0. A trailing run of blank lines collapses back to the last line that has content.
  const trailingBlank = planTrailingBlankCollapse(context, line, chain);

  if (trailingBlank !== null) {
    return trailingBlank;
  }

  // 1. Inside a line, an ordinary character delete.
  if (offset > contentStart) {
    if (offset - 1 < line.range.startOffset) {
      return null;
    }

    return rangeDelete(context, offset - 1, offset, "default");
  }

  // 2. At the content start the innermost hidden prefix degrades first: an item marker becomes
  //    its indentation, and only a quoted line without a deeper prefix loses a quote level.
  const item = lastOfKind(chain, "list-item");

  if (item !== null) {
    const prefix = listItemPrefix(line, context, item);
    const markerStart = prefix.startOffset + prefix.indentationText.length;
    const markerEnd = markerStart + prefix.markerText.length;

    if (offset > prefix.startOffset && offset <= markerStart) {
      // The caret sits inside the indentation run: outdent the whole subtree one step.
      return outdentItemSubtree(context, item, prefix.startOffset, prefix.indentationText);
    }

    if (offset === prefix.startOffset && prefix.indentationText.length > 0) {
      return outdentItemSubtree(context, item, prefix.startOffset, prefix.indentationText);
    }

    if (offset > markerStart && offset <= contentStart && markerEnd > markerStart) {
      return rangeDelete(context, markerStart, line.contentStartOffset, "marker-degrade");
    }

    if (offset === markerStart && prefix.markerText.length > 0) {
      return rangeDelete(context, markerStart, line.contentStartOffset, "marker-degrade");
    }
  }

  // 3. A quoted line with no deeper prefix loses exactly one quote level.
  const quotePrefix = lastQuoteMarkerStart(line);

  if (quotePrefix !== null && quotePrefix.lastMarkerStart !== null && offset <= contentStart) {
    const removeTo = Math.min(
      quotePrefix.lastMarkerStart + quotePrefix.markerRunLength,
      line.contentEndOffset
    );

    return rangeDelete(context, quotePrefix.lastMarkerStart, removeTo, "quote-degrade");
  }

  // 4. At a line start with no marker to remove, join with the previous line.
  if (offset === line.range.startOffset && line.lineNumber > 1) {
    return rangeDelete(context, offset, offset, "subtree-join");
  }

  return null;
}

// Outdenting keeps the subtree attached: only the leading indentation of each covered line moves.
function outdentItemSubtree(
  context: EditorSemanticContext,
  item: MarkdownNode,
  prefixStart: number,
  indentationText: string
): BackspaceDecision {
  const amount = Math.min(indentationText.length, 4);
  const edits: TextEditOperation[] = [];
  const covered = context.lines.lineForNode(item);

  for (const coveredLine of covered) {
    const text = context.source.slice(coveredLine.range.startOffset, coveredLine.contentEndOffset);
    const removable = text.slice(0, amount);

    if (/^[ \t]+$/u.test(removable) && removable.length > 0) {
      edits.push({ from: coveredLine.range.startOffset, to: coveredLine.range.startOffset + removable.length, insert: "" });
    }
  }

  if (edits.length === 0) {
    return rangeDelete(context, prefixStart, prefixStart + amount, "indent-degrade");
  }

  const cursor = Math.max(0, prefixStart - amount);

  return {
    kind: "indent-degrade",
    plan: createEditTransactionPlan({
      context,
      commandId: "backspace",
      intent: "structural",
      edits,
      selection: { anchor: cursor, head: cursor }
    })
  };
}

function rangeDelete(
  context: EditorSemanticContext,
  from: number,
  to: number,
  kind: BackspacePlanKind = "range-delete"
): BackspaceDecision {
  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "backspace",
      intent: kind === "default" ? "edit" : "structural",
      edits: [{ from, to, insert: "" }],
      selection: { anchor: from, head: from }
    })
  };
}

// The innermost quote marker run on a line, used to degrade one quote level.
function lastQuoteMarkerStart(line: PhysicalLine): { lastMarkerStart: number | null; markerRunLength: number } | null {
  const markers = line.segments.filter((segment) => segment.kind === "quote-marker");

  if (markers.length === 0) {
    return null;
  }

  const last = markers[markers.length - 1]!;
  const spacing = line.segments.find(
    (segment) => segment.kind === "spacing" && segment.range.startOffset >= last.range.endOffset
  );

  return {
    lastMarkerStart: last.range.startOffset,
    markerRunLength: last.range.endOffset - last.range.startOffset + (spacing?.text.length ?? 0)
  };
}

export { childrenOf, linePrefixText };




