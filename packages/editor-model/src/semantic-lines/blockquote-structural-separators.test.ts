import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import {
  findCanonicalBlockquoteStructuralSeparatorAt,
  findCanonicalPreviousBlockquoteStructuralSeparator,
  type BlockquoteStructuralSeparator
} from "./blockquote-structural-separators";

const snapshotOf = (source: string): EditorDerivedSnapshot =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

const corpus: Array<[string, string]> = [
  ["quote separator", "> one\n>\n> two"],
  ["quote separator with padding", "> one\n> \n> two"],
  ["quote separator at start", ">\n> two"],
  ["quote separator at end", "> one\n>"],
  ["two separators in one gap", "> one\n>\n>\n> two"],
  ["nested quote separator", "> > one\n> >\n> > two"],
  ["nested quote inner separator", "> outer\n> > inner one\n> >\n> > inner two\n> outer two"],
  ["quote with list between", "> one\n>\n> - item"],
  ["quote with fence", "> one\n>\n> ```\n> code\n> ```"],
  ["quote with math", "> one\n>\n> $$\n> x\n> $$"],
  ["quote inside list", "- item\n\n  > one\n  >\n  > two"],
  ["quote inside list item text", "- > one\n  >\n  > two"],
  ["separator without previous block", "> \n>\n> two"],
  ["paragraph then quote separator", "Alpha\n\n> one\n>\n> two"],
  ["crlf quote separator", "> one\r\n>\r\n> two"],
  ["quote with table", "> one\n>\n> | a | b |\n> | --- | --- |\n> | 1 | 2 |"],
  ["quote with heading", "> # Title\n>\n> body"],
  ["quote with blank body lines", "> one\n>\n>\n> two\n>\n> three"],
  ["quote in quote with padding", "> > one\n> > \n> > two"],
  ["bare quote line only", ">"],
  ["quote without separator", "> one\n> two"],
  ["list then quote separator", "- item\n\n> one\n>\n> two\n\nAfter"]
];

// Frozen contract. Each entry lists the separators found at the document's line starts. The values
// were produced by the projection-based implementation and matched line by line (every anchor of
// every document, plus the previous-separator lookup) before that implementation was deleted.
const expectedSeparators: Record<string, BlockquoteStructuralSeparator[]> = {
  "quote separator": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 10, previousBlockEnd: 5 }
  ],
  "quote separator with padding": [
    { blankLineStart: 6, lineEndOffset: 8, lineStartOffset: 6, nextBlockStart: 11, previousBlockEnd: 5 }
  ],
  "quote separator at start": [],
  "quote separator at end": [],
  "two separators in one gap": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 12, previousBlockEnd: 5 }
  ],
  "nested quote separator": [],
  "nested quote inner separator": [],
  "quote with list between": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 8, previousBlockEnd: 5 }
  ],
  "quote with fence": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 8, previousBlockEnd: 5 }
  ],
  "quote with math": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 8, previousBlockEnd: 5 }
  ],
  "quote inside list": [],
  "quote inside list item text": [],
  "separator without previous block": [],
  "paragraph then quote separator": [
    { blankLineStart: 13, lineEndOffset: 14, lineStartOffset: 13, nextBlockStart: 17, previousBlockEnd: 12 }
  ],
  "crlf quote separator": [
    { blankLineStart: 7, lineEndOffset: 9, lineStartOffset: 7, nextBlockStart: 12, previousBlockEnd: 5 }
  ],
  "quote with table": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 8, previousBlockEnd: 5 }
  ],
  "quote with heading": [
    { blankLineStart: 10, lineEndOffset: 11, lineStartOffset: 10, nextBlockStart: 14, previousBlockEnd: 9 }
  ],
  "quote with blank body lines": [
    { blankLineStart: 6, lineEndOffset: 7, lineStartOffset: 6, nextBlockStart: 12, previousBlockEnd: 5 },
    { blankLineStart: 16, lineEndOffset: 17, lineStartOffset: 16, nextBlockStart: 20, previousBlockEnd: 15 }
  ],
  "quote in quote with padding": [],
  "bare quote line only": [],
  "quote without separator": [],
  "list then quote separator": [
    { blankLineStart: 14, lineEndOffset: 15, lineStartOffset: 14, nextBlockStart: 18, previousBlockEnd: 13 }
  ]
};

const lineStartsOf = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
};

describe("canonical blockquote structural separators", () => {
  it.each(corpus)("resolves the separators for %s", (name, source) => {
    const snapshot = snapshotOf(source);
    const separators = lineStartsOf(source)
      .map((lineStart) => findCanonicalBlockquoteStructuralSeparatorAt(snapshot, lineStart))
      .filter((separator): separator is BlockquoteStructuralSeparator => separator !== null);

    expect(separators).toEqual(expectedSeparators[name]);
  });

  it("only resolves the previous-separator lookup for an empty quote line", () => {
    const source = "> one\n>\n> two";
    const snapshot = snapshotOf(source);
    const separator = expectedSeparators["quote separator"]![0];

    expect(findCanonicalPreviousBlockquoteStructuralSeparator(snapshot, source.indexOf("> two"))).toEqual(separator);
    expect(findCanonicalPreviousBlockquoteStructuralSeparator(snapshot, source.indexOf("\n>") + 1)).toBeNull();
    expect(findCanonicalPreviousBlockquoteStructuralSeparator(snapshot, 0)).toBeNull();
  });

  it("resolves a separator between two quote inner blocks", () => {
    const source = "> one\n>\n> two";

    expect(findCanonicalBlockquoteStructuralSeparatorAt(snapshotOf(source), source.indexOf("\n>") + 2))
      .toEqual(expectedSeparators["quote separator"]![0]);
  });
});
