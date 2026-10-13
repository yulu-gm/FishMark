export type CachedCodeHighlightRange = {
  readonly from: number;
  readonly to: number;
  readonly className: string;
};

export type CodeHighlightCacheStats = {
  entries: number;
  hits: number;
  misses: number;
  parserRuns: number;
  skippedLongBlocks: number;
  evictions: number;
  retainedTextCodeUnits: number;
  retainedRanges: number;
};

export const CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT = 20_000;
// Retain the relative tokens of ordinary mixed documents without allowing a few
// large/high-token blocks (or repeated document replacements) to grow the cache.
// These are cache capacities, not changes to synchronous work/performance budgets.
export const CODE_HIGHLIGHT_CACHE_LIMITS = Object.freeze({
  entries: 2048,
  textCodeUnits: 1_048_576,
  ranges: 65_536
});

type CacheEntry = { ranges: readonly CachedCodeHighlightRange[]; textCodeUnits: number };
const cache = new Map<string, CacheEntry>();
let retainedTextCodeUnits = 0;
let retainedRanges = 0;
const stats = { hits: 0, misses: 0, parserRuns: 0, skippedLongBlocks: 0, evictions: 0 };

export function createCodeHighlightCacheKey(languageKey: string, code: string): string {
  // Exact language/content identity: a hash collision must never reuse tokens.
  // Only code content and relative tokens are kept, never widgets or document offsets.
  return `${languageKey.length}:${languageKey}:${code}`;
}

export function readCodeHighlightCache(key: string): readonly CachedCodeHighlightRange[] | null {
  const entry = cache.get(key);
  if (!entry) {
    stats.misses += 1;
    return null;
  }
  stats.hits += 1;
  cache.delete(key);
  cache.set(key, entry);
  return entry.ranges;
}

function removeEntry(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  retainedTextCodeUnits -= entry.textCodeUnits;
  retainedRanges -= entry.ranges.length;
  cache.delete(key);
}

export function writeCodeHighlightCache(key: string, ranges: readonly CachedCodeHighlightRange[]): void {
  const textCodeUnits = key.length + ranges.reduce((size, range) => size + range.className.length, 0);
  removeEntry(key);
  if (textCodeUnits > CODE_HIGHLIGHT_CACHE_LIMITS.textCodeUnits ||
    ranges.length > CODE_HIGHLIGHT_CACHE_LIMITS.ranges) return;

  while (cache.size >= CODE_HIGHLIGHT_CACHE_LIMITS.entries ||
    retainedTextCodeUnits + textCodeUnits > CODE_HIGHLIGHT_CACHE_LIMITS.textCodeUnits ||
    retainedRanges + ranges.length > CODE_HIGHLIGHT_CACHE_LIMITS.ranges) {
    removeEntry(cache.keys().next().value!);
    stats.evictions += 1;
  }
  cache.set(key, {
    ranges: Object.freeze(ranges.map(range => Object.freeze({ ...range }))),
    textCodeUnits
  });
  retainedTextCodeUnits += textCodeUnits;
  retainedRanges += ranges.length;
}

export function recordCodeHighlightParserRun(): void { stats.parserRuns += 1; }
export function recordCodeHighlightSkippedLongBlock(): void { stats.skippedLongBlocks += 1; }

export function clearCodeHighlightCache(): void {
  cache.clear();
  retainedTextCodeUnits = 0;
  retainedRanges = 0;
  stats.hits = 0;
  stats.misses = 0;
  stats.parserRuns = 0;
  stats.skippedLongBlocks = 0;
  stats.evictions = 0;
}

export function getCodeHighlightCacheStats(): CodeHighlightCacheStats {
  return { entries: cache.size, ...stats, retainedTextCodeUnits, retainedRanges };
}
