import type { MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";
import {
  blockquotePrefix,
  createTableRowSkeleton,
  isKind,
  isLastLineOfNode,
  lastOfKind,
  lineContainerChain,
  linePrefixText,
  listItemPrefix,
  nextListMarker
} from "./line-structure";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";

// Enter is decided from the semantic context alone: line roles, prefix segments, and the
// recursive tree. No DOM class names, no source rescans, and no CodeMirror state are involved.
export type EnterPlanKind =
  | "plain"
  | "heading-exit"
  | "list-continue"
  | "list-exit"
  | "quote-continue"
  | "quote-exit"
  | "fence-line"
  | "table-row"
  | "structural-blank";

export interface EnterDecision {
  readonly kind: EnterPlanKind;
  readonly plan: EditTransactionPlan;
}

export function planEnter(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideEnter(context)?.plan ?? null;
}

export function decideEnter(context: EditorSemanticContext): EnterDecision | null {
  const selection = context.selectionContext;
  const line = context.lineAt(selection.activeOffset);

  if (line === null) {
    return null;
  }

  if (!selection.empty) {
    // A non-empty selection is replaced by one line break; the surrounding structure is kept.
    const prefix = linePrefixText(line);
    const insert = `\n${prefix}`;

    return {
      kind: "plain",
      plan: createEditTransactionPlan({
        context,
        commandId: "enter",
        intent: "edit",
        edits: [{ from: selection.from, to: selection.to, insert }],
        selection: { anchor: selection.from + insert.length, head: selection.from + insert.length }
      })
    };
  }

  const chain = lineContainerChain(context, line);
  const activeNode = chain[chain.length - 1] ?? null;
  const offset = selection.activeOffset;
  const contentText = context.source.slice(line.contentStartOffset, line.contentEndOffset);

  // 1. Fenced content owns its own lines: Enter only repeats the container prefixes.
  if (line.role === "fence-open" || line.role === "fence-content" || line.role === "fence-close" ||
      isKind(activeNode, "code-fence") || isKind(activeNode, "block-math")) {
    return plainDecision(context, line, offset, "fence-line", "structural");
  }

  // 2. A table boundary grows the table by one empty row.
  const table = lastOfKind(chain, "table");
  if (table !== null && isLastLineOfNode(line, table)) {
    const row = createTableRowSkeleton(context, table);
    const prefix = linePrefixText(line);

    if (row !== null) {
      return decision(context, "table-row", "structural", offset, [`\n${prefix}${row}`]);
    }
  }

  const item = lastOfKind(chain, "list-item");

  // 3. List items continue themselves, and an empty item leaves its level.
  if (item !== null) {
    return planListItemEnter(context, line, offset, item, contentText);
  }

  // 4. Blockquotes continue their marker run, and an empty quote line leaves one level.
  const quote = lastOfKind(chain, "blockquote");
  if (quote !== null) {
    return planBlockquoteEnter(context, line, offset, contentText);
  }

  // 5. A heading never spans lines: the tail becomes an ordinary paragraph line.
  if (isKind(activeNode, "heading")) {
    return plainDecision(context, line, offset, "heading-exit", "edit");
  }

  // 6. Plain text, separators, and structural blanks repeat the enclosing container prefixes.
  if (line.role === "structural-blank" || line.role === "separator") {
    return plainDecision(context, line, offset, "structural-blank", "structural");
  }

  return plainDecision(context, line, offset, "plain", "edit");
}

function planListItemEnter(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number,
  item: MarkdownNode,
  contentText: string
): EnterDecision {
  const prefix = listItemPrefix(line, context, item);
  const isEmptyItem = contentText.trim().length === 0;

  if (isEmptyItem) {
    // Leaving the item removes its own marker, leaving an empty line at the level above.
    const exitPrefix = prefix.ancestorText;
    const edits: TextEditOperation[] = [
      { from: prefix.startOffset, to: line.contentStartOffset, insert: "" },
      { from: line.contentStartOffset, to: line.contentStartOffset, insert: `\n${exitPrefix}` }
    ];
    const cursor = prefix.startOffset + 1 + exitPrefix.length;

    return {
      kind: "list-exit",
      plan: createEditTransactionPlan({
        context,
        commandId: "enter",
        intent: "structural",
        edits,
        selection: { anchor: cursor, head: cursor }
      })
    };
  }

  const marker = nextListMarker(context, item, prefix.markerText);
  // A continued task item starts unchecked, whatever the previous item's state was.
  const taskText = prefix.taskText.replace(/\[[xX ]\]/u, "[ ]");
  const insert = `\n${prefix.ancestorText}${prefix.indentationText}${marker}${prefix.markerSpacingText}${taskText}`;

  return decision(context, "list-continue", "structural", offset, [insert]);
}

function planBlockquoteEnter(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number,
  contentText: string
): EnterDecision {
  const quotePrefix = blockquotePrefix(line);

  if (contentText.trim().length === 0 && quotePrefix.lastMarkerStartOffset !== null) {
    // Leaving one quote level drops the innermost marker from both lines.
    const markerStart = quotePrefix.lastMarkerStartOffset;
    const exitPrefix = quotePrefix.text.slice(0, markerStart - line.range.startOffset);
    const edits: TextEditOperation[] = [
      { from: markerStart, to: line.contentStartOffset, insert: "" },
      { from: line.contentStartOffset, to: line.contentStartOffset, insert: `\n${exitPrefix}` }
    ];
    const cursor = markerStart + 1 + exitPrefix.length;

    return {
      kind: "quote-exit",
      plan: createEditTransactionPlan({
        context,
        commandId: "enter",
        intent: "structural",
        edits,
        selection: { anchor: cursor, head: cursor }
      })
    };
  }

  return decision(context, "quote-continue", "structural", offset, [`\n${quotePrefix.text}`]);
}

function plainDecision(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number,
  kind: EnterPlanKind,
  intent: EditTransactionPlan["intent"]
): EnterDecision {
  return decision(context, kind, intent, offset, [`\n${linePrefixText(line)}`]);
}

function decision(
  context: EditorSemanticContext,
  kind: EnterPlanKind,
  intent: EditTransactionPlan["intent"],
  offset: number,
  inserts: readonly string[]
): EnterDecision {
  const insert = inserts[0] ?? "\n";
  const edits: TextEditOperation[] = inserts.map((text) => ({ from: offset, to: offset, insert: text }));

  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "enter",
      intent,
      edits,
      selection: { anchor: offset + insert.length, head: offset + insert.length }
    })
  };
}


