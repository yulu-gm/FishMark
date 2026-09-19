import { childrenOf, parseBlockquoteLinePrefix, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import {
  indentationAnchor,
  lastOfKind,
  lineContainerChain,
  listItemPrefix,
  parentOf
} from "./line-structure";

// Indentation is a list concept only. Tab/Shift+Tab move the nearest enclosing item subtree, and
// every line of that subtree keeps its blockquote prefixes untouched.
export type IndentPlanKind = "indent-subtree" | "outdent-subtree" | "none";

export interface IndentDecision {
  readonly kind: IndentPlanKind;
  readonly plan: EditTransactionPlan | null;
}

export const INDENT_UNIT = "  ";

export function planIndent(context: EditorSemanticContext): EditTransactionPlan | null {
  return planIndentIn(context) ?? planIndentOut(context);
}

export function planIndentIn(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideIndentIn(context)?.plan ?? null;
}

export function decideIndentIn(context: EditorSemanticContext): IndentDecision | null {
  const resolved = resolveIndentTarget(context);

  if (resolved === null) {
    return null;
  }

  const { item, line } = resolved;
  const itemIndex = listIndexOf(context, item);

  // An unterminated marker is completed and indented in one edit: the line it breaks is the very
  // line the marker sits on.
  if (isBareMarkerLine(context, line, item)) {
    return itemIndex > 0
      ? planBareMarkerIndent(context, line, item)
      : { kind: "none", plan: null };
  }

  // A run of empty quote lines above the item hides the sibling it can nest under; closing that
  // gap is part of the indent, whatever the item index says.
  const acrossSeparators = planIndentAcrossQuoteSeparators(context, line, item);

  if (acrossSeparators !== null) {
    return acrossSeparators;
  }

  // The first item of a scope has no previous sibling to nest under, so Tab leaves it alone.
  if (itemIndex <= 0) {
    return { kind: "none", plan: null };
  }

  const edits = coveredItemLines(context, item, line).map((coveredLine) => ({
    from: indentationAnchor(coveredLine),
    to: indentationAnchor(coveredLine),
    insert: INDENT_UNIT
  }));

  // The indented item opens a scope of its own, so an ordered marker restarts at the scope's first
  // ordinal instead of carrying the number it held as a sibling. The docnormalizer renumbers the
  // scope it left behind, which is why only the marker's number is rewritten here. The rewrite is
  // folded into the indentation edit of that same line so the plan keeps one edit per offset and
  // stays order-independent.
  const markerReset = firstItemMarkerReset(context, line, item);
  const markerLineEdit = markerReset === null
    ? -1
    : edits.findIndex((edit) => edit.from === indentationAnchor(line));

  if (markerLineEdit >= 0) {
    const indentationEdit = edits[markerLineEdit]!;

    edits[markerLineEdit] = {
      from: indentationEdit.from,
      to: markerReset!.to,
      insert: `${INDENT_UNIT}${markerReset!.insert}`
    };
  }

  if (edits.length === 0) {
    return { kind: "none", plan: null };
  }

  const cursor = context.selectionContext.activeOffset + INDENT_UNIT.length;

  return {
    kind: "indent-subtree",
    plan: createEditTransactionPlan({
      context,
      commandId: "indent",
      intent: "structural",
      edits,
      selection: { anchor: cursor, head: cursor }
    })
  };
}

// A run of empty quote lines between two items of the same scope is invisible separators; an
// indent closes the gap so the item becomes a child of the item above it.
function planIndentAcrossQuoteSeparators(
  context: EditorSemanticContext,
  line: PhysicalLine,
  item: MarkdownNode
): IndentDecision | null {
  const current = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);

  if (current.markers.length === 0 || line.lineNumber <= 2) {
    return null;
  }

  const currentPrefix = listItemPrefix(line, context, item);

  if (currentPrefix.markerText.length === 0) {
    return null;
  }

  let firstSeparatorStart = line.range.startOffset;
  let separatorCount = 0;
  let previousNumber = line.lineNumber - 1;

  while (previousNumber >= 1) {
    const previous = context.lines.lines[previousNumber - 1]!;
    const separator = parseBlockquoteLinePrefix(
      context.source,
      previous.range.startOffset,
      previous.contentEndOffset
    );

    if (
      separator.markers.length !== current.markers.length ||
      context.source.slice(separator.contentStartOffset, previous.contentEndOffset).trim().length > 0
    ) {
      break;
    }

    firstSeparatorStart = previous.range.startOffset;
    separatorCount += 1;
    previousNumber -= 1;
  }

  if (separatorCount === 0 || previousNumber < 1) {
    return null;
  }

  const previousLine = context.lines.lines[previousNumber - 1]!;
  const previousItem = lastOfKind(lineContainerChain(context, previousLine), "list-item");

  if (previousItem === null) {
    return null;
  }

  const previousPrefix = listItemPrefix(previousLine, context, previousItem);

  if (
    previousPrefix.markerText.length === 0 ||
    previousPrefix.indentationText !== currentPrefix.indentationText ||
    isOrderedMarker(previousPrefix.markerText) !== isOrderedMarker(currentPrefix.markerText)
  ) {
    return null;
  }

  const anchor = indentationAnchor(line);
  const removedLength = line.range.startOffset - firstSeparatorStart;
  const edits: TextEditOperation[] = [
    { from: firstSeparatorStart, to: line.range.startOffset, insert: "" },
    { from: anchor, to: anchor, insert: INDENT_UNIT }
  ];
  const cursor = context.selectionContext.activeOffset - removedLength + INDENT_UNIT.length;

  return {
    kind: "indent-subtree",
    plan: createEditTransactionPlan({
      context,
      commandId: "indent",
      intent: "structural",
      edits,
      selection: { anchor: cursor, head: cursor }
    })
  };
}

function isOrderedMarker(marker: string): boolean {
  return /^\d+[.)]$/u.test(marker);
}

function planBareMarkerIndent(
  context: EditorSemanticContext,
  line: PhysicalLine,
  item: MarkdownNode
): IndentDecision {
  const prefix = listItemPrefix(line, context, item);
  const markerEnd =
    prefix.startOffset + prefix.indentationText.length + prefix.markerText.length;
  const anchor = indentationAnchor(line);
  const reset = firstItemMarkerReset(context, line, item);
  if (reset !== null) {
    const insert = `${INDENT_UNIT}${prefix.indentationText}${reset.insert} `;
    const cursor = anchor + insert.length;
    return { kind: "indent-subtree", plan: createEditTransactionPlan({ context, commandId: "indent", intent: "structural",
      edits: [{ from: anchor, to: markerEnd, insert }], selection: { anchor: cursor, head: cursor } }) };
  }
  const edits: TextEditOperation[] = [
    { from: anchor, to: anchor, insert: INDENT_UNIT },
    { from: markerEnd, to: markerEnd, insert: " " }
  ];
  const cursor = context.selectionContext.activeOffset + INDENT_UNIT.length + 1;

  return {
    kind: "indent-subtree",
    plan: createEditTransactionPlan({
      context,
      commandId: "indent",
      intent: "structural",
      edits,
      selection: { anchor: cursor, head: cursor }
    })
  };
}

// A marker with nothing after it on the line is not committed yet.
function isBareMarkerLine(
  context: EditorSemanticContext,
  line: PhysicalLine,
  item: MarkdownNode
): boolean {
  const prefix = listItemPrefix(line, context, item);

  if (prefix.markerText.length === 0) {
    return false;
  }

  const markerEnd =
    prefix.startOffset + prefix.indentationText.length + prefix.markerText.length;

  return line.contentEndOffset <= markerEnd;
}

function listIndexOf(context: EditorSemanticContext, item: MarkdownNode): number {
  const parent = parentOf(context, item);

  return parent === null || parent.kind !== "list" ? -1 : childrenOf(parent).indexOf(item);
}

export function planIndentOut(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideIndentOut(context)?.plan ?? null;
}

export function decideIndentOut(context: EditorSemanticContext): IndentDecision | null {
  const resolved = resolveIndentTarget(context);

  if (resolved === null) {
    return null;
  }

  const { item, line } = resolved;
  const prefix = listItemPrefix(line, context, item);
  const amount = Math.min(prefix.indentationText.length, INDENT_UNIT.length);
  const edits: TextEditOperation[] = [];

  const chain = lineContainerChain(context, line);
  const list = parentOf(context, item);
  const owner = list === null ? null : parentOf(context, list);
  // A child opened on its ancestor's physical line has no indentation to remove.
  // Its marker is the level boundary, including when a quote lies between items.
  const sharesAncestorLine = owner?.kind === "list-item" &&
    line.segments.filter((segment) => segment.kind === "list-marker").length > 1;
  const quotedNestedItem = owner?.kind === "blockquote" && chain.filter((node) => node.kind === "list-item").length > 1;
  if (amount === 0 && prefix.markerText.length > 0 && (sharesAncestorLine || quotedNestedItem)) {
    const from = prefix.startOffset;
    const to = from + prefix.markerText.length + prefix.markerSpacingText.length + prefix.taskText.length;
    const cursor = Math.max(from, context.selectionContext.activeOffset - (to - from));
    return { kind: "outdent-subtree", plan: createEditTransactionPlan({ context, commandId: "indent", intent: "structural",
      edits: [{ from, to, insert: "" }], selection: { anchor: cursor, head: cursor } }) };
  }

  if (amount > 0) {
    for (const coveredLine of coveredItemLines(context, item, line)) {
      const anchor = indentationAnchor(coveredLine);
      const removable = context.source.slice(anchor, anchor + amount);

      if (/^[ \t]+$/u.test(removable) && removable.length > 0) {
        edits.push({
          from: anchor,
          to: anchor + removable.length,
          insert: ""
        });
      }
    }
  }

  if (edits.length === 0) {
    return { kind: "none", plan: null };
  }

  const cursor = Math.max(0, context.selectionContext.activeOffset - amount);

  return {
    kind: "outdent-subtree",
    plan: createEditTransactionPlan({
      context,
      commandId: "indent",
      intent: "structural",
      edits,
      selection: { anchor: cursor, head: cursor }
    })
  };
}

function resolveIndentTarget(
  context: EditorSemanticContext
): { item: MarkdownNode; line: PhysicalLine } | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const item = lastOfKind(lineContainerChain(context, line), "list-item");

  return item === null ? null : { item, line };
}

// Every physical line the item subtree covers, in document order.
function coveredItemLines(
  context: EditorSemanticContext,
  item: MarkdownNode,
  fallback: PhysicalLine
): readonly PhysicalLine[] {
  const covered = context.lines.lineForNode(item);

  return covered.length === 0 ? [fallback] : covered;
}

// Rewrites an ordered marker's number to the ordinal the indented scope starts at. The delimiter
// the author used is preserved, and an unordered marker has no number to reset. The offset is the
// plan's own source offset: the indentation edit sits earlier on the same line and the adapter
// applies edits from the end of the document backwards.
function firstItemMarkerReset(
  context: EditorSemanticContext,
  line: PhysicalLine,
  item: MarkdownNode
): TextEditOperation | null {
  const prefix = listItemPrefix(line, context, item);
  const ordered = /^(\d+)([.)])$/u.exec(prefix.markerText);

  if (ordered === null) {
    return null;
  }

  const from = line.range.startOffset + prefix.ancestorText.length + prefix.indentationText.length;

  return { from, to: from + prefix.markerText.length, insert: `1${ordered[2] ?? "."}` };
}


