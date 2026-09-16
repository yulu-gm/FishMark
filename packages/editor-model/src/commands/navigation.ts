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
// skips hidden prefixes without ever changing the document.
export function planVerticalNavigation(
  context: EditorSemanticContext,
  direction: "up" | "down"
): EditTransactionPlan | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const targetLine = context.lines.lines.find(
    (candidate) => candidate.lineNumber === line.lineNumber + (direction === "down" ? 1 : -1)
  );

  if (targetLine === undefined) {
    return null;
  }

  const preferredColumn = context.lines.visibleColumnAt(context.selectionContext.activeOffset);
  const offset = offsetAtVisibleColumn(context, targetLine, preferredColumn);

  return createEditTransactionPlan({
    context,
    commandId: "pointer",
    intent: "navigation",
    edits: [],
    selection: { anchor: offset, head: offset }
  });
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


