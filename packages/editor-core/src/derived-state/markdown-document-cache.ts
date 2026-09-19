import { createMarkdownDocumentFromTree, type MarkdownDocument, type MarkdownDocumentTree } from "@fishmark/markdown-engine";

export type ParseMarkdownDocument = (source: string) => MarkdownDocument;

export type MarkdownDocumentCache = {
  read: (source: string) => MarkdownDocument;
  readTree: (tree: MarkdownDocumentTree) => MarkdownDocument;
  clear: () => void;
};

export function createMarkdownDocumentCache(
  parseMarkdownDocument: ParseMarkdownDocument
): MarkdownDocumentCache {
  let cachedSource: string | null = null;
  let cachedDocument: MarkdownDocument | null = null;

  return {
    readTree(tree) {
      if (cachedDocument && cachedSource === tree.source) return cachedDocument;
      cachedSource = tree.source;
      cachedDocument = createMarkdownDocumentFromTree(tree);
      return cachedDocument;
    },
    read(source) {
      if (cachedDocument && cachedSource === source) {
        return cachedDocument;
      }

      cachedSource = source;
      cachedDocument = parseMarkdownDocument(source);

      return cachedDocument;
    },
    clear() {
      cachedSource = null;
      cachedDocument = null;
    }
  };
}
