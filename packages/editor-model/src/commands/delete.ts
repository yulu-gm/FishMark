import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan
} from "../transactions/edit-transaction-plan";
import { graphemeDeletionRange } from "./grapheme-deletion";
import { lineContainerChain } from "./line-structure";

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
    const range = graphemeDeletionRange(context.source, line, offset, "forward");
    return range === null ? null : rangeDelete(context, range.from, range.to, "default");
  }

  // 2. At the end of the line, join the next line into this one.
  const nextLine = context.lineAt(line.range.endOffset);

  if (nextLine === null || nextLine.lineNumber === line.lineNumber) {
    return null;
  }

  let joinTo = nextLine.contentStartOffset;
  const chain = lineContainerChain(context, line);
  if (chain.length === 2 && chain[1]?.kind === "paragraph" &&
      nextLine.range.startOffset === nextLine.contentEndOffset) {
    const lines = context.lines.lines;
    let followingIndex = line.lineNumber;
    while (followingIndex < lines.length &&
        lines[followingIndex]!.range.startOffset === lines[followingIndex]!.contentEndOffset) {
      followingIndex += 1;
    }
    const following = lines[followingIndex];
    const followingChain = following ? lineContainerChain(context, following) : [];
    // 普通段落之间按完整段落删除：单个分隔合并正文，额外空段落一次移除一对换行。
    // 含空格的行及列表、引用、围栏等块仍交给各自的结构规则。
    if (following && followingChain.length === 2 && followingChain[1]?.kind === "paragraph") {
      const blankCount = followingIndex - line.lineNumber;
      if (blankCount === 1) joinTo = following.contentStartOffset;
      else if (blankCount % 2 === 1) joinTo = lines[line.lineNumber + 1]!.range.startOffset;
    }
  }

  return {
    kind: "line-join",
    plan: createEditTransactionPlan({
      context,
      commandId: "delete",
      intent: "structural",
      // The break plus the next line's hidden prefix disappear, so the tail continues this leaf.
      edits: [{ from: line.contentEndOffset, to: joinTo, insert: "" }],
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
