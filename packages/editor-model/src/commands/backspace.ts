import { childrenOf, parseBlockquoteLinePrefix, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lineContainerChain, lastOfKind, linePrefixText, listItemPrefix, parentOf } from "./line-structure";
import { planTableBackspaceFromBelow } from "./table";
import { graphemeDeletionRange } from "./grapheme-deletion";

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
  if (prefix.markers.length > 0 && context.source.slice(prefix.contentStartOffset, line.contentEndOffset).length > 0) return null;

  // Whitespace is its own kind of blank line: Backspace removes it one character at a time.
  if (/^[ \t]+$/u.test(text)) {
    return null;
  }

  if (context.source.slice(prefix.contentStartOffset, line.contentEndOffset).trim().length > 0) {
    return null;
  }

  // A trailing run of bare quote lines is one quoted separator: the whole run goes, so the quoted
  // content above joins back. A plain blank run only shortens by one line per press, which is why
  // reaching back to the last line with content would collapse too much there.
  if (isBareQuoteSeparator(context, line)) {
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

  const previous = lines[line.lineNumber - 2];
  let blankCount = 0;
  for (let index = line.lineNumber - 2; index >= 0; index -= 1) {
    const candidate = lines[index]!;
    if (candidate.range.startOffset !== candidate.contentEndOffset) break;
    blankCount += 1;
  }
  const target = blankCount % 2 === 1 ? lines[line.lineNumber - 3] : previous;
  const from = target?.contentEndOffset ?? 0;
  const result = rangeDelete(context, from, offset, "subtree-join");
  if (previous?.role === "fence-close") {
    const body = lines[previous.lineNumber - 2];
    if (body !== undefined) return { ...result, plan: { ...result.plan, edits: [], intent: "navigation", selection: { anchor: body.contentEndOffset, head: body.contentEndOffset } } };
  }
  return result;
}

// A line whose content is nothing but quote markers shows no text of its own.
function isBareQuoteSeparator(context: EditorSemanticContext, line: PhysicalLine): boolean {
  const prefix = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);

  return prefix.markers.length > 0 &&
    context.source.slice(prefix.contentStartOffset, line.contentEndOffset).trim().length === 0;
}

// A bare quote separator (`>`) shows no content of its own: it only keeps two quoted lines apart.
// Backspace at the content start of the line below it drops the whole separator row, so the quoted
// lines join. The deletion starts at the content end of the line *above* the separator — one line
// further back than the separator itself — which is what swallows the break before and after it.
// The legacy path reaches the same range from `mergeSameDepthBlockquoteAcrossStructuralSeparator`.
function planBareSeparatorJoin(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number
): BackspaceDecision | null {
  if (line.lineNumber <= 2) {
    return null;
  }

  const ownPrefix = parseBlockquoteLinePrefix(
    context.source,
    line.range.startOffset,
    line.contentEndOffset
  );

  // The caret sits in the leading run this line shows before its own content: the quote markers,
  // their spacing, or the first content character.
  if (offset > ownPrefix.contentStartOffset) {
    return null;
  }

  const separator = context.lines.lines[line.lineNumber - 2]!;
  const separatorPrefix = parseBlockquoteLinePrefix(
    context.source,
    separator.range.startOffset,
    separator.contentEndOffset
  );

  if (separatorPrefix.markers.length === 0) {
    return null;
  }
  if (context.source.slice(separatorPrefix.contentStartOffset, separator.contentEndOffset).trim().length > 0) {
    return null;
  }

  const above = context.lines.lines[line.lineNumber - 3]!;
  const abovePrefix = parseBlockquoteLinePrefix(
    context.source,
    above.range.startOffset,
    above.contentEndOffset
  );

  if (abovePrefix.markers.length === 0) {
    return null;
  }

  // Only lines at the same quote depth swallow the separator together with the break before it: a
  // deeper line below the separator keeps its own level, because reaching back would silently pull it
  // up. The legacy path states the same rule as a `quoteDepth` equality guard — and for the unequal
  // case it removes just the separator line and the break after it, keeping the two lines apart.
  if (abovePrefix.markers.length !== ownPrefix.markers.length) {
    const result = rangeDelete(context, separator.range.startOffset, separator.range.endOffset, "subtree-join");
    const anchor = offset - (separator.range.endOffset - separator.range.startOffset);
    return { ...result, plan: { ...result.plan, selection: { anchor, head: anchor } } };
  }

  return above.contentEndOffset >= offset
    ? null
    : rangeDelete(context, above.contentEndOffset, offset, "subtree-join");
}

// A quote opens at the first physical line its container covers. Backspace behaves differently there
// than on a later line of the same quote, so the rule needs that distinction.
function isFirstLineOfQuote(context: EditorSemanticContext, line: PhysicalLine): boolean {
  const quote = lineContainerChain(context, line).findLast((node) => node.kind === "blockquote");

  if (quote === undefined) {
    return false;
  }

  const opening = context.lines.lines.find(
    (candidate) =>
      candidate.range.endOffset > quote.source.startOffset &&
      candidate.range.startOffset < quote.source.endOffset
  );

  return opening !== undefined && opening.lineNumber === line.lineNumber;
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
  const tableBoundary = planTableBackspaceFromBelow(context);
  if (tableBoundary !== null) return { kind: "subtree-join", plan: tableBoundary };
  const nextLine = context.lines.lines[line.lineNumber];
  if (isBareQuoteSeparator(context, line) && nextLine !== undefined) {
    const nextPrefix = parseBlockquoteLinePrefix(context.source, nextLine.range.startOffset, nextLine.contentEndOffset);
    if (nextPrefix.markers.length > 0) {
      const result = rangeDelete(context, line.range.startOffset, line.range.endOffset, "subtree-join");
      const anchor = nextPrefix.contentStartOffset - (line.range.endOffset - line.range.startOffset);
      return { ...result, plan: { ...result.plan, selection: { anchor, head: anchor } } };
    }
  }

  // 0. A trailing run of blank lines collapses back to the last line that has content.
  const trailingBlank = planTrailingBlankCollapse(context, line, chain);

  if (trailingBlank !== null) {
    return trailingBlank;
  }

  // 0b. A bare quote separator between this line and the one above it disappears entirely.
  const bareSeparator = planBareSeparatorJoin(context, line, offset);

  if (bareSeparator !== null) {
    return bareSeparator;
  }

  // 1. Inside a line, an ordinary character delete.
  if (offset > contentStart) {
    if (offset - 1 < line.range.startOffset) {
      return null;
    }

    const range = graphemeDeletionRange(context.source, line, offset, "backward");
    return range === null ? null : rangeDelete(context, range.from, range.to, "default");
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
      const list = parentOf(context, item);
      if (/^\d+[.)]$/u.test(prefix.markerText) && prefix.taskText.length === 0 &&
          context.source.slice(contentStart, line.contentEndOffset).trim().length > 0 &&
          list !== null && childrenOf(list).indexOf(item) > 0) {
        const separator = line.lineNumber > 1 ? prefix.ancestorText.replace(/[ \t]+$/u, "") + "\n" : "";
        const edits: TextEditOperation[] = [];
        if (separator) edits.push({ from: line.range.startOffset, to: line.range.startOffset, insert: separator });
        edits.push({ from: markerEnd, to: line.contentStartOffset, insert: "" });
        const caret = markerEnd + separator.length;
        return { kind: "marker-degrade", plan: createEditTransactionPlan({ context, commandId: "backspace", intent: "structural", edits,
          selection: { anchor: caret, head: caret }, userEventName: "delete.list-marker" }) };
      }
      return rangeDelete(context, markerStart, line.contentStartOffset, "marker-degrade");
    }

    if (offset === markerStart && prefix.markerText.length > 0) {
      return rangeDelete(context, markerStart, line.contentStartOffset, "marker-degrade");
    }
  }

  // 3. A quoted line with no deeper prefix loses exactly one quote level. When the caret sits in the
  //    line's own leading run — its start, or the content start the renderer normalizes it to — the
  //    break before the line goes instead of the marker: the quoted line steps up. The legacy path
  //    deletes `lineStart - 1` for this shape.
  const quotePrefix = lastQuoteMarkerStart(line);
  const ownPrefix = parseBlockquoteLinePrefix(
    context.source,
    line.range.startOffset,
    line.contentEndOffset
  );
  const atLeadingRun =
    offset === line.range.startOffset || offset === ownPrefix.contentStartOffset;

  // A later line of the same quote only moves the caret back to the end of the line above: the legacy
  // path dispatches a selection and leaves the document untouched, so no marker is removed and no
  // break is deleted.
  if (
    quotePrefix !== null &&
    quotePrefix.lastMarkerStart !== null &&
    atLeadingRun &&
    line.lineNumber > 1 &&
    !isFirstLineOfQuote(context, line)
  ) {
    const previous = context.lines.lines[line.lineNumber - 2]!;
    const caret = previous.range.endOffset - 1;

    return {
      kind: "quote-degrade",
      plan: createEditTransactionPlan({
        context,
        commandId: "backspace",
        intent: "navigation",
        edits: [],
        selection: { anchor: caret, head: caret }
      })
    };
  }

  if (
    quotePrefix !== null &&
    quotePrefix.lastMarkerStart !== null &&
    atLeadingRun &&
    line.lineNumber > 1
  ) {
    return rangeDelete(context, line.range.startOffset - 1, line.range.startOffset, "quote-degrade");
  }

  if (quotePrefix !== null && quotePrefix.lastMarkerStart !== null && offset <= contentStart) {
    const removeTo = Math.min(
      quotePrefix.lastMarkerStart + quotePrefix.markerRunLength,
      line.contentEndOffset
    );

    return rangeDelete(context, quotePrefix.lastMarkerStart, removeTo, "quote-degrade");
  }

  // 4. At a line start with no marker to remove, exactly one line break goes away: a run of
  //    separator lines above collapses one line per press, while a single separator is removed
  //    together with the break before it so the line joins the visible content above.
  if (offset === line.range.startOffset && line.lineNumber > 1) {
    return rangeDelete(context, joinSourceOffset(context, line), offset, "subtree-join");
  }

  return null;
}

// The offset the current line's Backspace deletes from. One press removes one separator line, so a
// run of them needs one press per line; a lone separator goes with the break above it.
function joinSourceOffset(context: EditorSemanticContext, line: PhysicalLine): number {
  const lines = context.lines.lines;
  let separatorCount = 0;
  let previousContentEnd = Math.max(0, line.range.startOffset - 1);

  for (let number = line.lineNumber - 1; number >= 1; number -= 1) {
    const candidate = lines[number - 1]!;

    if (!isSeparatorLine(context, candidate)) {
      previousContentEnd = candidate.contentEndOffset;
      break;
    }

    separatorCount += 1;
  }

  if (separatorCount === 0 || separatorCount > 1) {
    // One press removes exactly one line from the run above, so the break right before this line is
    // what goes; the caret then sits at the start of the line that followed the removed one.
    return line.range.startOffset - 1;
  }

  return previousContentEnd;
}

// A separator line shows no content of its own: a plain blank line, a whitespace-only line, or a
// line whose content is nothing but quote markers.
function isSeparatorLine(context: EditorSemanticContext, line: PhysicalLine): boolean {
  const raw = context.source.slice(line.range.startOffset, line.contentEndOffset);

  if (raw.length === 0) {
    return true;
  }

  const prefix = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);

  return context.source.slice(prefix.contentStartOffset, line.contentEndOffset).trim().length === 0;
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




