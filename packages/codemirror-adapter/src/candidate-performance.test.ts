import { describe, expect, it } from "vitest";

import {
  countMarkdownLines,
  measureCandidateStructureCache,
  type CandidateEdit,
  type CandidatePerformanceReport
} from "./candidate-performance";

// RF-601 candidate-path performance gate. The point is honesty, not a pretty counter: an edit that
// makes the cache reparse the document must say why, and ordinary typing inside a plain paragraph
// must not reparse at all.

// A rich 5k mixed fixture that also contains genuinely plain, blank-line-separated paragraphs, so
// the allowed fast path is exercised beside real structure instead of only in a synthetic document.
function mixedFixtureWithPlainParagraphs(lineCount: number): string {
  const lines: string[] = [];
  let section = 1;
  while (lines.length < lineCount) {
    lines.push(`# Section ${section}`);
    lines.push(`Rich paragraph for section ${section} with **bold** and [link](https://example.com/${section}).`);
    lines.push("> Quoted note.");
    lines.push("```ts");
    lines.push(`const value${section} = ${section};`);
    lines.push("```");
    lines.push("");
    lines.push(`Plain paragraph one text for section ${section}.`);
    lines.push("");
    lines.push(`Plain paragraph two text for section ${section}.`);
    lines.push("");
    section += 1;
  }
  return lines.slice(0, lineCount).join("\n");
}

// A deterministic rich fixture built locally: the adapter package must not reach into another
// package's test-support modules, so the candidate evidence owns its own input.
function richMixedFixture(lineCount: number): string {
  const lines: string[] = [];
  let section = 1;
  while (lines.length < lineCount) {
    lines.push(`# Section ${section}`);
    lines.push(`Paragraph for section ${section} with **bold** and [link](https://example.com/${section}).`);
    lines.push(`1. Ordered item ${section}.1`);
    lines.push(`2. Ordered item ${section}.2`);
    lines.push(`- Bullet item ${section}`);
    lines.push(`> Quoted note ${section}`);
    lines.push("```ts");
    lines.push(`const value${section} = ${section};`);
    lines.push("```");
    lines.push("");
    section += 1;
  }
  return lines.slice(0, lineCount).join("\n");
}

function largeTableFixture(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_value, index) => `| r${index} | v${index} |`);
  return [
    "# Table section",
    "",
    "| A | B |",
    "| --- | --- |",
    ...rows,
    "",
    "Plain paragraph one text."
  ].join("\n");
}

function deepContainerFixture(depth: number): string {
  const lines: string[] = [];
  for (let level = 0; level < depth; level += 1) {
    lines.push(`${"> ".repeat(level)}> depth ${level}`);
  }
  lines.push("");
  lines.push("Plain paragraph one text.");
  return lines.join("\n");
}

function longParagraphFixture(): string {
  const paragraph = `LONGPARAGRAPH ${"word ".repeat(4000)}end`;
  return ["# Long paragraph section", "", paragraph, "", "Plain paragraph one text."].join("\n");
}

// A plain paragraph beside a reference definition: the paragraph is a valid fast-path target, so
// the definition index is what makes the cache fall back.
function fenceAndReferenceFixture(): string {
  return [
    "# Fence section",
    "",
    "```ts",
    "const value = 1;",
    "```",
    "",
    "See [notes][ref] for detail.",
    "",
    "[ref]: https://example.com/notes",
    "",
    "Plain paragraph one text."
  ].join("\n");
}

function editsFor(source: string, at: string): readonly CandidateEdit[] {
  const offset = source.indexOf(at);
  const insertAt = offset < 0 ? 0 : offset + at.length;
  return [
    { name: "plain-paragraph", kind: "plain-paragraph", from: insertAt, to: insertAt, insert: "x" }
  ];
}

function reportFor(source: string, at = "Plain paragraph one"): CandidatePerformanceReport {
  return measureCandidateStructureCache({
    source,
    edits: editsFor(source, at)
  });
}

describe("candidate structure cache performance", () => {
  // This is a test-runner watchdog, not an accepted editing latency. Keep the
  // full fixtures and every parse/reuse/revision assertion: both 20k probes and
  // the three-edit 5k fallback sequence can exceed the default 5s under CI load.
  const LARGE_FIXTURE_TIMEOUT_MS = 60000;

  it("keeps ordinary plain-paragraph typing at zero full parses on a 20k mixed fixture", () => {
    const source = mixedFixtureWithPlainParagraphs(20000);
    const report = reportFor(source);

    expect(report.lineCount).toBe(20000);
    expect(report.operations[0]).toMatchObject({
      kind: "plain-paragraph",
      fullParseCount: 0,
      fallbackReason: null
    });
    // The parsed window is a single short paragraph, not the 20k-line document.
    expect(report.operations[0]!.parsedSourceLength).toBeLessThan(1000);
    expect(report.operations[0]!.reusedNodes).toBeGreaterThan(0);
    expect(report.coldParseMs).toBeGreaterThan(0);
  }, LARGE_FIXTURE_TIMEOUT_MS);

  it("reports the whole-document cost of a document-start edit on a 20k mixed fixture", () => {
    const source = mixedFixtureWithPlainParagraphs(20000);
    const report = measureCandidateStructureCache({
      source,
      edits: [{ name: "document-start", kind: "document-start", from: 0, to: 0, insert: "d" }]
    });
    const operation = report.operations[0]!;

    expect(operation.fullParseCount).toBe(1);
    expect(operation.fallbackReason).toBe("unproven-block-boundary");
    expect(operation.parsedSourceLength).toBe(source.length + 1);
    expect(Number.isFinite(operation.durationMs)).toBe(true);
  }, LARGE_FIXTURE_TIMEOUT_MS);

  it("keeps ordinary plain-paragraph typing at zero full parses on a 5k mixed fixture", () => {
    const source = mixedFixtureWithPlainParagraphs(5000);
    const report = reportFor(source);

    expect(report.lineCount).toBeGreaterThanOrEqual(5000);
    expect(report.operations).toHaveLength(1);
    expect(report.operations[0]).toMatchObject({
      kind: "plain-paragraph",
      fullParseCount: 0,
      fallbackReason: null
    });
    expect(report.operations[0]!.parsedSourceLength).toBeLessThan(source.length);
    expect(report.operations[0]!.cacheRevision).toBe(2);
  });

  it("keeps ordinary plain-paragraph typing at zero full parses in a long paragraph", () => {
    const report = reportFor(longParagraphFixture());

    expect(report.operations[0]).toMatchObject({
      kind: "plain-paragraph",
      fullParseCount: 0,
      fallbackReason: null
    });
  });

  it("keeps ordinary plain-paragraph typing at zero full parses beside a large table", () => {
    const source = largeTableFixture(2000);
    const report = reportFor(source);

    // The table is not touched, so the paragraph fast path still applies.
    expect(report.operations[0]).toMatchObject({
      kind: "plain-paragraph",
      fullParseCount: 0,
      fallbackReason: null
    });
  });

  it("keeps ordinary plain-paragraph typing at zero full parses in a deeply nested document", () => {
    const report = reportFor(deepContainerFixture(12));

    expect(report.operations[0]).toMatchObject({
      kind: "plain-paragraph",
      fullParseCount: 0,
      fallbackReason: null
    });
  });

  it("reports an explicit reason and measured cost for document-start edits", () => {
    const source = richMixedFixture(5000);
    const report = measureCandidateStructureCache({
      source,
      edits: [{ name: "document-start", kind: "document-start", from: 0, to: 0, insert: "d" }]
    });
    const operation = report.operations[0]!;

    expect(operation.fullParseCount).toBe(1);
    expect(operation.fallbackReason).toBe("unproven-block-boundary");
    // The measured cost is the whole new document, reported rather than hidden.
    expect(operation.parsedSourceLength).toBe(source.length + 1);
    expect(operation.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports global-definition fallback when the document has reference definitions", () => {
    const source = fenceAndReferenceFixture();
    const report = reportFor(source);
    const operation = report.operations[0]!;

    expect(operation.fullParseCount).toBe(1);
    expect(operation.fallbackReason).toBe("global-definition-dependencies");
    expect(operation.parsedSourceLength).toBe(source.length + 1);
  });

  it("reports a structural fallback reason for edits inside a fence", () => {
    const source = fenceAndReferenceFixture();
    const fenceOffset = source.indexOf("const value");
    const report = measureCandidateStructureCache({
      source,
      edits: [{
        name: "fence-content",
        kind: "fence-and-reference",
        from: fenceOffset,
        to: fenceOffset,
        insert: "!"
      }]
    });

    expect(report.operations[0]!.fullParseCount).toBe(1);
    expect(report.operations[0]!.fallbackReason).not.toBeNull();
  });

  it("advances the cache revision for every candidate edit, including fallbacks", () => {
    const source = richMixedFixture(5000);
    const paragraphOffset = source.indexOf("Paragraph for section 1");
    const report = measureCandidateStructureCache({
      source,
      edits: [
        {
          name: "plain-paragraph",
          kind: "plain-paragraph",
          from: paragraphOffset + "Paragraph for section 1".length,
          to: paragraphOffset + "Paragraph for section 1".length,
          insert: "x"
        },
        { name: "document-start", kind: "document-start", from: 0, to: 0, insert: "d" },
        {
          name: "plain-paragraph-again",
          kind: "plain-paragraph",
          from: paragraphOffset + "Paragraph for section 1".length + 1,
          to: paragraphOffset + "Paragraph for section 1".length + 1,
          insert: "y"
        }
      ]
    });

    const revisions = report.operations.map((operation) => operation.cacheRevision);
    expect(revisions).toEqual([2, 3, 4]);
    expect(report.operations[1]!.fullParseCount).toBe(1);
  }, LARGE_FIXTURE_TIMEOUT_MS);

  it("counts lines with the shared LF policy", () => {
    expect(countMarkdownLines("a\nb\nc")).toBe(3);
    expect(countMarkdownLines("")).toBe(0);
  });
});
