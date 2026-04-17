import { Decoration } from "@codemirror/view";
import { type Range } from "@codemirror/state";

import type { InlineASTNode, InlineRoot } from "@yulora/markdown-engine";
import { createInactiveImagePreviewDecoration } from "./image-widgets";

const CJK_TEXT_CLASS = "cm-yulora-cjk-font";
const INACTIVE_INLINE_MARKER_CLASS = "cm-inactive-inline-marker";
const INACTIVE_INLINE_CONTENT_CLASSES = {
  strong: "cm-inactive-inline-strong",
  emphasis: "cm-inactive-inline-emphasis",
  codeSpan: "cm-inactive-inline-code",
  strikethrough: "cm-inactive-inline-strikethrough"
} as const;

type InlineDecorationRange = Range<Decoration>;

type CreateInactiveInlineDecorationsOptions = {
  resolveImagePreviewUrl?: (href: string | null) => string | null;
};

export function createInactiveInlineDecorations(
  inline: InlineRoot | undefined,
  options: CreateInactiveInlineDecorationsOptions = {}
): InlineDecorationRange[] {
  const ranges: InlineDecorationRange[] = [];

  if (!inline) {
    return ranges;
  }

  appendInlineDecorations(inline, ranges, options);
  return ranges;
}

export function createCjkTextDecorations(inline: InlineRoot | undefined): InlineDecorationRange[] {
  const ranges: InlineDecorationRange[] = [];

  if (!inline) {
    return ranges;
  }

  appendCjkTextDecorations(inline, ranges);
  return ranges;
}

function appendInlineDecorations(
  node: InlineASTNode,
  ranges: InlineDecorationRange[],
  options: CreateInactiveInlineDecorationsOptions
) {
  switch (node.type) {
    case "root":
      for (const child of node.children) {
        appendInlineDecorations(child, ranges, options);
      }
      return;
    case "text":
      appendCjkTextRanges(ranges, node.startOffset, node.value);
      return;
    case "codeSpan":
      appendMarkerDecoration(ranges, node.openMarker.startOffset, node.openMarker.endOffset);
      appendContentDecoration(
        ranges,
        node.openMarker.endOffset,
        node.closeMarker.startOffset,
        INACTIVE_INLINE_CONTENT_CLASSES.codeSpan
      );
      appendMarkerDecoration(ranges, node.closeMarker.startOffset, node.closeMarker.endOffset);
      return;
    case "strong":
    case "emphasis":
    case "strikethrough":
      appendMarkerDecoration(ranges, node.openMarker.startOffset, node.openMarker.endOffset);
      appendContentDecoration(
        ranges,
        node.openMarker.endOffset,
        node.closeMarker.startOffset,
        INACTIVE_INLINE_CONTENT_CLASSES[node.type]
      );
      for (const child of node.children) {
        appendInlineDecorations(child, ranges, options);
      }
      appendMarkerDecoration(ranges, node.closeMarker.startOffset, node.closeMarker.endOffset);
      return;
    case "link":
      appendMarkerDecoration(ranges, node.openMarker.startOffset, node.openMarker.endOffset);
      for (const child of node.children) {
        appendInlineDecorations(child, ranges, options);
      }
      appendMarkerDecoration(ranges, node.closeMarker.startOffset, node.closeMarker.endOffset);
      return;
    case "image":
      ranges.push(createInactiveImagePreviewDecoration(node, options.resolveImagePreviewUrl));
      appendMarkerDecoration(ranges, node.openMarker.startOffset, node.openMarker.endOffset);
      for (const child of node.children) {
        appendInlineDecorations(child, ranges, options);
      }
      appendMarkerDecoration(ranges, node.closeMarker.startOffset, node.closeMarker.endOffset);
      return;
  }
}

function appendCjkTextDecorations(node: InlineASTNode, ranges: InlineDecorationRange[]) {
  switch (node.type) {
    case "root":
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      for (const child of node.children) {
        appendCjkTextDecorations(child, ranges);
      }
      return;
    case "text":
      appendCjkTextRanges(ranges, node.startOffset, node.value);
      return;
    case "codeSpan":
      return;
  }
}

function appendMarkerDecoration(
  ranges: InlineDecorationRange[],
  startOffset: number,
  endOffset: number
) {
  if (endOffset <= startOffset) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        class: INACTIVE_INLINE_MARKER_CLASS
      }
    }).range(startOffset, endOffset)
  );
}

function appendContentDecoration(
  ranges: InlineDecorationRange[],
  startOffset: number,
  endOffset: number,
  className: string
) {
  if (endOffset <= startOffset) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        class: className
      }
    }).range(startOffset, endOffset)
  );
}

function appendCjkTextRanges(
  ranges: InlineDecorationRange[],
  startOffset: number,
  value: string
) {
  const matches = value.matchAll(/[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]+/gu);

  for (const match of matches) {
    if (typeof match.index !== "number" || match[0].length === 0) {
      continue;
    }

    const from = startOffset + match.index;
    const to = from + match[0].length;

    ranges.push(
      Decoration.mark({
        attributes: {
          class: CJK_TEXT_CLASS
        }
      }).range(from, to)
    );
  }
}
