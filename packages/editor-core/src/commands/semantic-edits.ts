import type { ChangeSpec } from "@codemirror/state";

import type {
  InlineContainerNode,
  InlineEmphasis,
  InlineImage,
  InlineLink,
  InlineNode,
  InlineRoot,
  InlineStrikethrough,
  InlineStrong
} from "@fishmark/markdown-engine";

import type { SemanticContext } from "./semantic-context";
import { parseBlockquoteLine } from "./line-parsers";

export type SemanticEdit = {
  changes: ChangeSpec;
  selection: { anchor: number; head: number };
};

export function computeStrongToggle(ctx: SemanticContext): SemanticEdit | null {
  return computeInlineToggle(ctx, { type: "strong", marker: "**" });
}

export function computeEmphasisToggle(ctx: SemanticContext): SemanticEdit | null {
  return computeInlineToggle(ctx, { type: "emphasis", marker: "*" });
}

const HEADING_LINE_PATTERN = /^(\s{0,3})(#{1,6})(?:\s+|$)(.*)$/;
const BULLET_LINE_PATTERN = /^(\s*)([*+-])(?:[ \t]+|$)(.*)$/;
const INDENT_LINE_PATTERN = /^(\s*)(.*)$/;

export function computeBulletListToggle(ctx: SemanticContext): SemanticEdit | null {
  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }

  const allBullet = lines.every((text) => BULLET_LINE_PATTERN.test(text));
  const rewritten = lines.map((text) => {
    if (allBullet) {
      const match = BULLET_LINE_PATTERN.exec(text)!;
      return `${match[1] ?? ""}${match[3] ?? ""}`;
    }
    const indentMatch = INDENT_LINE_PATTERN.exec(text)!;
    const indent = indentMatch[1] ?? "";
    const rest = indentMatch[2] ?? "";
    return `${indent}- ${rest}`;
  });

  const insert = rewritten.join("\n");
  const isSingleLine = fromLine.number === toLine.number;

  if (isSingleLine) {
    return {
      changes: { from: fromLine.from, to: toLine.to, insert },
      selection: {
        anchor: ctx.selection.from + (allBullet ? -2 : 2),
        head: ctx.selection.to + (allBullet ? -2 : 2)
      }
    };
  }

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: fromLine.from,
      head: fromLine.from + insert.length
    }
  };
}

export function computeBlockquoteToggle(ctx: SemanticContext): SemanticEdit | null {
  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }

  const isSingleLine = fromLine.number === toLine.number;
  const targetLines = lines.filter((text) => isSingleLine || text.trim().length > 0);
  const allQuoted =
    targetLines.length > 0 && targetLines.every((text) => parseBlockquoteLine(text) !== null);
  const lineEdits = lines.map((text) => {
    if (allQuoted) {
      return text.trim().length === 0 && !isSingleLine
        ? { text, edit: null }
        : removeOneBlockquoteLayer(text);
    }
    return addOneBlockquoteLayer(text);
  });
  const rewritten = lineEdits.map((lineEdit) => lineEdit.text);

  const insert = rewritten.join("\n");

  if (isSingleLine) {
    const lineEdit = lineEdits[0]!;
    return {
      changes: { from: fromLine.from, to: toLine.to, insert },
      selection: transformSelection(ctx.selection, fromLine.from, lineEdit.edit)
    };
  }

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: fromLine.from,
      head: fromLine.from + insert.length
    }
  };
}

type LinePrefixEdit = {
  from: number;
  to: number;
  insert: string;
};

function addOneBlockquoteLayer(text: string): { text: string; edit: LinePrefixEdit } {
  const indentMatch = INDENT_LINE_PATTERN.exec(text)!;
  const indent = indentMatch[1] ?? "";
  const insert = "> ";
  const insertAt = indent.length;

  return {
    text: `${text.slice(0, insertAt)}${insert}${text.slice(insertAt)}`,
    edit: {
      from: insertAt,
      to: insertAt,
      insert
    }
  };
}

function removeOneBlockquoteLayer(text: string): { text: string; edit: LinePrefixEdit | null } {
  const parsed = parseBlockquoteLine(text);
  if (!parsed) {
    return {
      text,
      edit: null
    };
  }

  const firstMarker = parsed.markers[0]!;
  const removeFrom = firstMarker.markerStart;
  const removeTo =
    text[firstMarker.markerEnd] === " " || text[firstMarker.markerEnd] === "\t"
      ? firstMarker.markerEnd + 1
      : firstMarker.markerEnd;

  return {
    text: `${text.slice(0, removeFrom)}${text.slice(removeTo)}`,
    edit: {
      from: removeFrom,
      to: removeTo,
      insert: ""
    }
  };
}

function transformSelection(
  selection: SemanticContext["selection"],
  lineFrom: number,
  edit: LinePrefixEdit | null
): { anchor: number; head: number } {
  if (!edit) {
    return {
      anchor: selection.from,
      head: selection.to
    };
  }

  return {
    anchor: lineFrom + transformLineOffset(selection.from - lineFrom, edit),
    head: lineFrom + transformLineOffset(selection.to - lineFrom, edit)
  };
}

function transformLineOffset(offset: number, edit: LinePrefixEdit): number {
  if (offset <= edit.from) {
    return offset;
  }

  if (offset >= edit.to) {
    return offset + edit.insert.length - (edit.to - edit.from);
  }

  return edit.from + edit.insert.length;
}

export function computeHeadingToggle(ctx: SemanticContext, level: number): SemanticEdit | null {
  if (level < 1 || level > 6) {
    return null;
  }

  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);
  const isSingleLine = fromLine.number === toLine.number;
  const targetMarker = "#".repeat(level);

  if (isSingleLine) {
    const text = fromLine.text;
    const match = HEADING_LINE_PATTERN.exec(text);
    if (match && match[2] === targetMarker) {
      const indent = match[1] ?? "";
      const headingPrefix = `${indent}${targetMarker}`;
      const stripLength = text.startsWith(`${headingPrefix} `)
        ? headingPrefix.length + 1
        : headingPrefix.length;
      const stripFrom = fromLine.from;
      const stripTo = fromLine.from + stripLength;
      const newCursor = Math.max(stripFrom, ctx.selection.from - stripLength);
      return {
        changes: { from: stripFrom, to: stripTo, insert: "" },
        selection: { anchor: newCursor, head: newCursor }
      };
    }
    if (match) {
      const indent = match[1] ?? "";
      const existingMarker = match[2] ?? "";
      const existingPrefix = `${indent}${existingMarker}`;
      const replaceLength = text.startsWith(`${existingPrefix} `)
        ? existingPrefix.length + 1
        : existingPrefix.length;
      const replaceFrom = fromLine.from;
      const replaceTo = fromLine.from + replaceLength;
      const insert = `${indent}${targetMarker} `;
      const delta = insert.length - replaceLength;
      return {
        changes: { from: replaceFrom, to: replaceTo, insert },
        selection: {
          anchor: ctx.selection.from + delta,
          head: ctx.selection.to + delta
        }
      };
    }
    const insert = `${targetMarker} `;
    return {
      changes: { from: fromLine.from, to: fromLine.from, insert },
      selection: {
        anchor: ctx.selection.from + insert.length,
        head: ctx.selection.to + insert.length
      }
    };
  }

  const lines: string[] = [];
  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(ctx.state.doc.line(lineNumber).text);
  }
  const allMatchTarget = lines.every((text) => {
    const match = HEADING_LINE_PATTERN.exec(text);
    return match !== null && match[2] === targetMarker;
  });
  const rewritten = lines.map((text) => {
    const match = HEADING_LINE_PATTERN.exec(text);
    if (allMatchTarget && match) {
      return `${match[1] ?? ""}${match[3] ?? ""}`;
    }
    if (match) {
      const indent = match[1] ?? "";
      const content = match[3] ?? "";
      return `${indent}${targetMarker} ${content}`;
    }
    return `${targetMarker} ${text}`;
  });
  const insert = rewritten.join("\n");
  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: fromLine.from,
      head: fromLine.from + insert.length
    }
  };
}

type InlineToggleSpec = {
  type: "strong" | "emphasis";
  marker: "**" | "*";
};

function computeInlineToggle(ctx: SemanticContext, spec: InlineToggleSpec): SemanticEdit | null {
  const markerLength = spec.marker.length;

  if (!ctx.selection.empty) {
    const enclosing = findEnclosingContainer(ctx.activeState.activeBlock, ctx.selection, spec.type);
    if (enclosing) {
      const innerFrom = enclosing.openMarker.endOffset;
      const innerTo = enclosing.closeMarker.startOffset;
      const inner = ctx.source.slice(innerFrom, innerTo);

      return {
        changes: { from: enclosing.startOffset, to: enclosing.endOffset, insert: inner },
        selection: {
          anchor: ctx.selection.from - markerLength,
          head: ctx.selection.to - markerLength
        }
      };
    }

    const slice = ctx.source.slice(ctx.selection.from, ctx.selection.to);
    return {
      changes: {
        from: ctx.selection.from,
        to: ctx.selection.to,
        insert: `${spec.marker}${slice}${spec.marker}`
      },
      selection: {
        anchor: ctx.selection.from + markerLength,
        head: ctx.selection.to + markerLength
      }
    };
  }

  const emptyPair = findEnclosingEmptyPair(ctx, spec);
  if (emptyPair) {
    return {
      changes: { from: emptyPair.from, to: emptyPair.to, insert: "" },
      selection: { anchor: emptyPair.from, head: emptyPair.from }
    };
  }

  const cursor = ctx.selection.from;
  return {
    changes: { from: cursor, to: cursor, insert: `${spec.marker}${spec.marker}` },
    selection: { anchor: cursor + markerLength, head: cursor + markerLength }
  };
}

function findEnclosingContainer(
  activeBlock: SemanticContext["activeState"]["activeBlock"],
  selection: SemanticContext["selection"],
  type: "strong" | "emphasis"
): InlineContainerNode | null {
  if (!activeBlock) {
    return null;
  }

  const inlineRoots = collectInlineRoots(activeBlock, selection);

  for (const inline of inlineRoots) {
    const enclosing = walkChildren(inline.children, selection, type);
    if (enclosing) {
      return enclosing;
    }
  }

  return null;
}

function collectInlineRoots(
  activeBlock: NonNullable<SemanticContext["activeState"]["activeBlock"]>,
  selection: SemanticContext["selection"]
): InlineRoot[] {
  if (activeBlock.type === "heading" || activeBlock.type === "paragraph") {
    return activeBlock.inline ? [activeBlock.inline] : [];
  }

  if (activeBlock.type === "list") {
    return activeBlock.items
      .filter(
        (item) =>
          item.inline &&
          typeof item.contentStartOffset === "number" &&
          typeof item.contentEndOffset === "number" &&
          selection.from >= item.contentStartOffset &&
          selection.to <= item.contentEndOffset
      )
      .map((item) => item.inline!);
  }

  if (activeBlock.type === "blockquote") {
    return (activeBlock.lines ?? [])
      .filter(
        (line) =>
          selection.from >= line.contentStartOffset &&
          selection.to <= line.contentEndOffset
      )
      .map((line) => line.inline);
  }

  return [];
}

function walkChildren(
  children: readonly InlineNode[],
  selection: SemanticContext["selection"],
  type: "strong" | "emphasis"
): InlineContainerNode | null {
  for (const child of children) {
    if (!isInlineContainer(child)) continue;
    if (
      child.type === type &&
      child.openMarker.endOffset === selection.from &&
      child.closeMarker.startOffset === selection.to
    ) {
      return child;
    }
    const nested = walkChildren(child.children, selection, type);
    if (nested) return nested;
  }
  return null;
}

type ConcreteInlineContainer =
  | InlineStrong
  | InlineEmphasis
  | InlineStrikethrough
  | InlineLink
  | InlineImage;

function isInlineContainer(node: InlineNode): node is ConcreteInlineContainer {
  return (
    node.type === "strong" ||
    node.type === "emphasis" ||
    node.type === "strikethrough" ||
    node.type === "link" ||
    node.type === "image"
  );
}

function findEnclosingEmptyPair(
  ctx: SemanticContext,
  spec: InlineToggleSpec
): { from: number; to: number } | null {
  const cursor = ctx.selection.from;
  const markerLength = spec.marker.length;
  const left = ctx.source.slice(Math.max(0, cursor - markerLength), cursor);
  const right = ctx.source.slice(cursor, cursor + markerLength);

  if (left === spec.marker && right === spec.marker) {
    return { from: cursor - markerLength, to: cursor + markerLength };
  }

  return null;
}

export function computeCodeFenceToggle(ctx: SemanticContext): SemanticEdit | null {
  const activeBlock = ctx.activeState.activeBlock;
  if (activeBlock?.type === "codeFence") {
    return unwrapCodeFence(ctx, activeBlock);
  }

  if (ctx.selection.empty) {
    const cursor = ctx.selection.from;
    const insert = "```\n\n```";
    return {
      changes: { from: cursor, to: cursor, insert },
      selection: { anchor: cursor + 4, head: cursor + 4 }
    };
  }

  const fromLine = ctx.state.doc.lineAt(ctx.selection.from);
  const toLine = ctx.state.doc.lineAt(ctx.selection.to);
  const inner = ctx.source.slice(fromLine.from, toLine.to);
  const insert = `\`\`\`\n${inner}\n\`\`\``;

  return {
    changes: { from: fromLine.from, to: toLine.to, insert },
    selection: {
      anchor: fromLine.from + 4,
      head: fromLine.from + 4 + inner.length
    }
  };
}

function unwrapCodeFence(
  ctx: SemanticContext,
  block: Extract<SemanticContext["activeState"]["activeBlock"], { type: "codeFence" }>
): SemanticEdit | null {
  const blockSource = ctx.source.slice(block.startOffset, block.endOffset);
  const lines = blockSource.split("\n");
  if (lines.length < 2) {
    return null;
  }

  const inner = lines.slice(1, lines.length - 1).join("\n");
  return {
    changes: { from: block.startOffset, to: block.endOffset, insert: inner },
    selection: { anchor: block.startOffset, head: block.startOffset + inner.length }
  };
}
