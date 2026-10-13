import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { flattenMarkdownTree, type MarkdownDocumentTree } from "../model/document-tree";
import { parseFullDocumentTree } from "../parse/full-document-parser";
import { createDocumentStructureCache } from "./document-structure-cache";
import { applyIncrementalEdit } from "./incremental-document-parser";

function snapshot(tree: MarkdownDocumentTree) {
  return { root: tree.root, nodes: [...tree.nodesById], references: [...tree.referenceDefinitions],
    footnotes: [...tree.footnoteDefinitions], source: tree.source };
}

const references = "[early]: /early \"Early title\"\n\n[late]: /late \"Late title\"";
const footnotes = "[^note]: A *note* with [early] and [late].\n    Continued text.\n\n[^dup]: first\n\n[^dup]: second\n\n[^]: malformed";
const uses = "Before [early] [late][] [named][late] ![image][early] [^note].";
const containers = "> Quoted [late] and [early].\n>\n> - Listed [early] and [late].\n\n| **a\\|b** | [late] |\n| --- | --- |\n| [early] | ![image][late] |";
const paragraph = "Paragraph **strong** [early] [late] [^note] ending.";

describe("mixed-document word edits", () => {
  it.each([
    { source: paragraph + "\n\n" + references, needle: "ending", relative: 2, removed: 2, text: "" },
    { source: "Paragraph [rf] ending.\n\n[ref]: /resolved", needle: "rf", relative: 1, removed: 0, text: "e" },
    { source: "Paragraph [^note] ending.\n\n[^note]: *note*", needle: "ending", relative: 2, removed: 1, text: "XY" }
  ])("handles noninitial words, resolving references and footnote-only maps ($needle)", ({ source, needle, relative, removed, text }) => {
    let cache = createDocumentStructureCache(source);
    const offset = source.indexOf(needle) + relative;
    const deleted = source.slice(offset, offset + removed);
    let step = 0;
    for (const [removeCount, insertedText] of [[removed, text], [text.length, deleted], [removed, text]] as const) {
      const result = applyIncrementalEdit(cache, { fromOffset: offset, toOffset: offset + removeCount, insertedText });
      // Once resolved, the inverse edit is inside a link, outside the direct-text path.
      expect(result.stats.fullParseCount).toBe(needle === "rf" && step === 1 ? 1 : 0);
      expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
      cache = result.cache;
      step++;
    }
  });
  const layouts = [
    [references, footnotes, uses, paragraph, containers],
    [uses, containers, paragraph, references, footnotes],
    ["[early]: /early \"Early title\"", uses, paragraph, containers, "[late]: /late \"Late title\"", footnotes],
    [footnotes, containers, paragraph, uses, references],
    [uses, paragraph, containers],
    ["[early]: /first", paragraph, "[early]: /duplicate", containers]
  ];
  it.each(layouts.flatMap((parts, layout) => ["\n", "\r\n"].flatMap(eol => [false, true].map(finalEol => ({
    layout, eol, finalEol, source: parts.join("\n\n").replaceAll("\n", eol) + (finalEol ? eol : "")
  })))))("matches full parse through insert/delete/replace/undo ($layout, $eol, $finalEol)", ({ source }) => {
    let cache = createDocumentStructureCache(source);
    const offset = source.indexOf("Paragraph") + 4;
    const edits = [
      { fromOffset: offset, toOffset: offset, insertedText: "XYZ" },
      { fromOffset: offset, toOffset: offset + 3, insertedText: "" },
      { fromOffset: offset, toOffset: offset + 2, insertedText: "AB" },
      { fromOffset: offset, toOffset: offset + 2, insertedText: "gr" }
    ];
    for (const edit of edits) {
      const old = structuredClone(snapshot(cache.tree));
      const onFullDocumentParse = vi.fn();
      const onInlineParse = vi.fn();
      const result = applyIncrementalEdit(cache, edit, { instrumentation: { onFullDocumentParse, onInlineParse } });
      expect(result.stats.fullParseCount).toBe(0);
      expect(result.stats.fallbackReason).toBeNull();
      expect(onFullDocumentParse).not.toHaveBeenCalled();
      expect(onInlineParse).toHaveBeenCalledTimes(1);
      expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
      expect(snapshot(cache.tree)).toEqual(old);
      for (const node of flattenMarkdownTree(result.cache.tree)) {
        if (node.data.kind === "definition" && node.data.footnote?.status === "valid") {
          const lines = node.data.footnote.lines;
          const definition = [...result.cache.tree.footnoteDefinitions.values()].find(def => def.lines === lines);
          expect(definition).toBeDefined();
        }
      }
      cache = result.cache;
    }
    expect(cache.source).toBe(source);
  });

  it.each(["\n", "\r\n", " ", "\t", "*", "[", "]", "#", "`", "\\", "😀", "\u0301", "中"])(
    "falls back for unproven insertion %j", insertedText => {
      const source = [references, paragraph, containers, footnotes].join("\n\n");
      const offset = source.indexOf("Paragraph") + 4;
      const onFullDocumentParse = vi.fn();
      const result = applyIncrementalEdit(createDocumentStructureCache(source), {
        fromOffset: offset, toOffset: offset, insertedText
      }, { instrumentation: { onFullDocumentParse } });
      expect(result.stats.fullParseCount).toBe(1);
      expect(onFullDocumentParse).toHaveBeenCalled();
      expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
    }
  );

  it.each([
    [paragraph, "Paragraph", 0, 0], [paragraph, "Paragraph", 9, 0],
    [paragraph, "strong", 2, 0], [paragraph, "**", 0, 2],
    ["Paragraph `codeword` and $mathword$.", "codeword", 3, 0],
    ["Paragraph `codeword` and $mathword$.", "mathword", 3, 0],
    ["Paragraph [link](/destination).", "destination", 3, 0],
    ["> Paragraph **strong**.", "Paragraph", 4, 0],
    ["- Paragraph **strong**.", "Paragraph", 4, 0],
    ["Paragraph first\ncontinued.", "Paragraph", 4, 0],
    ["Paragraph \\*escaped word.", "escaped", 3, 0],
    ["[^note]: Paragraph note", "Paragraph", 4, 0],
    ["[early]: /destination", "destination", 3, 0]
  ] as const)("falls back outside a proven direct text word (%s, %s)", (body, word, delta, removed) => {
    const source = body + "\n\n" + references;
    const offset = source.indexOf(word) + delta;
    const result = applyIncrementalEdit(createDocumentStructureCache(source), {
      fromOffset: offset, toOffset: offset + removed, insertedText: "x"
    });
    expect(result.stats.fullParseCount).toBe(1);
    expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
  });

  it("matches the canonical mixed 20k tree without a full parse for word typing", () => {
    const source = readFileSync("fixtures/performance/complex-20000-lines.md", "utf8");
    const offset = source.indexOf("Paragraph") + 4;
    const onFullDocumentParse = vi.fn();
    const onInlineParse = vi.fn();
    const result = applyIncrementalEdit(createDocumentStructureCache(source), {
      fromOffset: offset, toOffset: offset, insertedText: "x"
    }, { instrumentation: { onFullDocumentParse, onInlineParse } });
    expect(result.stats.fullParseCount).toBe(0);
    expect(onFullDocumentParse).not.toHaveBeenCalled();
    expect(onInlineParse).toHaveBeenCalledTimes(1);
    expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
  }, 30_000);
});
