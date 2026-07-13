import { parseMarkdownDocument } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import { findBlockPathAt, findLeafBlockAt, findTopLevelBlockAt } from "./block-path";

describe("block path resolution", () => {
  it("returns top-level paragraph for body content and leaf paragraph", () => {
    const source = "Paragraph";
    const markdownDocument = parseMarkdownDocument(source);
    const cursor = source.indexOf("graph");

    expect(findTopLevelBlockAt(markdownDocument, cursor)?.type).toBe("paragraph");
    expect(findBlockPathAt(markdownDocument, cursor).map((entry) => entry.block.type)).toEqual([
      "paragraph"
    ]);
    expect(findLeafBlockAt(markdownDocument, cursor)?.type).toBe("paragraph");
  });

  it("returns blockquote then inner codeFence for quote-internal fenced code content", () => {
    const source = ["> ```ts", "> const answer = 42;", "> ```"].join("\n");
    const markdownDocument = parseMarkdownDocument(source);
    const cursor = source.indexOf("answer");

    expect(findBlockPathAt(markdownDocument, cursor).map((entry) => entry.block.type)).toEqual([
      "blockquote",
      "codeFence"
    ]);
    expect(findLeafBlockAt(markdownDocument, cursor)?.type).toBe("codeFence");
  });

  it("returns deepest nested quote leaf", () => {
    const source = ["> outer", "> > inner"].join("\n");
    const markdownDocument = parseMarkdownDocument(source);
    const cursor = source.indexOf("inner");

    expect(findBlockPathAt(markdownDocument, cursor).map((entry) => entry.block.type)).toEqual([
      "blockquote",
      "blockquote",
      "paragraph"
    ]);
    expect(findBlockPathAt(markdownDocument, cursor).map((entry) => entry.depth)).toEqual([0, 1, 2]);
    expect(findLeafBlockAt(markdownDocument, cursor)?.type).toBe("paragraph");
  });

  it("documents current mixed-container paths stopping at list blocks", () => {
    const listQuoteList = ["- > - first", "  > - second", "  > - target"].join("\n");
    const listDocument = parseMarkdownDocument(listQuoteList);
    expect(
      findBlockPathAt(listDocument, listQuoteList.indexOf("target")).map(
        (entry) => entry.block.type
      )
    ).toEqual(["list"]);

    const quoteListMath = ["> > - $$", "> >   x + y", "> >   $$"].join("\n");
    const quoteDocument = parseMarkdownDocument(quoteListMath);
    expect(
      findBlockPathAt(quoteDocument, quoteListMath.indexOf("x + y")).map(
        (entry) => entry.block.type
      )
    ).toEqual(["blockquote", "blockquote", "list"]);
  });

  it("keeps previous block active when cursor is on trailing newline", () => {
    const source = "Paragraph\n";
    const markdownDocument = parseMarkdownDocument(source);
    const cursor = "Paragraph".length;

    expect(findTopLevelBlockAt(markdownDocument, cursor)?.type).toBe("paragraph");
    expect(findLeafBlockAt(markdownDocument, cursor)?.type).toBe("paragraph");
  });

  it("returns empty path on body structural separators", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const markdownDocument = parseMarkdownDocument(source);
    const cursor = "# Title\n".length;

    expect(findBlockPathAt(markdownDocument, cursor)).toEqual([]);
    expect(findLeafBlockAt(markdownDocument, cursor)).toBeNull();
  });
});
