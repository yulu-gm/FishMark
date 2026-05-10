import { Decoration, WidgetType } from "@codemirror/view";
import { type Range } from "@codemirror/state";

import type { InlineASTNode, InlineRoot } from "@fishmark/markdown-engine";
import { createInactiveImagePreviewDecoration } from "./image-widgets";

const CJK_TEXT_CLASS = "cm-fishmark-cjk-font";
const INACTIVE_INLINE_MARKER_CLASS = "cm-inactive-inline-marker";
const INACTIVE_INLINE_LINK_CLASS = "cm-inactive-inline-link";
export const INACTIVE_INLINE_LINK_SELECTOR = `.${INACTIVE_INLINE_LINK_CLASS}`;
export const INACTIVE_INLINE_LINK_HREF_ATTRIBUTE = "data-fishmark-link-href";
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

export function createActiveInlineDecorations(inline: InlineRoot | undefined): InlineDecorationRange[] {
  const ranges: InlineDecorationRange[] = [];

  if (!inline) {
    return ranges;
  }

  appendActiveInlineDecorations(inline, ranges);
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
    case "hardBreak":
      appendHardBreakDecoration(ranges, node.startOffset, node.endOffset);
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
      appendContentDecoration(
        ranges,
        node.openMarker.endOffset,
        node.closeMarker.startOffset,
        INACTIVE_INLINE_LINK_CLASS,
        {
          [INACTIVE_INLINE_LINK_HREF_ATTRIBUTE]: node.href ?? "",
          role: "link",
          title: node.title ?? node.href ?? ""
        }
      );
      for (const child of node.children) {
        appendInlineDecorations(child, ranges, options);
      }
      appendMarkerDecoration(ranges, node.closeMarker.startOffset, node.endOffset);
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

function appendActiveInlineDecorations(node: InlineASTNode, ranges: InlineDecorationRange[]) {
  switch (node.type) {
    case "root":
      for (const child of node.children) {
        appendActiveInlineDecorations(child, ranges);
      }
      return;
    case "text":
      appendCjkTextRanges(ranges, node.startOffset, node.value);
      return;
    case "hardBreak":
      appendActiveHardBreakDecoration(ranges, node.endOffset);
      return;
    case "codeSpan":
      appendContentDecoration(
        ranges,
        node.openMarker.endOffset,
        node.closeMarker.startOffset,
        INACTIVE_INLINE_CONTENT_CLASSES.codeSpan
      );
      return;
    case "strong":
    case "emphasis":
    case "strikethrough":
      appendContentDecoration(
        ranges,
        node.openMarker.endOffset,
        node.closeMarker.startOffset,
        INACTIVE_INLINE_CONTENT_CLASSES[node.type]
      );
      for (const child of node.children) {
        appendActiveInlineDecorations(child, ranges);
      }
      return;
    case "link":
      for (const child of node.children) {
        appendActiveInlineDecorations(child, ranges);
      }
      return;
    case "image":
      for (const child of node.children) {
        appendActiveInlineDecorations(child, ranges);
      }
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
    case "hardBreak":
      return;
    case "codeSpan":
      return;
  }
}

class HardBreakWidget extends WidgetType {
  override toDOM(): HTMLElement {
    return document.createElement("br");
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function appendHardBreakDecoration(
  ranges: InlineDecorationRange[],
  startOffset: number,
  endOffset: number
) {
  if (endOffset <= startOffset) {
    return;
  }

  ranges.push(
    Decoration.replace({
      widget: new HardBreakWidget()
    }).range(startOffset, endOffset)
  );
}

function appendActiveHardBreakDecoration(
  ranges: InlineDecorationRange[],
  offset: number
) {
  ranges.push(
    Decoration.widget({
      side: 1,
      widget: new HardBreakWidget()
    }).range(offset)
  );
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
  className: string,
  attributes: Record<string, string> = {}
) {
  if (endOffset <= startOffset) {
    return;
  }

  ranges.push(
    Decoration.mark({
      attributes: {
        ...attributes,
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
