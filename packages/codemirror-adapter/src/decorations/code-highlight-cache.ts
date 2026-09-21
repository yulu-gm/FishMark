export type CachedCodeHighlightRange = {
  from: number;
  to: number;
  className: string;
};

export type CodeHighlightCacheStats = {
  entries: number;
  hits: number;
  misses: number;
  parserRuns: number;
  skippedLongBlocks: number;
  evictions: number;
};

export const CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT = 20_000;
const CODE_HIGHLIGHT_CACHE_MAX_ENTRIES = 128;

const cache = new Map<string, readonly CachedCodeHighlightRange[]>();
const stats = {
  hits: 0,
  misses: 0,
  parserRuns: 0,
  skippedLongBlocks: 0,
  evictions: 0
};

export function createCodeHighlightCacheKey(languageKey: string, code: string): string {
  return `${languageKey}:${code.length}:${hashCodeContent(code)}`;
}

export function readCodeHighlightCache(key: string): readonly CachedCodeHighlightRange[] | null {
  const cachedRanges = cache.get(key);

  if (!cachedRanges) {
    stats.misses += 1;
    return null;
  }

  stats.hits += 1;
  cache.delete(key);
  cache.set(key, cachedRanges);
  return cachedRanges;
}

export function writeCodeHighlightCache(
  key: string,
  ranges: readonly CachedCodeHighlightRange[]
): void {
  if (!cache.has(key) && cache.size >= CODE_HIGHLIGHT_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey) {
      cache.delete(oldestKey);
      stats.evictions += 1;
    }
  }

  cache.set(
    key,
    ranges.map((range) => ({ ...range }))
  );
}

export function recordCodeHighlightParserRun(): void {
  stats.parserRuns += 1;
}

export function recordCodeHighlightSkippedLongBlock(): void {
  stats.skippedLongBlocks += 1;
}

export function clearCodeHighlightCache(): void {
  cache.clear();
  stats.hits = 0;
  stats.misses = 0;
  stats.parserRuns = 0;
  stats.skippedLongBlocks = 0;
  stats.evictions = 0;
}

export function getCodeHighlightCacheStats(): CodeHighlightCacheStats {
  return {
    entries: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    parserRuns: stats.parserRuns,
    skippedLongBlocks: stats.skippedLongBlocks,
    evictions: stats.evictions
  };
}

function hashCodeContent(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
