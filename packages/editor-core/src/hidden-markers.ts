import type { InlineASTNode, InlineRoot } from "@yulora/markdown-engine";

function normalizeHiddenOpenMarkerAnchor(
  anchor: number,
  startOffset: number,
  endOffset: number
): number | null {
  if (anchor < startOffset || anchor >= endOffset) {
    return null;
  }

  return endOffset;
}

function normalizeHiddenCloseMarkerAnchor(
  anchor: number,
  startOffset: number,
  endOffset: number
): number | null {
  if (anchor <= startOffset || anchor > endOffset) {
    return null;
  }

  return startOffset;
}

export function normalizeHiddenInlineAnchor(
  inline: InlineRoot | undefined,
  anchor: number
): number | null {
  if (!inline) {
    return null;
  }

  const normalizeNode = (node: InlineASTNode): number | null => {
    switch (node.type) {
      case "root":
        for (const child of node.children) {
          const nextAnchor = normalizeNode(child);

          if (nextAnchor !== null) {
            return nextAnchor;
          }
        }
        return null;
      case "text":
        return null;
      case "codeSpan":
        return (
          normalizeHiddenOpenMarkerAnchor(anchor, node.openMarker.startOffset, node.openMarker.endOffset) ??
          normalizeHiddenCloseMarkerAnchor(anchor, node.closeMarker.startOffset, node.closeMarker.endOffset)
        );
      case "strong":
      case "emphasis":
      case "strikethrough":
      case "link":
      case "image": {
        const openAnchor = normalizeHiddenOpenMarkerAnchor(
          anchor,
          node.openMarker.startOffset,
          node.openMarker.endOffset
        );

        if (openAnchor !== null) {
          return openAnchor;
        }

        for (const child of node.children) {
          const childAnchor = normalizeNode(child);

          if (childAnchor !== null) {
            return childAnchor;
          }
        }

        return normalizeHiddenCloseMarkerAnchor(
          anchor,
          node.closeMarker.startOffset,
          node.closeMarker.endOffset
        );
      }
    }
  };

  return normalizeNode(inline);
}

export function normalizeHiddenInlineSelectionAnchor(
  inline: InlineRoot | undefined,
  anchor: number
): number | null {
  let nextAnchor = anchor;
  const visitedAnchors = new Set<number>();

  while (!visitedAnchors.has(nextAnchor)) {
    visitedAnchors.add(nextAnchor);

    const normalizedAnchor = normalizeHiddenInlineAnchor(inline, nextAnchor);

    if (normalizedAnchor === null || normalizedAnchor === nextAnchor) {
      return nextAnchor === anchor ? null : nextAnchor;
    }

    nextAnchor = normalizedAnchor;
  }

  return nextAnchor === anchor ? null : nextAnchor;
}

export function resolveVisibleInlineStartAnchor(
  anchor: number,
  inline: InlineRoot | undefined
): number {
  return normalizeHiddenInlineSelectionAnchor(inline, anchor) ?? anchor;
}
