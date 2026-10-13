import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCodeHighlightCache, CODE_HIGHLIGHT_CACHE_LIMITS as limits,
  createCodeHighlightCacheKey, getCodeHighlightCacheStats,
  readCodeHighlightCache, writeCodeHighlightCache
} from "./code-highlight-cache";

const token = { from: 0, to: 1, className: "tok-keyword" };
beforeEach(clearCodeHighlightCache);

describe("bounded relative highlight cache", () => {
  it("uses exact content and language identity, including former equal-length FNV collisions", () => {
    // These equal-length strings collide under the former FNV-1a key.
    const a = createCodeHighlightCacheKey("javascript", "# 1yrme6z");
    const b = createCodeHighlightCacheKey("javascript", "## na4i8q");
    expect(a).not.toBe(b);
    expect(createCodeHighlightCacheKey("a:b", "c")).not.toBe(createCodeHighlightCacheKey("a", "b:c"));
    writeCodeHighlightCache(a, [token]);
    expect(readCodeHighlightCache(b)).toBeNull();
    expect(readCodeHighlightCache(createCodeHighlightCacheKey("typescript", "# 1yrme6z"))).toBeNull();
  });

  it("owns immutable relative tokens and accounts replacement without retaining old ranges", () => {
    const input = [{ ...token }];
    writeCodeHighlightCache("a", input);
    input[0]!.to = 99;
    const stored = readCodeHighlightCache("a")!;
    expect(stored[0]!.to).toBe(1);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored[0])).toBe(true);
    writeCodeHighlightCache("a", []);
    expect(readCodeHighlightCache("a")).toEqual([]);
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: 1, retainedRanges: 0, retainedTextCodeUnits: 1 });
  });

  it("evicts least recently used entries and promotes both reads and replacement writes", () => {
    for (let i = 0; i < limits.entries; i++) writeCodeHighlightCache(String(i), []);
    readCodeHighlightCache("0");
    writeCodeHighlightCache("1", []);
    writeCodeHighlightCache("new", []);
    expect(readCodeHighlightCache("2")).toBeNull();
    expect(readCodeHighlightCache("0")).toEqual([]);
    expect(readCodeHighlightCache("1")).toEqual([]);
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: limits.entries, evictions: 1 });
  });

  it("bounds retained text independently of entry and token counts", () => {
    const key = "x".repeat(limits.textCodeUnits);
    writeCodeHighlightCache(key, []);
    expect(getCodeHighlightCacheStats().retainedTextCodeUnits).toBe(limits.textCodeUnits);
    writeCodeHighlightCache("next", []);
    expect(readCodeHighlightCache(key)).toBeNull();
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: 1, retainedTextCodeUnits: 4, evictions: 1 });
  });

  it("counts class strings and rejects oversize entries without evicting useful neighbors", () => {
    writeCodeHighlightCache("keep", [token]);
    writeCodeHighlightCache("large", [{ ...token, className: "x".repeat(limits.textCodeUnits) }]);
    writeCodeHighlightCache("many", Array.from({ length: limits.ranges + 1 }, () => ({ ...token, className: "" })));
    expect(readCodeHighlightCache("keep")).toEqual([token]);
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: 1, retainedRanges: 1, evictions: 0,
      retainedTextCodeUnits: 4 + token.className.length });
  });

  it("bounds tokens independently and releases every retained counter on clear", () => {
    writeCodeHighlightCache("full", Array.from({ length: limits.ranges }, () => ({ ...token, className: "" })));
    writeCodeHighlightCache("next", [token]);
    expect(readCodeHighlightCache("full")).toBeNull();
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: 1, retainedRanges: 1, evictions: 1 });
    clearCodeHighlightCache();
    expect(getCodeHighlightCacheStats()).toEqual({ entries: 0, hits: 0, misses: 0, parserRuns: 0,
      skippedLongBlocks: 0, evictions: 0, retainedRanges: 0, retainedTextCodeUnits: 0 });
  });

  it("evicts multiple older entries when one new entry requires their combined capacity", () => {
    const chunk = "x".repeat(Math.floor(limits.textCodeUnits / 4) - 1);
    for (let i = 0; i < 4; i++) writeCodeHighlightCache(i + chunk, []);
    readCodeHighlightCache("0" + chunk);
    writeCodeHighlightCache("y".repeat(limits.textCodeUnits / 2), []);
    expect(getCodeHighlightCacheStats()).toMatchObject({ entries: 3, evictions: 2,
      retainedTextCodeUnits: limits.textCodeUnits });
    expect(readCodeHighlightCache("1" + chunk)).toBeNull();
    expect(readCodeHighlightCache("2" + chunk)).toBeNull();
    expect(readCodeHighlightCache("0" + chunk)).toEqual([]);
  });
  it("stays bounded over repeated replacement working sets", () => {
    for (let generation = 0; generation < 8; generation++) {
      for (let block = 0; block < 1000; block++) {
        writeCodeHighlightCache(createCodeHighlightCacheKey("typescript", `${generation}:${block}`), [token]);
      }
      const stats = getCodeHighlightCacheStats();
      expect(stats.entries).toBeLessThanOrEqual(limits.entries);
      expect(stats.retainedTextCodeUnits).toBeLessThanOrEqual(limits.textCodeUnits);
      expect(stats.retainedRanges).toBeLessThanOrEqual(limits.ranges);
    }
    expect(readCodeHighlightCache(createCodeHighlightCacheKey("typescript", "0:0"))).toBeNull();
  });
});
