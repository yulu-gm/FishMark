import { parseBlockquoteLinePrefix, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";
import {
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
    // A non-empty selection is replaced by one paragraph break; the surrounding structure stays.
    return paragraphBreakDecision(context, "plain", "edit", {
      from: selection.from,
      to: selection.to,
      insert: "\n\n",
      caret: selection.from + 2
    });
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
  if (item !== null && isItemLine(context, line, item)) {
    return planListItemEnter(context, line, offset, item, contentText);
  }

  // 4. A quoted line continues its marker run: a paragraph break inside a quote is written as a
  // separator line carrying the quote markers, then the continuation prefix.
  if (lastOfKind(chain, "blockquote") !== null) {
    const quoted = planBlockquoteEnter(context, line, offset);

    if (quoted !== null) {
      return quoted;
    }
  }

  // 5. A heading never spans lines: Enter at its end starts a new paragraph after a blank line.
  if (isKind(activeNode, "heading")) {
    if (offset === line.contentEndOffset) {
      return paragraphBreak(context, line, offset, "heading-exit", "edit");
    }

    return plainDecision(context, line, offset, "heading-exit", "edit");
  }

  // 6. Plain text and structural blanks start a new paragraph separated by a blank line.
  const blank = lineTextOf(context, line).trim().length === 0;

  return paragraphBreak(
    context,
    line,
    offset,
    blank ? "structural-blank" : "plain",
    blank ? "structural" : "edit"
  );
}

function paragraphBreak(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number,
  kind: EnterPlanKind,
  intent: EditTransactionPlan["intent"]
): EnterDecision {
  const plan = resolveParagraphBreak(context, line, offset);

  return paragraphBreakDecision(context, kind, intent, {
    from: offset,
    to: offset,
    insert: plan.insert,
    caret: plan.caret
  });
}

// The legacy paragraph rule: blocks are separated by a blank line, so Enter writes two line
// breaks and leaves the caret on the new empty line. Adjacent content keeps its distance by
// pushing one extra blank line in, and a caret already on an empty line just opens a new one.
function resolveParagraphBreak(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number
): { insert: string; caret: number } {
  const defaultInsert = "\n\n";
  const text = lineTextOf(context, line);

  if (text.trim().length === 0) {
    return { insert: defaultInsert, caret: offset + defaultInsert.length };
  }

  if (offset === line.range.startOffset && line.lineNumber > 1) {
    const previous = context.lines.lines[line.lineNumber - 2] ?? null;

    if (previous !== null && lineTextOf(context, previous).trim().length === 0) {
      return { insert: defaultInsert, caret: offset + 1 };
    }
  }

  if (offset === line.contentEndOffset && line.lineNumber < context.lines.lines.length) {
    const next = context.lines.lines[line.lineNumber] ?? null;

    if (next !== null && lineTextOf(context, next).trim().length > 0) {
      return { insert: "\n\n\n", caret: offset + 2 };
    }
  }

  return { insert: defaultInsert, caret: offset + defaultInsert.length };
}

function paragraphBreakDecision(
  context: EditorSemanticContext,
  kind: EnterPlanKind,
  intent: EditTransactionPlan["intent"],
  edit: { from: number; to: number; insert: string; caret: number }
): EnterDecision {
  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "enter",
      intent,
      edits: [{ from: edit.from, to: edit.to, insert: edit.insert }],
      selection: { anchor: edit.caret, head: edit.caret }
    })
  };
}

function lineTextOf(context: EditorSemanticContext, line: PhysicalLine): string {
  return context.source.slice(line.range.startOffset, line.contentEndOffset);
}

// A list item owns its own line only when that line carries its marker; a continuation line of
// the same item belongs to the enclosing paragraph rules instead.
function isItemLine(
  context: EditorSemanticContext,
  line: PhysicalLine,
  item: MarkdownNode
): boolean {
  return listItemPrefix(line, context, item).markerText.length > 0;
}

// A quoted line only continues a blockquote when the quote markers open the line itself; a quote
// that starts after a list marker belongs to the list instead. The marker run decides both the
// separator line (a blank line inside a quote must carry its markers) and the continuation
// prefix, and an uncommitted marker run is completed before the break.
function planBlockquoteEnter(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number
): EnterDecision | null {
  const lineText = lineTextOf(context, line);
  const prefix = parseBlockquoteLinePrefix(context.source, line.range.startOffset, line.contentEndOffset);

  if (prefix.markers.length === 0) {
    return null;
  }

  const sourcePrefix = context.source.slice(line.range.startOffset, prefix.contentStartOffset);
  const content = context.source.slice(prefix.contentStartOffset, line.contentEndOffset);

  if (content.trim().length > 0) {
    const continuation = buildBlockquoteContinuationPrefix(sourcePrefix);
    const separator =
      prefix.markers.length > 1
        ? continuation
        : sourcePrefix.replace(/[ \t]+$/u, "");
    const insert = `\n${separator}\n${continuation}`;

    return paragraphBreakDecision(context, "quote-continue", "structural", {
      from: offset,
      to: offset,
      insert,
      caret: offset + insert.length
    });
  }

  if (!sourcePrefix.endsWith(" ") && !sourcePrefix.endsWith("\t")) {
    // The marker run is not committed yet: Enter completes it and opens the quoted line below.
    const committed = `${prefix.markers.map(() => "> ").join("")}`;
    const insert = `${committed.slice(lineText.length)}\n${committed}`;

    return paragraphBreakDecision(context, "quote-continue", "structural", {
      from: line.contentEndOffset,
      to: line.contentEndOffset,
      insert,
      caret: line.contentEndOffset + insert.length
    });
  }

  // An empty innermost quote line leaves the quote. When the line above is already an empty
  // quoted line of the same depth, the pair collapses instead of growing one more separator.
  const previous = line.lineNumber > 1 ? context.lines.lines[line.lineNumber - 2] ?? null : null;
  const previousPrefix =
    previous === null
      ? null
      : parseBlockquoteLinePrefix(context.source, previous.range.startOffset, previous.contentEndOffset);
  const deleteTo =
    context.source[line.contentEndOffset] === "\n" ? line.contentEndOffset + 1 : line.contentEndOffset;

  if (
    previous !== null &&
    previousPrefix !== null &&
    previousPrefix.markers.length === prefix.markers.length &&
    context.source.slice(previousPrefix.contentStartOffset, previous.contentEndOffset).trim().length === 0
  ) {
    let replacement = "\n";

    if (prefix.markers.length > 1) {
      const parentPrefix = buildBlockquoteContinuationPrefix(
        context.source.slice(line.range.startOffset, prefix.markers[prefix.markers.length - 1]!.markerStart)
      );
      const parentDepth = prefix.markers.length - 1;
      const separator = parentDepth > 1 ? parentPrefix : parentPrefix.replace(/[ \t]+$/u, "");

      replacement = `${separator}\n${parentPrefix}`;
    }

    return paragraphBreakDecision(context, "quote-exit", "structural", {
      from: previous.range.startOffset,
      to: deleteTo,
      insert: replacement,
      caret: previous.range.startOffset + replacement.length
    });
  }

  if (prefix.markers.length > 1) {
    // Leaving one quote level keeps the enclosing markers on the line.
    const lastMarker = prefix.markers[prefix.markers.length - 1]!;
    const parentPrefix = buildBlockquoteContinuationPrefix(
      context.source.slice(line.range.startOffset, lastMarker.markerStart)
    );

    return paragraphBreakDecision(context, "quote-exit", "structural", {
      from: line.range.startOffset,
      to: line.contentEndOffset,
      insert: parentPrefix,
      caret: line.range.startOffset + parentPrefix.length
    });
  }

  return paragraphBreakDecision(context, "quote-exit", "structural", {
    from: line.range.startOffset,
    to: deleteTo,
    insert: "",
    caret: line.range.startOffset
  });
}

function buildBlockquoteContinuationPrefix(sourcePrefix: string): string {
  if (sourcePrefix.endsWith(" ") || sourcePrefix.endsWith("\t")) {
    return sourcePrefix;
  }

  return `${sourcePrefix} `;
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


