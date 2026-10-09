import type { InlineASTNode, InlineRoot } from "@fishmark/markdown-engine";

function normalizeHiddenOpenMarkerAnchor(
  anchor: number,
  startOffset: number,
  endOffset: number,
  direction: number
): number | null {
  if (anchor < startOffset || anchor >= endOffset) {
    return null;
  }

  // Moving left into an open marker: jump before it
  if (direction < 0) {
    return startOffset;
  }

  return endOffset;
}

function normalizeHiddenCloseMarkerAnchor(
  anchor: number,
  startOffset: number,
  endOffset: number,
  direction: number
): number | null {
  if (anchor <= startOffset || anchor >= endOffset) {
    return null;
  }

  // Moving right into a close marker: jump past it
  if (direction > 0) {
    return endOffset;
  }

  return startOffset;
}

export function normalizeHiddenInlineAnchor(
  inline: InlineRoot | undefined,
  anchor: number,
  direction = 0
): number | null {
  if (!inline) {
    return null;
  }

  const normalizeNode = (node: InlineASTNode): number | null => {
    if (node.type === "text" || node.type === "hardBreak") return null;
    // Preserve open → child → close precedence for every canonical inline owner.
    if (node.type !== "root") {
      const open = normalizeHiddenOpenMarkerAnchor(anchor, node.openMarker.startOffset, node.openMarker.endOffset, direction);
      if (open !== null) return open;
    }
    if ("children" in node) for (const child of node.children) {
      const result = normalizeNode(child);
      if (result !== null) return result;
    }
    return node.type === "root" ? null :
      normalizeHiddenCloseMarkerAnchor(anchor, node.closeMarker.startOffset, node.closeMarker.endOffset, direction);
  };

  return normalizeNode(inline);
}

export function normalizeHiddenInlineSelectionAnchor(
  inline: InlineRoot | undefined,
  anchor: number,
  direction = 0
): number | null {
  let nextAnchor = anchor;
  const visitedAnchors = new Set<number>();

  while (!visitedAnchors.has(nextAnchor)) {
    visitedAnchors.add(nextAnchor);

    const normalizedAnchor = normalizeHiddenInlineAnchor(inline, nextAnchor, direction);

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
