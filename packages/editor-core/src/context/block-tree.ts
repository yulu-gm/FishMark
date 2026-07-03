import type { ListBlock, MarkdownBlock } from "@fishmark/markdown-engine";

export type MarkdownBlockTreeEntry = {
  readonly block: MarkdownBlock;
  readonly parents: readonly MarkdownBlock[];
};

export function walkMarkdownBlocks(
  blocks: readonly MarkdownBlock[],
  parents: readonly MarkdownBlock[] = []
): MarkdownBlockTreeEntry[] {
  const entries: MarkdownBlockTreeEntry[] = [];

  for (const block of blocks) {
    entries.push({ block, parents });
    entries.push(...walkMarkdownBlocks(getChildBlocks(block), [...parents, block]));
  }

  return entries;
}

export function findBlocksByTypeDeep<TType extends MarkdownBlock["type"]>(
  blocks: readonly MarkdownBlock[],
  type: TType
): Array<Extract<MarkdownBlock, { type: TType }>> {
  return walkMarkdownBlocks(blocks)
    .map((entry) => entry.block)
    .filter((block): block is Extract<MarkdownBlock, { type: TType }> => block.type === type);
}

export function findBlockByStartOffsetDeep<TType extends MarkdownBlock["type"]>(
  blocks: readonly MarkdownBlock[],
  type: TType,
  startOffset: number | undefined
): Extract<MarkdownBlock, { type: TType }> | null {
  if (typeof startOffset !== "number") {
    return null;
  }

  return (
    findBlocksByTypeDeep(blocks, type).find((block) => block.startOffset === startOffset) ?? null
  );
}

function getChildBlocks(block: MarkdownBlock): readonly MarkdownBlock[] {
  if (block.type === "blockquote") {
    return block.innerBlocks ?? [];
  }

  if (block.type === "list") {
    return getListChildBlocks(block);
  }

  return [];
}

function getListChildBlocks(block: ListBlock): readonly MarkdownBlock[] {
  return block.items.flatMap((item) => item.children ?? []);
}
