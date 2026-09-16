import { parseFullDocumentTree } from "../parse/full-document-parser";
import type { MarkdownDocumentTree } from "../model/document-tree";

// A cache holds one source revision and its parsed tree. Revisions are monotonic so callers can
// tell whether derived data still matches the tree they were computed from.
export interface DocumentStructureCache {
  readonly revision: number;
  readonly source: string;
  readonly tree: MarkdownDocumentTree;
}

export function createDocumentStructureCache(source: string): DocumentStructureCache {
  return Object.freeze({
    revision: 1,
    source,
    tree: parseFullDocumentTree(source)
  });
}

export function createDocumentStructureCacheFromTree(
  revision: number,
  source: string,
  tree: MarkdownDocumentTree
): DocumentStructureCache {
  return Object.freeze({ revision, source, tree });
}
