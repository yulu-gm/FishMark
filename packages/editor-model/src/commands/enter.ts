import { childrenOf, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";
import type { PrefixSegment } from "../physical-lines/prefix-segment";

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

type ListItemPrefix = {
  readonly startOffset: number;
  readonly ancestorText: string;
  readonly indentationText: string;
  readonly markerText: string;
  readonly markerSpacingText: string;
  readonly taskText: string;
};

// The deepest item's own prefix is its marker run plus the indentation that positions it under
// its parent. Everything before that belongs to the enclosing containers.
function listItemPrefix(
  line: PhysicalLine,
  context: EditorSemanticContext,
  item: MarkdownNode
): ListItemPrefix {
  const segments = line.segments;
  let markerIndex = -1;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]!.kind === "list-marker") {
      markerIndex = index;
      break;
    }
  }

  if (markerIndex === -1) {
    return {
      startOffset: line.contentStartOffset,
      ancestorText: linePrefixText(line),
      indentationText: "",
      markerText: "",
      markerSpacingText: "",
      taskText: ""
    };
  }

  const indentIndex = markerIndex > 0 && segments[markerIndex - 1]!.kind === "indentation"
    ? markerIndex - 1
    : markerIndex;
  const startOffset = segments[indentIndex]!.range.startOffset;
  const ancestorText = context.source.slice(line.range.startOffset, startOffset);
  const indentationText = segments[indentIndex]!.kind === "indentation" ? segments[indentIndex]!.text : "";
  const markerText = segments[markerIndex]!.text;
  let markerSpacingText = "";
  let taskText = "";

  for (let index = markerIndex + 1; index < segments.length; index += 1) {
    const segment = segments[index]!;

    if (segment.kind === "spacing" && taskText.length === 0) {
      markerSpacingText += segment.text;
      continue;
    }

    if (segment.kind === "task-marker") {
      taskText += segment.text;
      continue;
    }

    if (segment.kind === "spacing") {
      taskText += segment.text;
      continue;
    }

    break;
  }

  void item;

  return {
    startOffset,
    ancestorText,
    indentationText,
    markerText,
    markerSpacingText: markerSpacingText.length === 0 ? " " : markerSpacingText,
    taskText
  };
}

type QuotePrefix = {
  readonly text: string;
  readonly lastMarkerStartOffset: number | null;
};

function blockquotePrefix(line: PhysicalLine): QuotePrefix {
  const quoteSegments = line.segments.filter(
    (segment) => segment.kind === "quote-marker" || segment.kind === "spacing" || segment.kind === "indentation"
  );
  const lastQuoteMarker = [...line.segments].reverse().find((segment) => segment.kind === "quote-marker");

  return {
    text: quoteSegments.map((segment) => segment.text).join(""),
    lastMarkerStartOffset: lastQuoteMarker?.range.startOffset ?? null
  };
}

function linePrefixText(line: PhysicalLine): string {
  return line.segments.map((segment: PrefixSegment) => segment.text).join("");
}

function nextListMarker(
  context: EditorSemanticContext,
  item: MarkdownNode,
  currentMarker: string
): string {
  const list = deepestAncestorOfKind(context, item, "list");

  if (list === null || list.data.kind !== "list" || !list.data.ordered) {
    // Unordered and task items keep their own marker character.
    return currentMarker.length === 0 ? "-" : currentMarker.replace(/\d+/u, "1");
  }

  const index = childrenOf(list).indexOf(item);
  const start = list.data.startOrdinal ?? 1;
  const delimiter = list.data.delimiter ?? ".";

  return `${start + Math.max(index, 0) + 1}${delimiter}`;
}

function createTableRowSkeleton(context: EditorSemanticContext, table: MarkdownNode): string | null {
  if (table.data.kind !== "table" || table.data.columnCount <= 0) {
    return null;
  }

  const firstLine = context.lineAt(table.source.startOffset);
  const usesOuterPipes = firstLine !== null &&
    context.source.slice(firstLine.range.startOffset, firstLine.contentEndOffset).trimStart().startsWith("|");
  const cells = Array.from({ length: table.data.columnCount }, () => "  ");

  return usesOuterPipes ? `|${cells.join("|")}|` : cells.join("|");
}

function isLastLineOfNode(line: PhysicalLine, node: MarkdownNode): boolean {
  return line.contentEndOffset >= node.source.endOffset ||
    node.source.endOffset <= line.range.endOffset;
}

// The containers a line belongs to, from the document down to its deepest node. Lines are
// matched by overlap so an empty container line still resolves to that container.
function lineContainerChain(
  context: EditorSemanticContext,
  line: PhysicalLine
): readonly MarkdownNode[] {
  const chain: MarkdownNode[] = [context.snapshot.tree.root];
  let current: MarkdownNode = context.snapshot.tree.root;

  for (;;) {
    const next: MarkdownNode | undefined = childrenOf(current).find(
      (child) =>
        child.source.startOffset < line.contentEndOffset &&
        child.source.endOffset > line.range.startOffset
    );

    if (next === undefined) {
      return chain;
    }

    chain.push(next);
    current = next;
  }
}

function lastOfKind(chain: readonly MarkdownNode[], kind: MarkdownNode["kind"]): MarkdownNode | null {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (chain[index]!.kind === kind) {
      return chain[index]!;
    }
  }

  return null;
}

function deepestAncestorOfKind(
  context: EditorSemanticContext,
  node: MarkdownNode | null,
  kind: MarkdownNode["kind"]
): MarkdownNode | null {
  if (node === null) {
    return null;
  }

  let current: MarkdownNode | null = node;
  while (current !== null) {
    if (current.kind === kind) {
      return current;
    }

    current = parentOf(context, current);
  }

  return null;
}

function parentOf(context: EditorSemanticContext, node: MarkdownNode): MarkdownNode | null {
  if (node.path.length === 0) {
    return null;
  }

  let current: MarkdownNode = context.snapshot.tree.root;
  for (let depth = 0; depth < node.path.length - 1; depth += 1) {
    const next: MarkdownNode | undefined = childrenOf(current)[node.path[depth] ?? -1];
    if (next === undefined) {
      return null;
    }

    current = next;
  }

  return current;
}

function isKind(node: MarkdownNode | null, kind: MarkdownNode["kind"]): boolean {
  return node !== null && node.kind === kind;
}




