import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createCanonicalSemanticLineRoles } from "./canonical-semantic-lines";
import { createSemanticEditingDocument } from "./semantic-editing-document";
import { createLongMarkdownFixture } from "../performance/long-document-fixtures";

const snapshotOf = (source: string): EditorDerivedSnapshot =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

// Roles in line order, joined for review.
const roleSummary = (source: string): string => {
  const snapshot = snapshotOf(source);
  const lines = createSemanticEditingDocument(snapshot.document, snapshot).lines;

  return createCanonicalSemanticLineRoles(lines, snapshot).join("|");
};

const corpus: Array<[string, string]> = [
  ["empty", ""],
  ["single newline", "\n"],
  ["whitespace only", "   \t"],
  ["paragraph", "Alpha"],
  ["paragraph with trailing newline", "Alpha\n"],
  ["crlf paragraphs", "Alpha\r\n\r\nBeta\r\n"],
  ["heading", "# Title\n\nBody"],
  ["heading only", "### Deep"],
  ["structural separator then extra blank", "Alpha\n\n\n\nBeta"],
  ["three blank rows", "Alpha\n\n\n\n\nBeta"],
  ["leading blank rows", "\n\nAlpha"],
  ["trailing blank rows", "Alpha\n\n\n"],
  ["whitespace line between paragraphs", "Alpha\n   \nBeta"],
  ["unordered list", "- one\n- two"],
  ["nested list", "- one\n  - two\n    - three"],
  ["ordered list", "1. one\n2. two"],
  ["task list", "- [x] done\n- [ ] todo"],
  ["list continuation", "- one\n  continued\n\n- two"],
  ["list then paragraph", "- one\n\nParagraph"],
  ["loose list", "- one\n\n- two"],
  ["bare quote", ">"],
  ["quote", "> quoted"],
  ["quote with separator", "> one\n>\n> two"],
  ["nested quote", "> > deep"],
  ["quote with list", "> - item\n> - item"],
  ["quote with fence", "> ```\n> code\n> ```"],
  ["fenced code", "```ts\nconst a = 1;\n```"],
  ["unclosed fence", "```ts\nconst a = 1;"],
  ["indented code", "    const a = 1;\n    const b = 2;"],
  ["tilde fence", "~~~\ncode\n~~~"],
  ["fence inside list", "- item\n\n  ```\n  code\n  ```"],
  ["closed math block", "$$\nx = 1\n$$"],
  ["unclosed math block", "$$\nx = 1"],
  ["table", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
  ["quote table", "> | a | b |\n> | --- | --- |\n> | 1 | 2 |"],
  ["thematic break", "Alpha\n\n---\n\nBeta"],
  ["reference definition", "[label]: /target\n\nAlpha"],
  ["footnote definition", "Alpha[^n]\n\n[^n]: note"],
  ["html image", '<img src="hero.png" alt="hero">\n\nAlpha'],
  ["mixed containers", "- item\n\n  > quote\n  >\n  > ```\n  > code\n  > ```\n\nAfter"],
  ["quote inside quote list", "> - > nested\n>   > quote"],
  ["definition between blocks", "Alpha\n\n[label]: /target\n\nBeta"],
  ["fence with container prefix and blank content", "> ```\n> \n> \n> ```"]
];

// Frozen contract. Before the tree port, the same corpus was compared line by line against the
// projection-based resolver and matched completely; these values pin that behaviour after the
// projection-based implementation was deleted.
const expectedRoles: Record<string, string> = {
  "empty": "extra-blank",
  "single newline": "extra-blank|extra-blank",
  "whitespace only": "extra-blank",
  "paragraph": "paragraph",
  "paragraph with trailing newline": "paragraph|extra-blank",
  "crlf paragraphs": "paragraph|structural-separator|paragraph|extra-blank",
  "heading": "heading|structural-separator|paragraph",
  "heading only": "heading",
  "structural separator then extra blank": "paragraph|structural-separator|extra-blank|extra-blank|paragraph",
  "three blank rows": "paragraph|structural-separator|extra-blank|extra-blank|extra-blank|paragraph",
  "leading blank rows": "extra-blank|extra-blank|paragraph",
  "trailing blank rows": "paragraph|extra-blank|extra-blank|extra-blank",
  "whitespace line between paragraphs": "paragraph|extra-blank|paragraph",
  "unordered list": "list-item|list-item",
  "nested list": "list-item|list-continuation|list-continuation",
  "ordered list": "list-item|list-item",
  "task list": "list-item|list-item",
  "list continuation": "list-item|list-continuation|structural-separator|list-item",
  "list then paragraph": "list-item|structural-separator|paragraph",
  "loose list": "list-item|structural-separator|list-item",
  "bare quote": "blockquote",
  "quote": "blockquote",
  "quote with separator": "blockquote|blockquote|blockquote",
  "nested quote": "blockquote",
  "quote with list": "blockquote|blockquote",
  "quote with fence": "blockquote|blockquote|blockquote",
  "fenced code": "code-fence-boundary|code-fence-content|code-fence-boundary",
  "unclosed fence": "code-fence-boundary|code-fence-content",
  "indented code": "code-fence-boundary|code-fence-content",
  "tilde fence": "code-fence-boundary|code-fence-content|code-fence-boundary",
  "fence inside list": "list-item|list-continuation|list-continuation|list-continuation|list-continuation",
  "closed math block": "math-block-boundary|math-block-content|math-block-boundary",
  "unclosed math block": "math-block-boundary|math-block-content",
  "table": "table-source|table-source|table-source",
  "quote table": "blockquote|blockquote|blockquote",
  "thematic break": "paragraph|structural-separator|thematic-break|structural-separator|paragraph",
  "reference definition": "definition|structural-separator|paragraph",
  "footnote definition": "paragraph|structural-separator|definition",
  "html image": "html-image|structural-separator|paragraph",
  "mixed containers": "list-item|list-continuation|list-continuation|list-continuation|list-continuation|list-continuation|list-continuation|structural-separator|paragraph",
  "quote inside quote list": "blockquote|blockquote",
  "definition between blocks": "paragraph|structural-separator|definition|structural-separator|paragraph",
  "fence with container prefix and blank content": "blockquote|blockquote|blockquote|blockquote"
};

describe("canonical semantic line roles", () => {
  it.each(corpus)("resolves the canonical roles for %s", (name, source) => {
    expect(roleSummary(source)).toBe(expectedRoles[name]);
  });

  it("resolves one role per line for generated fixtures", () => {
    for (const kind of ["mixed-blocks", "plain-paragraphs"] as const) {
      const fixture = createLongMarkdownFixture({ kind, lineCount: 200 });
      const roles = roleSummary(fixture.source).split("|");

      expect(roles).toHaveLength(fixture.source.split("\n").length);
      expect(roles.every((role) => role.length > 0)).toBe(true);
    }
  });
});
