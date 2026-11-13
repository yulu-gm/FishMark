import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import { INDENT_UNIT } from "./indent";
import {
  createEditTransactionPlan,
  type EditTransactionPlan
} from "../transactions/edit-transaction-plan";
import { continuationPrefix, lineContainerChain, linePrefixText, lastOfKind, quotePrefixEnd } from "./line-structure";

// Code fences own their lines: Enter inside a fence inserts content, Enter on the closing fence
// leaves the fence, completion only rewrites the opening info string, and indentation shifts the
// fence content without touching the surrounding structure.
export type CodeFencePlanKind =
  | "wrap"
  | "unwrap"
  | "completion"
  | "content-enter"
  | "boundary-exit"
  | "indent";

export interface CodeFenceDecision {
  readonly kind: CodeFencePlanKind;
  readonly plan: EditTransactionPlan;
}

export function planCodeFenceToggle(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideCodeFenceToggle(context)?.plan ?? null;
}

export function decideCodeFenceToggle(context: EditorSemanticContext): CodeFenceDecision | null {
  const selection = context.selectionContext;
  const fence = fenceNodeAt(context);

  if (fence !== null) {
    // Unwrapping keeps the fence content and drops only the marker lines.
    const inner = context.source.slice(fence.source.startOffset, fence.source.endOffset);
    const lines = inner.split("\n");

    if (lines.length < 2) {
      return null;
    }

    const body = lines.slice(1, lines.length - 1).join("\n");

    return {
      kind: "unwrap",
      plan: createEditTransactionPlan({
        context,
        commandId: "fence-edit",
        intent: "structural",
        edits: [{ from: fence.source.startOffset, to: fence.source.endOffset, insert: body }],
        selection: {
          anchor: fence.source.startOffset,
          head: fence.source.startOffset + body.length
        }
      })
    };
  }

  if (selection.empty) {
    const cursor = selection.from;
    const insert = "```\n\n```";

    return {
      kind: "wrap",
      plan: createEditTransactionPlan({
        context,
        commandId: "fence-edit",
        intent: "structural",
        edits: [{ from: cursor, to: cursor, insert }],
        selection: { anchor: cursor + 4, head: cursor + 4 }
      })
    };
  }

  const fromLine = context.lineAt(selection.from);
  const toLine = context.lineAt(selection.to);

  if (fromLine === null || toLine === null) {
    return null;
  }

  const inner = context.source.slice(fromLine.contentStartOffset, toLine.contentEndOffset);
  const prefix = linePrefixText(fromLine);
  const insert = `${prefix}\`\`\`\n${inner}\n${prefix}\`\`\``;

  return {
    kind: "wrap",
    plan: createEditTransactionPlan({
      context,
      commandId: "fence-edit",
      intent: "structural",
      edits: [{ from: fromLine.contentStartOffset, to: toLine.contentEndOffset, insert }],
      selection: {
        anchor: fromLine.contentStartOffset + prefix.length + 4,
        head: fromLine.contentStartOffset + prefix.length + 4 + inner.length
      }
    })
  };
}

// Language completion rewrites only the opening fence's info string.
export function planCodeFenceCompletion(
  context: EditorSemanticContext,
  info: string
): EditTransactionPlan | null {
  const fence = fenceNodeAt(context);

  if (fence === null || fence.data.kind !== "code-fence" || fence.data.fence !== "fenced") {
    return null;
  }

  const openingLine = context.lineAt(fence.source.startOffset);

  if (openingLine === null) {
    return null;
  }

  // The fence marker sits after any quote prefixes, so the pattern reads from there.
  const from = quotePrefixEnd(openingLine);
  const text = context.source.slice(from, openingLine.contentEndOffset);
  const match = /^([ \t]{0,3}(?:`{3,}|~{3,}))([^\n]*)$/u.exec(text);

  if (match === null) {
    return null;
  }

  const markerEnd = from + (match[1]?.length ?? 0);

  return createEditTransactionPlan({
    context,
    commandId: "fence-edit",
    intent: "edit",
    edits: [{ from: markerEnd, to: openingLine.contentEndOffset, insert: info.trim() }],
    selection: { anchor: markerEnd, head: markerEnd }
  });
}

// Enter inside a fence keeps the fence open; Enter on the closing fence leaves it.
// An opener that never closes is still a draft: Enter gives it an empty content line and the
// closing marker, so the fence body has somewhere to go.
export function planFenceDraftEnter(context: EditorSemanticContext): EditTransactionPlan | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null || line.role !== "fence-open") {
    return null;
  }

  const offset = context.selectionContext.activeOffset;

  if (offset < line.contentEndOffset) {
    return null;
  }

  const fence = fenceNodeAt(context);

  if (fence === null || context.lines.lineForNode(fence).some((covered) => covered.role === "fence-close")) {
    return null;
  }

  const content = context.source.slice(line.contentStartOffset, line.contentEndOffset);
  const opener = /^( {0,3})(`{3,}|~{3,})/u.exec(content);

  if (opener === null) {
    return null;
  }

  const prefix = linePrefixText(line);
  // A quote prefix is padded on every line the fence owns, including the closing marker, so a
  // compact opener (`>``` `) still completes to padded `> ` lines.
  const paddedPrefix = prefix.length > 0 && !/\s$/u.test(prefix) ? `${prefix} ` : prefix;
  const closing = `${paddedPrefix}${opener[1] ?? ""}${opener[2] ?? ""}`;
  const insert = `\n${paddedPrefix}\n${closing}`;
  const anchor = offset + 1 + paddedPrefix.length;

  return createEditTransactionPlan({
    context,
    commandId: "enter",
    intent: "structural",
    edits: [{ from: offset, to: offset, insert }],
    selection: { anchor, head: anchor }
  });
}

export function planCodeFenceEnter(context: EditorSemanticContext): EditTransactionPlan | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const fence = fenceNodeAt(context);

  if (fence === null) {
    return null;
  }

  const offset = context.selectionContext.activeOffset;
  const prefix = linePrefixText(line);

  const draft = planFenceDraftEnter(context);

  if (draft !== null) {
    return draft;
  }

  if (line.role === "fence-close" || line.role === "fence-open" && offset >= line.contentEndOffset) {
    // Leaving the fence: the caret moves to a fresh line after it.
    const closed = line.role === "fence-close";
    const insert = `\n${prefix}`;
    const anchor = closed ? line.range.endOffset + insert.length - 1 : offset + insert.length;

    return createEditTransactionPlan({
      context,
      commandId: "enter",
      intent: "structural",
      edits: [{ from: closed ? line.range.endOffset : offset, to: closed ? line.range.endOffset : offset, insert }],
      selection: { anchor: Math.min(anchor, context.source.length + insert.length), head: Math.min(anchor, context.source.length + insert.length) }
    });
  }

  // 只继承光标前的行首空白；在缩进中间拆行时，右侧空白仍留在原位置之后。
  const isFencedContent = line.role === "fence-content" && fence.data.kind === "code-fence" && fence.data.fence === "fenced";
  const start = isFencedContent
    ? fenceContentStart(line, context.lines.lineForNode(fence)[0] ?? line)
    : line.contentStartOffset;
  const contentPrefix = context.source.slice(line.range.startOffset, start);
  const indent = isFencedContent
    ? /^[ \t]*/u.exec(context.source.slice(start, offset))?.[0] ?? ""
    : "";
  const insert = `\n${contentPrefix}${indent}`;
  return createEditTransactionPlan({
    context,
    commandId: "enter",
    intent: "edit",
    edits: [{ from: offset, to: offset, insert }],
    selection: { anchor: offset + insert.length, head: offset + insert.length }
  });
}

// Indentation inside a fence shifts content only, never the container prefixes.
export function planCodeFenceIndent(
  context: EditorSemanticContext,
  direction: "in" | "out",
  unit = INDENT_UNIT
): EditTransactionPlan | null {
  const fence = fenceNodeAt(context);

  if (fence?.data.kind !== "code-fence" || fence.data.fence !== "fenced") {
    return null;
  }

  const { from, to, empty, selection } = context.selectionContext;
  const lines = context.lines.lineForNode(fence);
  const first = context.lineAt(from);
  // 选区末端恰好在下一行行首时，不修改那一行。
  const last = context.lineAt(empty ? to : to - 1);
  if (first?.role !== "fence-content" || last?.role !== "fence-content" ||
      !lines.includes(first) || !lines.includes(last)) {
    return null;
  }

  const opener = lines[0]!;
  const edits = lines.filter(line => line.lineNumber >= first.lineNumber && line.lineNumber <= last.lineNumber)
    .flatMap(line => {
      const start = fenceContentStart(line, opener);
      if (direction === "in") return [{ from: start, to: start, insert: unit }];
      const removed = removableIndent(context, start, line.contentEndOffset, unit.length);
      return removed === 0 ? [] : [{ from: start, to: start + removed, insert: "" }];
    });

  // 按实际改动映射两个端点，保留反向选区；删除不足一级时不多移动光标。
  const mapOffset = (offset: number): number => {
    let delta = 0;
    for (const edit of edits) {
      if (offset < edit.from) break;
      if (offset < edit.to) return edit.from + delta;
      delta += edit.insert.length - (edit.to - edit.from);
    }
    return offset + delta;
  };

  return createEditTransactionPlan({
    context,
    commandId: "fence-edit",
    intent: "structural",
    edits,
    selection: {
      anchor: mapOffset(selection.anchor),
      head: mapOffset(selection.head)
    }
  });
}

function fenceContentStart(line: PhysicalLine, opener: PhysicalLine): number {
  const tail = line.segments.at(-1);
  // 列表续行的物理前缀也包含代码缩进，只保护开围栏所需的容器前缀。
  return tail?.kind === "indentation"
    ? Math.min(line.contentStartOffset, Math.max(tail.range.startOffset,
        line.range.startOffset + continuationPrefix(opener).length))
    : line.contentStartOffset;
}

function removableIndent(context: EditorSemanticContext, start: number, end: number, limit: number): number {
  let removed = 0;

  while (removed < limit && start + removed < end) {
    const character = context.source[start + removed];

    if (character !== " " && character !== "\t") {
      break;
    }

    removed += 1;
  }

  return removed;
}

function fenceNodeAt(context: EditorSemanticContext) {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const chain = lineContainerChain(context, line);
  const fence = lastOfKind(chain, "code-fence");

  return fence;
}


