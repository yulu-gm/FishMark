import type { ListBlock, ListItemBlock } from "@yulora/markdown-engine";

export function findListItemAtLineStart(block: ListBlock, lineStart: number): ListItemBlock | null {
  return findItemInScope(block.items, lineStart);
}

function findItemInScope(items: readonly ListItemBlock[], lineStart: number): ListItemBlock | null {
  for (const item of items) {
    if (item.startOffset === lineStart) {
      return item;
    }

    for (const child of item.children) {
      const found = findItemInScope(child.items, lineStart);

      if (found) {
        return found;
      }
    }
  }

  return null;
}
