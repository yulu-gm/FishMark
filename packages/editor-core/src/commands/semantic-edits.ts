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
