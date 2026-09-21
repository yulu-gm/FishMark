// The editor performance counter contract. These counters are derived from the adapter-owned
// canonical document structure cache and its observer, so the contract lives beside that cache
// rather than in a consumer package. This module stays dependency-free on purpose: it must be
// importable by any layer that reports cache evidence without dragging CodeMirror, React, or
// another FishMark package into that layer.

export const INCREMENTAL_STRUCTURE_CACHE_REASON =
  "consumer-does-not-use-incremental-structure-cache" as const;

export type EditorPerformanceCounters = {
  // Actual full-source scanner events (reference-definition pass and full tree parse), not the
  // number of top-level rich-document calls. Includes candidate transactions from filters.
  fullParse: number;
  // Successful bounded incremental windows, as reported by the canonical cache.
  incrementalParseWindow: number;
  // State-field updates that reused the unchanged canonical cache, including effects.
  cacheHit: number;
  // Sum of nodes the cache reports rebuilt. This is work, not a count of distinct final nodes.
  invalidatedNodes: number;
  decorationRebuild: number;
};

export type EditorPerformanceParserEntries = {
  parseMarkdownDocument: number;
  parseOrderedListNormalization: number;
};
