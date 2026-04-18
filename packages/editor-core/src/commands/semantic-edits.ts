import type { ChangeSpec } from "@codemirror/state";

import type {
  InlineContainerNode,
  InlineEmphasis,
  InlineImage,
  InlineLink,
  InlineNode,
  InlineStrikethrough,
  InlineStrong
} from "@yulora/markdown-engine";

import type { SemanticContext } from "./semantic-context";

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
const BLOCKQUOTE_LINE_PATTERN = /^(\s{0,3})>[ \t]+(.*)$/;

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

  const allQuoted = lines.every((text) => BLOCKQUOTE_LINE_PATTERN.test(text));
  const rewritten = lines.map((text) => {
    if (allQuoted) {
      const match = BLOCKQUOTE_LINE_PATTERN.exec(text)!;
      return `${match[1] ?? ""}${match[2] ?? ""}`;
    }
    const indentMatch = INDENT_LINE_PATTERN.exec(text)!;
    const indent = indentMatch[1] ?? "";
    const rest = indentMatch[2] ?? "";
    return `${indent}> ${rest}`;
  });

  const insert = rewritten.join("\n");
  const isSingleLine = fromLine.number === toLine.number;

  if (isSingleLine) {
    return {
      changes: { from: fromLine.from, to: toLine.to, insert },
      selection: {
        anchor: ctx.selection.from + (allQuoted ? -2 : 2),
        head: ctx.selection.to + (allQuoted ? -2 : 2)
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
  if (!activeBlock || (activeBlock.type !== "heading" && activeBlock.type !== "paragraph")) {
    return null;
  }
  const inline = activeBlock.inline;
  if (!inline) return null;

  return walkChildren(inline.children, selection, type);
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
