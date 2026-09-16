import type { InlineNode, MarkdownLeafNode, MarkdownNode } from "@fishmark/markdown-engine";
import type { PhysicalLine } from "../physical-lines/physical-editing-document";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lineContainerChain, quotePrefixEnd } from "./line-structure";

// Inline and block formatting toggles. They only rewrite the exact source range they change, so
// spelling outside the edit survives byte for byte, and history stays one transaction per toggle.
export type FormattingPlanKind =
  | "strong"
  | "emphasis"
  | "heading"
  | "bullet-list"
  | "blockquote";

export interface FormattingDecision {
  readonly kind: FormattingPlanKind;
  readonly plan: EditTransactionPlan;
}

const HEADING_LINE_PATTERN = /^(\s{0,3})(#{1,6})(?:[ \t]+|$)(.*)$/u;
const BULLET_LINE_PATTERN = /^(\s*)([*+-])([ \t]+)(.*)$/u;

export function planStrongToggle(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideStrongToggle(context)?.plan ?? null;
}

export function decideStrongToggle(context: EditorSemanticContext): FormattingDecision | null {
  return inlineToggle(context, "strong", "**");
}

export function planEmphasisToggle(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideEmphasisToggle(context)?.plan ?? null;
}

export function decideEmphasisToggle(context: EditorSemanticContext): FormattingDecision | null {
  return inlineToggle(context, "emphasis", "*");
}

export function planHeadingToggle(
  context: EditorSemanticContext,
  level: 1 | 2 | 3 | 4 | 5 | 6
): EditTransactionPlan | null {
  return decideHeadingToggle(context, level)?.plan ?? null;
}

export function decideHeadingToggle(
  context: EditorSemanticContext,
  level: 1 | 2 | 3 | 4 | 5 | 6
): FormattingDecision | null {
  const lines = selectedLines(context);

  if (lines.length === 0) {
    return null;
  }

  const targetMarker = "#".repeat(level);
  const allMatchTarget = lines.every((line) => headingMarkerOf(context, line) === targetMarker);
  const edits: TextEditOperation[] = lines.map((line) => {
    const from = quotePrefixEnd(line);
    const text = formatTargetTextOf(context, line);
    const match = HEADING_LINE_PATTERN.exec(text);

    if (allMatchTarget) {
      const indent = match?.[1] ?? "";
      const markerLength = text.startsWith(`${indent}${targetMarker} `)
        ? indent.length + targetMarker.length + 1
        : indent.length + targetMarker.length;

      return {
        from,
        to: from + markerLength,
        insert: ""
      };
    }

    if (match !== null) {
      const indent = match[1] ?? "";
      const existingMarker = match[2] ?? "";
      const replaceLength = text.startsWith(`${indent}${existingMarker} `)
        ? indent.length + existingMarker.length + 1
        : indent.length + existingMarker.length;

      return {
        from,
        to: from + replaceLength,
        insert: `${indent}${targetMarker} `
      };
    }

    return { from, to: from, insert: `${targetMarker} ` };
  });

  return {
    kind: "heading",
    plan: createEditTransactionPlan({
      context,
      commandId: "format-inline",
      intent: "structural",
      edits,
      selection: selectionFromEdits(context, edits)
    })
  };
}

export function planBulletListToggle(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideBulletListToggle(context)?.plan ?? null;
}

export function decideBulletListToggle(context: EditorSemanticContext): FormattingDecision | null {
  const lines = selectedLines(context).filter((line) => line.contentEndOffset > line.contentStartOffset || true);

  if (lines.length === 0) {
    return null;
  }

  // The marker pattern reads the line after its quote prefixes, so quoted content keeps its
  // structure and nested indentation is preserved.
  const allBullet = lines.every((line) => BULLET_LINE_PATTERN.test(formatTargetTextOf(context, line)));
  const edits: TextEditOperation[] = lines.map((line) => {
    const from = quotePrefixEnd(line);
    const text = formatTargetTextOf(context, line);
    const match = BULLET_LINE_PATTERN.exec(text);
    const indentLength = match?.[1]?.length ?? 0;

    if (allBullet && match !== null) {
      // Remove marker and its spacing, keeping indentation and content.
      const markerStart = from + indentLength;
      const markerEnd = markerStart + (match[2]?.length ?? 0) + (match[3]?.length ?? 0);

      return { from: markerStart, to: markerEnd, insert: "" };
    }

    return { from: from + indentLength, to: from + indentLength, insert: "- " };
  });

  return {
    kind: "bullet-list",
    plan: createEditTransactionPlan({
      context,
      commandId: "format-inline",
      intent: "structural",
      edits,
      selection: selectionFromEdits(context, edits)
    })
  };
}

export function planBlockquoteToggle(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideBlockquoteToggle(context)?.plan ?? null;
}

export function decideBlockquoteToggle(context: EditorSemanticContext): FormattingDecision | null {
  const lines = selectedLines(context);

  if (lines.length === 0) {
    return null;
  }

  const targetLines = lines.filter((line) => line.contentEndOffset > line.contentStartOffset);
  const allQuoted = targetLines.length > 0 &&
    targetLines.every((line) => context.source.slice(line.contentStartOffset, line.contentEndOffset).trim().length > 0) &&
    targetLines.every((line) => line.segments.some((segment) => segment.kind === "quote-marker"));
  const edits: TextEditOperation[] = [];

  for (const line of lines) {
    if (line.contentEndOffset <= line.contentStartOffset && lines.length > 1) {
      continue;
    }

    if (allQuoted) {
      const marker = [...line.segments].reverse().find((segment) => segment.kind === "quote-marker");

      if (marker === undefined) {
        continue;
      }

      const spacing = line.segments.find(
        (segment) => segment.kind === "spacing" && segment.range.startOffset === marker.range.endOffset
      );

      edits.push({
        from: marker.range.startOffset,
        to: marker.range.endOffset + (spacing?.text.length ?? 0),
        insert: ""
      });
      continue;
    }

    edits.push({ from: line.contentStartOffset, to: line.contentStartOffset, insert: "> " });
  }

  if (edits.length === 0) {
    return null;
  }

  return {
    kind: "blockquote",
    plan: createEditTransactionPlan({
      context,
      commandId: "format-inline",
      intent: "structural",
      edits,
      selection: selectionFromEdits(context, edits)
    })
  };
}

function inlineToggle(
  context: EditorSemanticContext,
  type: "strong" | "emphasis",
  marker: string
): FormattingDecision | null {
  const selection = context.selectionContext;

  if (!selection.empty) {
    const enclosing = findEnclosingInline(context, type, selection.from, selection.to);

    if (enclosing !== null) {
      const inner = context.source.slice(enclosing.openMarker.endOffset, enclosing.closeMarker.startOffset);

      return {
        kind: type,
        plan: createEditTransactionPlan({
          context,
          commandId: "format-inline",
          intent: "edit",
          edits: [{ from: enclosing.startOffset, to: enclosing.endOffset, insert: inner }],
          selection: {
            anchor: selection.from - marker.length,
            head: selection.to - marker.length
          }
        })
      };
    }

    const slice = context.source.slice(selection.from, selection.to);

    return {
      kind: type,
      plan: createEditTransactionPlan({
        context,
        commandId: "format-inline",
        intent: "edit",
        edits: [{ from: selection.from, to: selection.to, insert: `${marker}${slice}${marker}` }],
        selection: {
          anchor: selection.from + marker.length,
          head: selection.to + marker.length
        }
      })
    };
  }

  const cursor = selection.from;

  return {
    kind: type,
    plan: createEditTransactionPlan({
      context,
      commandId: "format-inline",
      intent: "edit",
      edits: [{ from: cursor, to: cursor, insert: `${marker}${marker}` }],
      selection: { anchor: cursor + marker.length, head: cursor + marker.length }
    })
  };
}

type EnclosingInline = {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly openMarker: { readonly endOffset: number };
  readonly closeMarker: { readonly startOffset: number };
};

function findEnclosingInline(
  context: EditorSemanticContext,
  type: "strong" | "emphasis",
  from: number,
  to: number
): EnclosingInline | null {
  const inline = inlineRootAt(context);

  if (inline === undefined || inline === null) {
    return null;
  }

  return walkInline(inline.children as readonly InlineNode[], type, from, to);
}

function walkInline(
  children: readonly InlineNode[],
  type: "strong" | "emphasis",
  from: number,
  to: number
): EnclosingInline | null {
  for (const child of children) {
    if (!("children" in child) || !("openMarker" in child) || !("closeMarker" in child)) {
      continue;
    }

    const container = child as unknown as EnclosingInline & {
      readonly type: string;
      readonly children: readonly InlineNode[];
    };

    if (
      container.type === type &&
      container.openMarker.endOffset === from &&
      container.closeMarker.startOffset === to
    ) {
      return container;
    }

    const nested = walkInline(container.children, type, from, to);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

// The canonical inline AST for the selection comes from the deepest leaf on the line that has one.
function inlineRootAt(context: EditorSemanticContext): MarkdownLeafNode["inline"] | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  for (const node of [...lineContainerChain(context, line)].reverse()) {
    if ("inline" in node && node.inline !== undefined) {
      return node.inline;
    }
  }

  return null;
}

function selectedLines(context: EditorSemanticContext): readonly PhysicalLine[] {
  const fromLine = context.lineAt(context.selectionContext.from);
  const toLine = context.lineAt(context.selectionContext.to);

  if (fromLine === null || toLine === null) {
    return [];
  }

  return context.lines.lines.filter(
    (line) => line.lineNumber >= fromLine.lineNumber && line.lineNumber <= toLine.lineNumber
  );
}

function headingMarkerOf(context: EditorSemanticContext, line: PhysicalLine): string | null {
  const match = HEADING_LINE_PATTERN.exec(formatTargetTextOf(context, line));

  return match?.[2] ?? null;
}

// Formatting patterns read a line from after its quote prefixes, which is where block markers live.
function formatTargetTextOf(context: EditorSemanticContext, line: PhysicalLine): string {
  return context.source.slice(quotePrefixEnd(line), line.contentEndOffset);
}


// Selection after formatting keeps the same text selected across the inserted or removed markers.
function selectionFromEdits(
  context: EditorSemanticContext,
  edits: readonly TextEditOperation[]
): { readonly anchor: number; readonly head: number } {
  const selection = context.selectionContext;
  let shiftFrom = 0;
  let shiftTo = 0;

  for (const edit of edits) {
    const delta = edit.insert.length - (edit.to - edit.from);

    if (edit.from <= selection.from) {
      shiftFrom += delta;
    }

    if (edit.from < selection.to || (edit.from === edit.to && edit.from <= selection.to)) {
      shiftTo += delta;
    }
  }

  return {
    anchor: Math.max(0, selection.from + shiftFrom),
    head: Math.max(0, selection.to + shiftTo)
  };
}

export type { MarkdownNode };




