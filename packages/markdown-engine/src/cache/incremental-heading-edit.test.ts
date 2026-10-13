import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as fullParser from "../parse/full-document-parser";
import { createDocumentStructureCache } from "./document-structure-cache";
import { applyIncrementalEdit } from "./incremental-document-parser";

const dependencies = "\n\n> - nested **bold** [link][ref]\n\n| a | b |\n| --- | --- |\n| [ref] | [^n] |\n\n[^n]: note [ref]\n\n[ref]: /url \"title\"\n";

describe("bounded plain ATX heading edits", () => {
  it("matches the canonical mixed 20k tree while parsing only the heading inline", () => {
    const source = readFileSync("fixtures/performance/complex-20000-lines.md", "utf8");
    const onFullDocumentParse = vi.fn(), onInlineParse = vi.fn();
    const cache = createDocumentStructureCache(source);
    const result = applyIncrementalEdit(cache, { fromOffset: 2, toOffset: 2, insertedText: "x" },
      { instrumentation: { onFullDocumentParse, onInlineParse } });
    expect(onFullDocumentParse).not.toHaveBeenCalled();
    expect(onInlineParse).toHaveBeenCalledTimes(1);
    expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree(result.cache.source));
  }, 30_000);

  it.each(["# Title", "## 中文标题", "   ### Title 123!?", "###### Title", "# Title\r\n", "#\tTitle"])(
    "keeps beginning, middle, end and undo edits equal to full parse: %s", heading => {
      let cache = createDocumentStructureCache(heading + dependencies);
      for (const position of ["start", "middle", "end"] as const) {
        const target = cache.tree.root.children[0]!;
        const at = position === "start" ? target.content.startOffset : position === "end"
          ? target.content.endOffset : target.content.startOffset + 2;
        const original = cache.source;
        for (const edit of [{ fromOffset: at, toOffset: at, insertedText: "新x" }, { fromOffset: at, toOffset: at + 2, insertedText: "" }]) {
          const spy = vi.spyOn(fullParser, "parseFullDocumentTree");
          const result = applyIncrementalEdit(cache, edit);
          expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
          expect(result.stats.fullParseCount).toBe(0);
          expect(result.stats.reparsedNodes).toBe(1);
          expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree(result.cache.source));
          cache = result.cache;
        }
        expect(cache.source).toBe(original);
      }
    }
  );

  it.each(["\u{10400}", "\u{20000}"])("preserves UTF-16 coordinates through non-BMP letter edits: %s", text => {
    const original = "[before]: /first\n\n# Title\n\n[before] [^n]\n" + dependencies;
    for (const relative of [0, 2, 5]) {
      let cache = createDocumentStructureCache(original);
      const at = original.indexOf("Title") + relative;
      for (const edit of [{ fromOffset: at, toOffset: at, insertedText: text },
        { fromOffset: at, toOffset: at + text.length, insertedText: "" }]) {
        const result = applyIncrementalEdit(cache, edit);
        expect(result.stats.fullParseCount).toBe(0);
        expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree(result.cache.source));
        cache = result.cache;
      }
      expect(cache.source).toBe(original);
    }
  });

  it("keeps a heading at EOF local without a final newline", () => {
    const result = applyIncrementalEdit(createDocumentStructureCache("# Title"), { fromOffset: 2, toOffset: 2, insertedText: "x" });
    expect(result.stats.fullParseCount).toBe(0);
    expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree("# xTitle"));
  });

  it("remaps definitions before and after a heading and preserves old tree", () => {
    const source = "[before]: /first\n\n# Title\n\n[before] [later] [^n]\n" + dependencies + "\n[later]: /last\n";
    const cache = createDocumentStructureCache(source);
    const before = fullParser.parseFullDocumentTree(source);
    const at = source.indexOf("Title");
    const result = applyIncrementalEdit(cache, { fromOffset: at, toOffset: at + 5, insertedText: "Replacement" });
    expect(result.stats.fullParseCount).toBe(0);
    expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree(result.cache.source));
    expect(cache.tree).toEqual(before);
  });

  it.each([
    { source: "# Title", from: 0, to: 1, text: "##" },
    { source: "# Title", from: 2, to: 7, text: "" },
    { source: "# Title", from: 2, to: 2, text: " " },
    { source: "# Title", from: 7, to: 7, text: " " },
    { source: "# Title", from: 4, to: 4, text: "\n" },
    { source: "# Title", from: 7, to: 7, text: " #" },
    { source: "# Title", from: 4, to: 4, text: "*" },
    { source: "# Title", from: 4, to: 4, text: "[ref]" },
    { source: "# Title #", from: 3, to: 3, text: "x" },
    { source: "# Title  ", from: 3, to: 3, text: "x" },
    { source: "# **Title**", from: 5, to: 5, text: "x" },
    { source: "Title\n===", from: 2, to: 2, text: "x" },
    { source: "> # Title", from: 5, to: 5, text: "x" },
    { source: "- # Title", from: 5, to: 5, text: "x" },
    { source: "# Title", from: 2, to: 2, text: "\t" },
    { source: "# Title", from: 7, to: 7, text: "\t" },
    { source: "# Title", from: 4, to: 4, text: "\u0301" },
    { source: "# Title", from: 4, to: 4, text: "😀" },
    { source: "# \u{10400}Title", from: 3, to: 3, text: "x" },
    { source: "# \u{20000}Title", from: 2, to: 3, text: "" },
  ])("falls back for unproven boundaries: $source / $text", ({ source, from, to, text }) => {
    const cache = createDocumentStructureCache(source + dependencies);
    const result = applyIncrementalEdit(cache, { fromOffset: from, toOffset: to, insertedText: text });
    expect(result.stats.fullParseCount).toBe(1);
    expect(result.stats.fallbackReason).not.toBeNull();
    expect(result.cache.tree).toEqual(fullParser.parseFullDocumentTree(result.cache.source));
  });
});
