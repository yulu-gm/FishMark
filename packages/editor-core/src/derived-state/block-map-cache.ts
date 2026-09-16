import type { BlockMap } from "@fishmark/markdown-engine";
import { createMarkdownDocumentCache } from "./markdown-document-cache";

export type ParseDocumentBlocks = (source: string) => BlockMap;

export type BlockMapCache = {
  read: (source: string) => BlockMap;
  clear: () => void;
};

export function createBlockMapCache(parseDocument: ParseDocumentBlocks): BlockMapCache {
  const documentCache = createMarkdownDocumentCache(parseDocument);

  return {
    read(source) {
      return documentCache.read(source);
    },
    clear() {
      documentCache.clear();
    }
  };
}


