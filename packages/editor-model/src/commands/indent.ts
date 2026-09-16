import type { MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { indentationAnchor, lastOfKind, lineContainerChain, listItemPrefix } from "./line-structure";

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
  const edits = coveredItemLines(context, item, line).map((coveredLine) => ({
    from: indentationAnchor(coveredLine),
    to: indentationAnchor(coveredLine),
    insert: INDENT_UNIT
  }));

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


