import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan
} from "../transactions/edit-transaction-plan";

// Forward delete mirrors Backspace: delete one character, or join the next line by removing its
// break and its hidden prefix. The joined content lands in the current leaf, and the caller's
// next snapshot recomputes the destination path from the new tree.
export type DeletePlanKind = "default" | "range-delete" | "line-join";

export interface DeleteDecision {
  readonly kind: DeletePlanKind;
  readonly plan: EditTransactionPlan;
}

export function planDelete(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideDelete(context)?.plan ?? null;
}

export function decideDelete(context: EditorSemanticContext): DeleteDecision | null {
  const selection = context.selectionContext;
  const line = context.lineAt(selection.activeOffset);

  if (line === null) {
    return null;
  }

  if (!selection.empty) {
    return rangeDelete(context, selection.from, selection.to);
  }

  const offset = selection.activeOffset;

  // 1. An ordinary character delete.
  if (offset < line.contentEndOffset) {
    return rangeDelete(context, offset, offset + 1, "default");
  }

  // 2. At the end of the line, join the next line into this one.
  const nextLine = context.lineAt(line.range.endOffset);

  if (nextLine === null || nextLine.lineNumber === line.lineNumber) {
    return null;
  }

  return {
    kind: "line-join",
    plan: createEditTransactionPlan({
      context,
      commandId: "delete",
      intent: "structural",
      // The break plus the next line's hidden prefix disappear, so the tail continues this leaf.
      edits: [{ from: line.contentEndOffset, to: nextLine.contentStartOffset, insert: "" }],
      selection: { anchor: line.contentEndOffset, head: line.contentEndOffset }
    })
  };
}

function rangeDelete(
  context: EditorSemanticContext,
  from: number,
  to: number,
  kind: DeletePlanKind = "range-delete"
): DeleteDecision {
  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "delete",
      intent: kind === "default" ? "edit" : "structural",
      edits: [{ from, to, insert: "" }],
      selection: { anchor: from, head: from }
    })
  };
}
