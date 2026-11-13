import { parseInlineAst, type InlineNode, type MarkdownLeafNode, type MarkdownNode } from "@fishmark/markdown-engine";
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
  const lines = selectedLines(context);

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
    const indentLength = match?.[1]?.length ?? /^[ \t]*/u.exec(text)![0].length;

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
        insert: context.source[marker.range.startOffset - 1] === ">" ? " " : ""
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
  type: ToggleStyle,
  marker: string
): FormattingDecision | null {
  const selection = context.selectionContext;

  if (!selection.empty) {
    const root = inlineRootAt(context);
    const affected = root && selection.from >= root.startOffset && selection.to <= root.endOffset
      ? root.children.filter(isInlineStyle).filter(node => node.startOffset < selection.to && node.endOffset > selection.from)
      : [];
    if (root && affected.length) {
      return rewriteInlineSelection(context, type, marker, root, affected[0]!, affected[affected.length - 1]!);
    }

    // 没有切到同一行内树的格式节点时，保留普通包裹行为（含跨段、链接文字和代码选区）。
    const text = context.source.slice(selection.from, selection.to);
    const leading = text.length - text.trimStart().length;
    const trailing = text.length - text.trimEnd().length;
    if (leading === text.length) return null;
    const from = selection.from + leading;
    const to = selection.to - trailing;
    return inlineDecision(context, type, { from, to, insert: marker + context.source.slice(from, to) + marker },
      selection.from + (leading ? 0 : marker.length), selection.to + marker.length * (trailing ? 2 : 1));
  }

  const cursor = selection.from;
  if (context.source.slice(cursor - marker.length, cursor) === marker && context.source.slice(cursor, cursor + marker.length) === marker) {
    const anchor = cursor - marker.length;
    return { kind: type, plan: createEditTransactionPlan({ context, commandId: "format-inline", intent: "edit",
      edits: [{ from: anchor, to: cursor + marker.length, insert: "" }], selection: { anchor, head: anchor } }) };
  }

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

type InlineStyle = Extract<InlineNode, { type: "strong" | "emphasis" | "strikethrough" }>;
type InlineStyleKind = InlineStyle["type"];
type ToggleStyle = Exclude<InlineStyleKind, "strikethrough">;
type StyleMarker = { type: InlineStyleKind; open: string; close: string };
type InlinePiece = {
  from: number;
  to: number;
  styles: readonly StyleMarker[];
  // 非格式节点当作一个整体：不能把链接目标或行内代码当成普通文字拆开。
  atom?: InlineNode["type"];
};

function isInlineStyle(node: InlineNode): node is InlineStyle {
  return node.type === "strong" || node.type === "emphasis" || node.type === "strikethrough";
}

function inlinePieces(
  source: string, from: number, to: number, nodes: readonly InlineNode[], styles: readonly StyleMarker[] = []
): InlinePiece[] {
  const pieces: InlinePiece[] = [];
  let cursor = from;
  for (const node of nodes) {
    if (cursor < node.startOffset) pieces.push({ from: cursor, to: node.startOffset, styles });
    if (isInlineStyle(node)) {
      const style = {
        type: node.type,
        open: source.slice(node.openMarker.startOffset, node.openMarker.endOffset),
        close: source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset)
      };
      pieces.push(...inlinePieces(source, node.openMarker.endOffset, node.closeMarker.startOffset, node.children, [...styles, style]));
    } else {
      pieces.push({ from: node.startOffset, to: node.endOffset, styles,
        ...(node.type === "text" ? {} : { atom: node.type }) });
    }
    cursor = node.endOffset;
  }
  if (cursor < to) pieces.push({ from: cursor, to, styles });
  return pieces;
}

function rewriteInlineSelection(
  context: EditorSemanticContext, type: ToggleStyle, marker: string,
  root: NonNullable<MarkdownLeafNode["inline"]>, first: InlineStyle, last: InlineStyle
): FormattingDecision | null {
  const { source, selectionContext: selection } = context;
  const from = Math.min(selection.from, first.startOffset);
  const to = Math.max(selection.to, last.endOffset);
  const original = inlinePieces(source, root.startOffset, root.endOffset, root.children);
  const bounds = [selection.from, selection.to];
  if (original.some(piece => piece.atom && bounds.some(offset => piece.from < offset && offset < piece.to))) return null;

  const pieces = original.flatMap(piece => {
    const edges = [piece.from, ...bounds.filter(offset => offset > piece.from && offset < piece.to), piece.to];
    return edges.slice(1).map((end, index) => ({ ...piece, from: edges[index]!, to: end }));
  });
  const selected = (piece: InlinePiece) => piece.from >= selection.from && piece.to <= selection.to;
  const meaningful = pieces.filter(piece => selected(piece) && (piece.atom || /\S/u.test(source.slice(piece.from, piece.to))));
  if (!meaningful.length) return null;
  const hasStyle = (piece: InlinePiece) => piece.styles.some(style => style.type === type);
  const remove = meaningful.every(hasStyle);
  const within = (piece: InlinePiece) => piece.from >= from && piece.to <= to;
  const patch = pieces.filter(within);
  const shared = patch.flatMap(piece => piece.styles).find(style => style.type === type) ?? { type, open: marker, close: marker };
  const visible = inlineText(root.children, source);
  const tried = new Set<string>();

  // 先按原有嵌套顺序写标记；遇到连续星号不能正确闭合时，再尝试把目标样式移入或移出一层。
  for (const [order, alternate] of [
    ["original", false], ["inner", false], ["outer", false],
    ["original", true], ["inner", true], ["outer", true]
  ] as const) {
    const changed = patch.map(piece => {
      const index = piece.styles.findIndex(style => style.type === type);
      const other = piece.styles.filter(style => style.type !== type);
      if (remove ? index < 0 || selected(piece) : index < 0 && !selected(piece)) return { ...piece, styles: other };
      const target = index < 0 ? shared : piece.styles[index]!;
      const depth = order === "outer" ? 0 : order === "inner" || index < 0 ? other.length : index;
      return { ...piece, styles: [...other.slice(0, depth), target, ...other.slice(depth)] };
    });
    const written = writeInlinePieces(source, changed, selected, alternate ? type : null);
    if (written.start === undefined || written.end === undefined || tried.has(written.text)) continue;
    tried.add(written.text);
    const fragment = source.slice(root.startOffset, from) + written.text + source.slice(to, root.endOffset);
    const parsed = parseInlineAst(fragment, 0, fragment.length);
    // 标记能否闭合取决于前后文。只验证这个行内范围，防止插入字面星号或改坏其它样式。
    const expected = [...pieces.filter(piece => piece.to <= from), ...changed, ...pieces.filter(piece => piece.from >= to)];
    if (inlineText(parsed.children, fragment) !== visible ||
        !sameInlinePieces(expected, source, inlinePieces(fragment, 0, fragment.length, parsed.children), fragment)) continue;
    return inlineDecision(context, type, { from, to, insert: written.text }, from + written.start, from + written.end);
  }
  return null;
}

function writeInlinePieces(
  source: string, pieces: readonly InlinePiece[], selected: (piece: InlinePiece) => boolean, alternate: InlineStyleKind | null
): { text: string; start?: number; end?: number } {
  // Markdown 标记不能紧贴内部空白。把样式变化点的空白留在两侧共有的样式中。
  const runs = pieces.flatMap(piece => {
    if (piece.atom) return [piece];
    return Array.from(source.slice(piece.from, piece.to).matchAll(/\s+|\S+/gu), match =>
      ({ ...piece, from: piece.from + match.index, to: piece.from + match.index + match[0].length }));
  });
  const isSpace = (piece: InlinePiece) => !piece.atom && /^\s+$/u.test(source.slice(piece.from, piece.to));
  for (let i = 0; i < runs.length;) {
    if (!isSpace(runs[i]!)) { i += 1; continue; }
    let end = i + 1;
    while (end < runs.length && isSpace(runs[end]!)) end += 1;
    const left = runs[i - 1]?.styles ?? [];
    const right = runs[end]?.styles ?? [];
    const common = left.slice(0, commonStyleDepth(left, right));
    for (; i < end; i += 1) runs[i] = { ...runs[i]!, styles: common };
  }

  let text = "";
  let start: number | undefined;
  let end: number | undefined;
  let active: readonly StyleMarker[] = [];
  const spelling = (style: StyleMarker, side: "open" | "close") => style.type === alternate
    ? (style[side].startsWith("_") ? "*" : "_").repeat(style[side].length) : style[side];
  for (const piece of runs) {
    const depth = commonStyleDepth(active, piece.styles);
    for (let i = active.length - 1; i >= depth; i -= 1) text += spelling(active[i]!, "close");
    for (const style of piece.styles.slice(depth)) text += spelling(style, "open");
    if (selected(piece)) start ??= text.length;
    text += source.slice(piece.from, piece.to);
    if (selected(piece)) end = text.length;
    active = piece.styles;
  }
  for (let i = active.length - 1; i >= 0; i -= 1) text += spelling(active[i]!, "close");
  return { text, ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

function commonStyleDepth(left: readonly StyleMarker[], right: readonly StyleMarker[]): number {
  let depth = 0;
  while (depth < left.length && left[depth] === right[depth]) depth += 1;
  return depth;
}

function inlineText(nodes: readonly InlineNode[], source: string): string {
  return nodes.map(node => isInlineStyle(node) ? inlineText(node.children, source) :
    node.type === "text" ? node.value : source.slice(node.startOffset, node.endOffset)).join("");
}

function sameInlinePieces(
  expected: readonly InlinePiece[], source: string, actual: readonly InlinePiece[], fragment: string
): boolean {
  const signature = (pieces: readonly InlinePiece[], text: string) => {
    const parts: { key: string; text: string }[] = [];
    for (const piece of pieces) {
      const kinds = [...new Set(piece.styles.map(style => style.type))].sort().join(",");
      const raw = text.slice(piece.from, piece.to);
      const chunks = piece.atom ? [raw] : raw.match(/\s+|\S+/gu) ?? [];
      for (const chunk of chunks) {
        const key = piece.atom ? `atom:${piece.atom}:${kinds}` : /^\s+$/u.test(chunk) ? "" : kinds;
        const previous = parts.at(-1);
        if (!piece.atom && previous?.key === key) previous.text += chunk;
        else parts.push({ key, text: chunk });
      }
    }
    return parts;
  };
  const left = signature(expected, source), right = signature(actual, fragment);
  return left.length === right.length && left.every((part, index) =>
    part.key === right[index]?.key && part.text === right[index]?.text);
}

function inlineDecision(
  context: EditorSemanticContext, kind: ToggleStyle, edit: TextEditOperation, from: number, to: number
): FormattingDecision {
  // 只派发真正不同的源码；原样保留共同前后缀，也保留 anchor/head 的方向。
  let { from: start, to: end, insert } = edit;
  let prefix = 0;
  while (start + prefix < end && prefix < insert.length && context.source[start + prefix] === insert[prefix]) prefix += 1;
  let suffix = 0;
  while (end - suffix > start + prefix && insert.length - suffix > prefix &&
      context.source[end - suffix - 1] === insert[insert.length - suffix - 1]) suffix += 1;
  start += prefix;
  end -= suffix;
  insert = insert.slice(prefix, insert.length - suffix);
  const backwards = context.selectionContext.selection.anchor > context.selectionContext.selection.head;
  return { kind, plan: createEditTransactionPlan({ context, commandId: "format-inline", intent: "edit",
    edits: [{ from: start, to: end, insert }],
    selection: backwards ? { anchor: to, head: from } : { anchor: from, head: to } }) };
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

    if (edit.from < selection.from || (selection.empty && edit.from <= selection.from)) {
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




