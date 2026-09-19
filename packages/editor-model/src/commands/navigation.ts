import { parseBlockquoteLinePrefix } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import { clampSelectionToSource } from "../context/selection-context";
import { advanceVisibleColumn } from "../physical-lines/prefix-segment";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";

// Selection policy is explicit: every user-intent source declares whether it may change document
// structure and whether it moves the caret, so no global filter has to guess intent.
export type NavigationIntent =
  | "pointer"
  | "structural-arrow"
  | "printable-input"
  | "programmatic-normalization";

export interface IntentPolicy {
  readonly intent: NavigationIntent;
  readonly structural: boolean;
  readonly movesCaret: boolean;
}

export const INTENT_POLICIES: Readonly<Record<NavigationIntent, IntentPolicy>> = Object.freeze({
  pointer: { intent: "pointer", structural: false, movesCaret: true },
  "structural-arrow": { intent: "structural-arrow", structural: true, movesCaret: true },
  "printable-input": { intent: "printable-input", structural: false, movesCaret: true },
  "programmatic-normalization": {
    intent: "programmatic-normalization",
    structural: false,
    movesCaret: false
  }
});

export function policyFor(intent: NavigationIntent): IntentPolicy {
  return INTENT_POLICIES[intent];
}

// Vertical navigation moves between visible lines and keeps the preferred visible column, which
// skips hidden prefixes without ever changing the document. Lines that exist only to separate
// blocks — blank lines and bare quote markers — are not visible, so the caret steps over them.
export function planVerticalNavigation(
  context: EditorSemanticContext,
  direction: "up" | "down"
): EditTransactionPlan | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const lines = context.lines.lines;
  const step = direction === "down" ? 1 : -1;
  let targetNumber = line.lineNumber + step;
  let skippedSeparator = false;

  while (targetNumber >= 1 && targetNumber <= lines.length) {
    const candidate = lines[targetNumber - 1]!;

    if (!isStructuralSeparatorLine(context, candidate)) {
      break;
    }

    skippedSeparator = true;
    targetNumber += step;
  }

  if (targetNumber < 1 || targetNumber > lines.length) {
    return null;
  }

  const targetLine = lines[targetNumber - 1]!;
  const preferredColumn = context.lines.visibleColumnAt(context.selectionContext.activeOffset);
  // Stepping up across a separator lands at the end of the visible line above it; every other
  // move keeps the visible column.
  const offset =
    direction === "up" && skippedSeparator
      ? targetLine.contentEndOffset
      : offsetAtVisibleColumn(context, targetLine, preferredColumn);

  return createEditTransactionPlan({
    context,
    commandId: "pointer",
    intent: "navigation",
    edits: [],
    selection: { anchor: offset, head: offset }
  });
}

// A line whose content is empty — blank, whitespace-only, or nothing but quote markers — only
// separates blocks and is never a navigation target.
function isStructuralSeparatorLine(context: EditorSemanticContext, line: PhysicalLine): boolean {
  const prefix = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);
  const text = context.source.slice(prefix.contentStartOffset, line.contentEndOffset);
  if (prefix.markers.length > 0) return text.trim().length === 0;
  if (text.length > 0) return false;
  let count = 1;
  for (let index = line.lineNumber - 2; index >= 0; index -= 1) {
    const previous = context.lines.lines[index]!;
    if (previous.contentEndOffset !== previous.range.startOffset) break;
    count += 1;
  }
  return count % 2 === 1;
}

// Printable input only inserts text at the caret: it cannot move structure or normalize syntax.
export function planPrintableInput(
  context: EditorSemanticContext,
  text: string
): EditTransactionPlan {
  const selection = context.selectionContext;
  const edits: TextEditOperation[] = [{ from: selection.from, to: selection.to, insert: text }];
  const caret = selection.from + text.length;

  return createEditTransactionPlan({
    context,
    commandId: "insert-text",
    intent: "edit",
    edits,
    selection: { anchor: caret, head: caret }
  });
}

// A hard break is an explicit Markdown command, not provisional IME typing.
export function planHardBreak(context: EditorSemanticContext): EditTransactionPlan {
  const input = planPrintableInput(context, "<br>");
  return createEditTransactionPlan({ context, commandId: "hard-break", intent: "edit",
    edits: input.edits, selection: input.selection });
}

// A pointer press sets the caret without touching the document.
export function planPointerSelection(
  context: EditorSemanticContext,
  offset: number
): EditTransactionPlan {
  const selection = clampSelectionToSource({ anchor: offset, head: offset }, context.source.length);

  return createEditTransactionPlan({
    context,
    commandId: "pointer",
    intent: "navigation",
    edits: [],
    selection
  });
}

// Programmatic normalization never changes selection or structure on its own.
export function planProgrammaticNormalization(context: EditorSemanticContext): null {
  void context;

  return null;
}

function offsetAtVisibleColumn(
  context: EditorSemanticContext,
  line: PhysicalLine,
  preferredColumn: number
): number {
  const hiddenColumn = hiddenColumnsFor(line);
  let column = 0;
  let offset = line.contentStartOffset;

  while (offset < line.contentEndOffset) {
    const character = context.source[offset] ?? "";
    const nextColumn = advanceVisibleColumn(column, character);

    if (hiddenColumn + nextColumn > preferredColumn) {
      break;
    }

    column = nextColumn;
    offset += 1;
  }

  return offset;
}

function hiddenColumnsFor(line: PhysicalLine): number {
  let hidden = 0;

  for (const segment of line.segments) {
    if (segment.kind === "spacing" || segment.kind === "indentation" || segment.kind === "task-marker") {
      hidden = advanceVisibleColumn(hidden, segment.text);
    }
  }

  return hidden;
}


