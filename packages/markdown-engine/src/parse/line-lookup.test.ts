import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as lookup from "./line-lookup";
import { parseFullDocumentTree } from "./full-document-parser";
import { projectMarkdownDocument } from "./document-projection";

// The removed footnote resolver counted LF characters from the source start.
// Keep that independently simple oracle to check the indexed result and edges.
function scannedLine(source: string, offset: number): number {
  let line = 1;
  for (let at = 0; at < offset && at < source.length; at++) if (source[at] === "\n") line++;
  return line;
}

afterEach(() => vi.restoreAllMocks());

describe("parse-local line lookup", () => {
  it.each(["", "one", "one\n", "\n\n", "one\r\ntwo\r\nthree", "one\rtwo\n", "中文\n\u{10400}word\n末尾"])(
    "matches the former scan at every UTF-16 offset: %j", source => {
      const lineAt = lookup.createLineLookup(source);
      for (let at = -1; at <= source.length + 1; at++) expect(lineAt(at)).toBe(scannedLine(source, at));
    }
  );

  it.each(["# Title\n\nParagraph", "[^n]: standalone note", "> nested paragraph\n\n- list"])(
    "does not allocate an unused footnote line index: %s", source => {
      const spy = vi.spyOn(lookup, "createLineLookup");
      parseFullDocumentTree(source);
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it.each(["\n", "\r\n"])("matches the old resolver across many separate footnote groups (%j)", eol => {
    const source = Array.from({ length: 20 }, (_, i) =>
      `# Group ${i}\nBefore [ref${i}] and [^n${i}].\n[^n${i}]: Note ${i}\n[ref${i}]: /${i}\nAfter ${i}.\n\n> quote\n\n`
    ).join("").replaceAll("\n", eol);
    const spy = vi.spyOn(lookup, "createLineLookup");
    const indexed = parseFullDocumentTree(source);
    expect(spy).toHaveBeenCalledTimes(1);
    const projection = projectMarkdownDocument(indexed);
    spy.mockImplementation(text => offset => scannedLine(text, offset));
    const scanned = parseFullDocumentTree(source);
    expect(indexed).toEqual(scanned);
    expect(projection).toEqual(projectMarkdownDocument(scanned));
  });

  it("creates independent lazy indexes for consecutive documents", () => {
    const sources = ["Before\n[^n]: Note\nAfter", "Lead\n\nBefore\n[^n]: Note\nAfter"];
    const spy = vi.spyOn(lookup, "createLineLookup");
    const trees = sources.map(source => parseFullDocumentTree(source));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map(args => args[0])).toEqual(sources);
    spy.mockImplementation(text => offset => scannedLine(text, offset));
    expect(trees).toEqual(sources.map(source => parseFullDocumentTree(source)));
  });

  it("uses one index for the canonical 20k parse and remains equal to the old resolver", () => {
    const source = readFileSync("fixtures/performance/complex-20000-lines.md", "utf8");
    const spy = vi.spyOn(lookup, "createLineLookup");
    const indexed = parseFullDocumentTree(source);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockImplementation(text => offset => scannedLine(text, offset));
    expect(indexed).toEqual(parseFullDocumentTree(source));
  }, 30_000);
});
