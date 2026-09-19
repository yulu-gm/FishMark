import { childrenOf, formatTableMarkdownWithOffsets, splitTableLine, parseBlockquoteLinePrefix, type MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";
import {
  createTableRowSkeleton,
  isKind,
  isLastLineOfNode,
  lastOfKind,
  lineContainerChain,
  linePrefixText,
  continuationPrefix,
  listItemPrefix,
  indentationAnchor,
  nextListMarker,
  parentOf
} from "./line-structure";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { planFenceDraftEnter } from "./code-fence";

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
  if (activeNode?.kind === "thematic-break") {
    return paragraphBreakDecision(context, "plain", "structural", { from: line.contentEndOffset, to: line.contentEndOffset,
      insert: "\n\n", caret: line.contentEndOffset + 2 });
  }
  if (activeNode?.kind === "paragraph" && offset === line.contentEndOffset) {
    const text = lineTextOf(context, line);
    const cells = splitTableLine(text).map((cell) => cell.text);
    const next = context.lines.lines[line.lineNumber];
    const delimiter = next === undefined ? [] : splitTableLine(lineTextOf(context, next));
    if ((text.match(/\|/gu)?.length ?? 0) >= 2 && cells.length >= 2 && cells.some((cell) => cell.length > 0) &&
        !(delimiter.length >= 2 && delimiter.every((cell) => /^:?-{3,}:?$/u.test(cell.text)))) {
      const table = formatTableMarkdownWithOffsets({ header: cells, rows: [cells.map(() => "")], alignments: cells.map(() => "left") });
      return paragraphBreakDecision(context, "table-row", "structural", { from: line.range.startOffset, to: line.contentEndOffset,
        insert: table.text, caret: line.range.startOffset + table.cells.rows[0]![0]!.contentStartOffset });
    }
  }

  // 1. Fenced content owns its own lines: Enter only repeats the container prefixes, unless the
  //    opener was never closed and Enter has to give the fence a body.
  if (line.role === "fence-open" || line.role === "fence-content" || line.role === "fence-close" ||
      isKind(activeNode, "code-fence") || isKind(activeNode, "block-math")) {
    const draft = planFenceDraftEnter(context);

    if (draft !== null) {
      return { kind: "fence-line", plan: draft };
    }
    if (line.role === "fence-close" && offset === line.contentEndOffset) {
      const quote = planBlockquoteEnter(context, line, offset);
      if (quote !== null) return quote;
    }

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
  const quote = lastOfKind(chain, "blockquote");
  if (quote !== null && (item === null || quote.path.length > item.path.length)) {
    const quoted = planBlockquoteEnter(context, line, offset);
    if (quoted !== null) return quoted;
  }

  // 3. List items continue themselves, and an empty item leaves its level.
  if (item !== null && isItemLine(context, line, item)) {
    return planListItemEnter(context, line, offset, item);
  }

  // The parser owns indentation scopes. A line without an item marker is continuation
  // content, so Enter inserts a line break rather than rediscovering a list with regex.
  if (item !== null && lastOfKind(chain, "blockquote") === null) {
    if (listItemPrefix(line, context, item).markerText.length > 0) return paragraphBreak(context, line, offset, "plain", "edit");
    return plainDecision(context, line, offset, "plain", "edit");
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
  edit: {
    from: number;
    to: number;
    insert: string;
    caret: number;
    userEventName?: string;
  }
): EnterDecision {
  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "enter",
      intent,
      edits: [{ from: edit.from, to: edit.to, insert: edit.insert }],
      selection: { anchor: edit.caret, head: edit.caret },
      ...(edit.userEventName === undefined ? {} : { userEventName: edit.userEventName })
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
  const prefix = listItemPrefix(line, context, item);
  if (prefix.markerText.length === 0) return false;
  // A bare marker only continues an existing scope. Across a blank or a change of
  // marker kind/delimiter it is a draft, not an empty committed item to exit.
  const list = parentOf(context, item);
  return prefix.markerSpacingText.length > 0 || (list !== null && childrenOf(list).indexOf(item) > 0);
}

// The innermost quote owns its paragraph breaks even when an ancestor item opens
// the physical line. Reading the continuation prefix keeps that ancestor item
// indented while retaining the quote markers and their source columns.
function planBlockquoteEnter(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number
): EnterDecision | null {
  const lineText = lineTextOf(context, line);
  const continuedPrefix = continuationPrefix(line);
  const continuedLine = continuedPrefix + context.source.slice(line.contentStartOffset, line.contentEndOffset);
  const localPrefix = parseBlockquoteLinePrefix(continuedLine, 0, continuedLine.length);
  const prefix = { ...localPrefix, contentStartOffset: line.range.startOffset + localPrefix.contentStartOffset,
    markers: localPrefix.markers.map((marker) => ({ ...marker, markerStart: line.range.startOffset + marker.markerStart })) };

  if (prefix.markers.length === 0) {
    return null;
  }

  const sourcePrefix = continuedLine.slice(0, localPrefix.contentStartOffset);
  const chain = lineContainerChain(context, line);
  const quote = lastOfKind(chain, "blockquote");
  const insideItem = quote !== null && chain.some((node) => node.kind === "list-item" && node.path.length < quote.path.length);
  const content = context.source.slice(prefix.contentStartOffset, line.contentEndOffset);

  if (content.trim().length > 0) {
    const continuation = buildBlockquoteContinuationPrefix(sourcePrefix);
    const separator =
      prefix.markers.length > 1 || insideItem
        ? continuation
        : sourcePrefix.replace(/[ \t]+$/u, "");
    const insert = insideItem && offset === line.contentEndOffset ? `\n${continuation}` : `\n${separator}\n${continuation}`;

    return paragraphBreakDecision(context, "quote-continue", "structural", {
      from: offset,
      to: offset,
      insert,
      caret: offset + insert.length
    });
  }

  const previousLine = context.lines.lines[line.lineNumber - 2];
  const followsQuoteContent = previousLine !== undefined &&
    previousLine.segments.some((segment) => segment.kind === "quote-marker");
  if (!sourcePrefix.endsWith(" ") && !sourcePrefix.endsWith("\t") && !followsQuoteContent) {
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
    insert: insideItem ? `${sourcePrefix.slice(0, localPrefix.markers[0]!.markerStart)}\n` : "",
    caret: line.range.startOffset + (insideItem ? localPrefix.markers[0]!.markerStart + 1 : 0)
  });
}

function buildBlockquoteContinuationPrefix(sourcePrefix: string): string {
  if (sourcePrefix.endsWith(" ") || sourcePrefix.endsWith("\t")) {
    return sourcePrefix;
  }

  return `${sourcePrefix} `;
}

// The blank line that separates two blocks inside the container prefixes the line already had.
function buildContainerBreakPrefix(ancestorText: string): string {
  if (ancestorText.length === 0) {
    return "\n";
  }

  const nested = parseBlockquoteLinePrefix(ancestorText, 0, ancestorText.length).markers.length > 1;
  return `${nested ? ancestorText : ancestorText.replace(/[ \t]+$/u, "")}\n${buildBlockquoteContinuationPrefix(ancestorText)}`;
}

// The list an item belongs to is itself nested inside another item only when its own list sits
// inside a list item; that item is the level an empty item drops to.
function parentListItemOf(context: EditorSemanticContext, item: MarkdownNode): MarkdownNode | null {
  const list = parentOf(context, item);

  if (list === null || list.kind !== "list") {
    return null;
  }

  const owner = parentOf(context, list);

  return owner !== null && owner.kind === "list-item" ? owner : null;
}

// Leaving a list level is a named event in the legacy vocabulary; undo grouping and the renderer's
// blank-line caret handling both key off it, so the decision carries the same name.
function replaceLineDecision(
  context: EditorSemanticContext,
  line: PhysicalLine,
  replacement: string,
  caret: number
): EnterDecision {
  return paragraphBreakDecision(context, "list-exit", "structural", {
    from: line.range.startOffset,
    to: line.contentEndOffset,
    insert: replacement,
    caret,
    userEventName: "input.list-exit"
  });
}

function planListItemEnter(
  context: EditorSemanticContext,
  line: PhysicalLine,
  offset: number,
  item: MarkdownNode
): EnterDecision {
  const prefix = listItemPrefix(line, context, item);
  const leftContent = context.source.slice(line.contentStartOffset, offset);
  const isEmptyItem = leftContent.trim().length === 0;

  // At the content start of a nested item Enter promotes the item one level instead of splitting
  // it: the content stays on the line and only the item's own indentation is dropped. The marker
  // spelling is preserved so the document normalizer, which already runs on the resulting
  // transaction, can adopt the item into the scope above with that scope's ordinal.
  const hasContent = context.source.slice(offset, line.contentEndOffset).trim().length > 0;

  if (hasContent && offset === line.contentStartOffset && prefix.indentationText.length > 0) {
    const parentItem = parentListItemOf(context, item);
    const parentLine = parentItem === null ? null : context.lines.lineForNode(parentItem)[0] ?? null;
    const parentIndent = parentLine === null ? 0 : listItemPrefix(parentLine, context, parentItem!).indentationText.length;
    const drop = prefix.indentationText.length - parentIndent;
    const edits = context.lines.lineForNode(item).flatMap((covered) => {
      const anchor = indentationAnchor(covered);
      return /^[ \t]+$/u.test(context.source.slice(anchor, anchor + drop))
        ? [{ from: anchor, to: anchor + drop, insert: "" }] : [];
    });
    return { kind: "list-exit", plan: createEditTransactionPlan({ context, commandId: "enter", intent: "structural", edits,
      selection: { anchor: offset - drop, head: offset - drop }, userEventName: "input.list-exit" }) };
  }

  if (isEmptyItem) {
    // An empty item inside a nested scope drops to its parent's level, keeping its marker. The tree
    // only records that scope as an ancestor when the enclosing item really owns a nested list; the
    // indent reader flattens those items into one sibling run, so the item's own indentation run is
    // the reliable level signal there: dropping it lands the item exactly one level up.
    const parentItem = parentListItemOf(context, item);
    const parentLine = parentItem === null ? null : context.lines.lineForNode(parentItem)[0] ?? null;
    const escapedIndentation = prefix.indentationText.length > 0 ? "" : null;
    const indentationText = parentItem === null
      ? escapedIndentation
      : parentLine === null
        ? null
        : listItemPrefix(parentLine, context, parentItem).indentationText;

    if (indentationText !== null) {
      // The item keeps its marker and, for a task item, its checkbox: this shape only changes which
      // level the item sits at, so everything after the marker survives the rewrite.
      const replacement =
        `${prefix.ancestorText}${indentationText}${prefix.markerText}${prefix.markerSpacingText}${prefix.taskText}`;

      return replaceLineDecision(
        context,
        line,
        replacement,
        line.range.startOffset + replacement.length
      );
    }

    // Leaving the outermost item removes its own marker: the line becomes the container's
    // separator, and any content right of the caret moves to the continuation line. The separator
    // is only needed when something precedes the item; an item at the document start exits into a
    // plain line with no leading blank.
    const hasContent = context.source.slice(offset, line.contentEndOffset).trim().length > 0;
    const hasBlockBefore = line.lineNumber > 1;
    let prefixText = hasBlockBefore || prefix.ancestorText.length > 0
      ? buildContainerBreakPrefix(prefix.ancestorText)
      : "";
    if (hasContent && prefix.ancestorText.length > 0) {
      prefixText = `${prefix.ancestorText}\n${buildBlockquoteContinuationPrefix(prefix.ancestorText)}`;
    }
    if (!hasContent && prefix.ancestorText.length === 0 && line.range.endOffset > line.contentEndOffset) prefixText = "";
    // Padding that only frames an empty checkbox is not content, so it is not carried over when
    // the outermost item leaves its level.
    const trailing = context.source.slice(offset, line.contentEndOffset);
    const carried = trailing.trim().length === 0 && prefix.taskText.length > 0 ? "" : trailing;
    const nextLine = context.lines.lines[line.lineNumber];
    if (!hasContent && prefix.ancestorText.length === 0 && nextLine !== undefined && nextLine.range.endOffset > nextLine.range.startOffset && lineTextOf(context, nextLine).trim().length === 0) {
      return paragraphBreakDecision(context, "list-exit", "structural", { from: line.range.startOffset, to: line.range.endOffset,
        insert: "", caret: line.range.startOffset, userEventName: "input.list-exit" });
    }

    // A lone item in a lone line exits straight into its content: no marker, no separator.
    if (hasContent && prefix.ancestorText.length === 0) {
      const descendants = context.lines.lineForNode(item).filter((covered) => covered.lineNumber > line.lineNumber);
      const following = context.lines.lines[line.lineNumber];
      const suffix = following !== undefined && lineTextOf(context, following).trim().length > 0 ? "\n" : "";
      const replacement = `${prefixText}${carried}${suffix}`;
      const edits: TextEditOperation[] = [{ from: line.range.startOffset, to: line.contentEndOffset, insert: replacement }];
      for (const covered of descendants) {
        const anchor = indentationAnchor(covered);
        const indent = /^[ \t]{1,2}/u.exec(context.source.slice(anchor, covered.contentEndOffset))?.[0];
        if (indent) edits.push({ from: anchor, to: anchor + indent.length, insert: "" });
      }
      const caret = line.range.startOffset + prefixText.length;
      return { kind: "list-exit", plan: createEditTransactionPlan({ context, commandId: "enter", intent: "structural", edits,
        selection: { anchor: caret, head: caret }, userEventName: "input.list-exit" }) };
    }

    // The exit replaces from the line's start: the break before the line goes with it, and the
    // separator written here is what keeps the two blocks apart.
    return replaceLineDecision(
      context,
      line,
      `${prefixText}${carried}`,
      line.range.startOffset + prefixText.length
    );
  }

  const marker = nextListMarker(context, item, prefix.markerText);
  // A continued task item starts unchecked, whatever the previous item's state was.
  const taskText = prefix.taskText.replace(/\[[xX ]\]/u, "[ ]");
  const insert = `\n${continuationPrefix(line, prefix.startOffset)}${prefix.indentationText}${marker}${prefix.markerSpacingText}${taskText}`;

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


