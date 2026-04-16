import type { BlockMap } from "@yulora/markdown-engine";

export type ParseBlockMap = (source: string) => BlockMap;

export type BlockMapCache = {
  read: (source: string) => BlockMap;
  clear: () => void;
};

export function createBlockMapCache(parseBlockMap: ParseBlockMap): BlockMapCache {
  let cachedSource: string | null = null;
  let cachedBlockMap: BlockMap | null = null;

  return {
    read(source) {
      if (cachedBlockMap && cachedSource === source) {
        return cachedBlockMap;
      }

      cachedSource = source;
      cachedBlockMap = parseBlockMap(source);

      return cachedBlockMap;
    },
    clear() {
      cachedSource = null;
      cachedBlockMap = null;
    }
  };
}
