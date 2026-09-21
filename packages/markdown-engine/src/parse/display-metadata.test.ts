import { describe, expect, it, vi } from "vitest";
import { flattenMarkdownTree } from "../model/document-tree";
import { parseFullDocumentTree } from "./full-document-parser";
import { createMarkdownDocumentFromTree } from "../parse-markdown-document";
import { createDocumentStructureCache } from "../cache/document-structure-cache";
import { applyIncrementalEdit } from "../cache/incremental-document-parser";
import * as inlineParser from "../parse-inline-ast";

describe("canonical display metadata", () => {
  it("parses each cell once and reuses its AST in compatibility projection", () => {
    const onInlineParse = vi.fn();
    const tree = parseFullDocumentTree("| a | b |\n| --- | --- |\n| c | d |", {
      instrumentation: { onFullDocumentParse: vi.fn(), onInlineParse }
    });
    expect(onInlineParse).toHaveBeenCalledTimes(4);
    const table = tree.root.children[0]!;
    const parse = vi.spyOn(inlineParser, "parseInlineAst");
    const projected = createMarkdownDocumentFromTree(tree).blocks[0]!;
    expect(parse).not.toHaveBeenCalled();
    if (table.data.kind !== "table" || projected.type !== "table") throw new Error("Missing table");
    expect(projected.header[0]!.inline).toBe(table.data.header[0]!.inline);
    parse.mockRestore();
  });
  it.each(["", "> ", "  "])("keeps escaped cell inline ranges in original source coordinates with prefix %j", (prefix) => {
    const source = ["| **a\\|b** | `c\\|d` |", "| --- | --- |", "| [link][ref] | e\\|f |"].map((line) => prefix + line).join("\r\n") +
      "\r\n\r\n[ref]: https://example.com \"title\"";
    const tree = parseFullDocumentTree(source);
    const table = flattenMarkdownTree(tree).find((node) => node.data.kind === "table");
    expect(table?.data.kind).toBe("table");
    if (table?.data.kind !== "table") throw new Error("Missing table");
    const [strongCell, codeCell] = table.data.header;
    expect(strongCell!.text).toBe("**a|b**");
    expect(strongCell!.inline.children[0]).toMatchObject({ type: "strong", startOffset: source.indexOf("**a"), endOffset: source.indexOf("**a") + "**a\\|b**".length });
    const strong = strongCell!.inline.children[0]!;
    if (strong.type !== "strong") throw new Error("Missing strong");
    expect(strong.children).toEqual([{ type: "text", value: "a|b", startOffset: source.indexOf("a\\|b"), endOffset: source.indexOf("a\\|b") + 4 }]);
    expect(codeCell!.inline.children[0]).toMatchObject({ type: "codeSpan", text: "c|d", startOffset: source.indexOf("`c"), endOffset: source.indexOf("`c") + 6 });
    const link = table.data.rows[0]![0]!.inline.children[0]!;
    expect(link).toMatchObject({ type: "link", href: "https://example.com", destinationStartOffset: source.indexOf("https://"), destinationEndOffset: source.indexOf("https://") + "https://example.com".length });
    for (const cell of [...table.data.header, ...table.data.rows.flat()]) {
      expect(cell.inline.startOffset).toBe(cell.content.startOffset);
      expect(cell.inline.endOffset).toBe(cell.content.endOffset);
    }
  });

  it("materializes footnote definitions and paragraph segments once, retaining invalid statuses", () => {
    const source = "before **bold**\n[^ok]: valid *note*\n    continued\nafter\n\n[^dup]: one\n\n[^dup]: two\n\n[^]: malformed";
    const onInlineParse = vi.fn();
    const tree = parseFullDocumentTree(source, { instrumentation: { onFullDocumentParse: vi.fn(), onInlineParse } });
    const definitions = tree.root.children.filter((node) => node.data.kind === "definition");
    expect(definitions.map((node) => node.data.kind === "definition" ? node.data.footnote?.status : null)).toEqual(["valid", "duplicate", "duplicate", "malformed"]);
    expect(tree.root.children.filter((node) => node.kind === "paragraph").map((node) => source.slice(node.source.startOffset, node.source.endOffset))).toEqual(["before **bold**", "after"]);
    const valid = definitions[0]!.data;
    if (valid.kind !== "definition") throw new Error("Missing definition");
    expect(valid.footnote!.lines).toBe(tree.footnoteDefinitions.get("ok")!.lines);
    expect(valid.footnote!.lines[0]!.inline?.children.some((node) => node.type === "emphasis")).toBe(true);
    expect(onInlineParse).toHaveBeenCalledTimes(4);
    const parse = vi.spyOn(inlineParser, "parseInlineAst");
    const projected = createMarkdownDocumentFromTree(tree);
    expect(parse).not.toHaveBeenCalled();
    expect(projected.blocks.filter((block) => block.type === "definition").map((block) => block.footnoteDefinition?.status)).toEqual(["valid", "duplicate", "duplicate", "malformed"]);
    parse.mockRestore();
  });

  it.each([
    "Plain\n\n| **a\\|b** | `c\\|d` |\n| --- | --- |\n| e | f |",
    "Plain\n\n[^dup]: first\n\n[^dup]: second\n\n[^]: malformed",
    "Plain\n\n[^ok]: *note*\n    continued"
  ])("keeps shifted display metadata equal to a full parse", (source) => {
    const cache = createDocumentStructureCache(source);
    const onInlineParse = vi.fn();
    const result = applyIncrementalEdit(cache, { fromOffset: 5, toOffset: 5, insertedText: " longer" }, {
      instrumentation: { onFullDocumentParse: vi.fn(), onInlineParse }
    });
    const snapshot = (tree: ReturnType<typeof parseFullDocumentTree>) => flattenMarkdownTree(tree).map((node) => ({
      kind: node.kind, path: node.path, source: node.source, content: node.content, data: node.data,
      inline: "inline" in node ? node.inline : undefined
    }));
    expect(snapshot(result.cache.tree)).toEqual(snapshot(parseFullDocumentTree(result.cache.source)));
    if (result.stats.fullParseCount === 0) expect(onInlineParse).toHaveBeenCalledTimes(1);
  });
});
