import type { FootnoteDefinition } from "./inline-ast";
import type { MarkdownDocument } from "./markdown-document";
import type { MarkdownParseOptions } from "./parse-instrumentation";
import { collectReferenceDefinitions } from "./parse/definition-index";
import { projectMarkdownDocument } from "./parse/document-projection";
import { parseFullDocumentTree } from "./parse/full-document-parser";

export { collectReferenceDefinitions };

// The rich document is one projection of the recursive tree: the tree owns structure, source
// geometry, inline ASTs, definition indexes, and footnote paragraph segmentation.
export function parseMarkdownDocument(
  source: string,
  options: MarkdownParseOptions = {}
): MarkdownDocument {
  const tree = parseFullDocumentTree(source, options);
  return createMarkdownDocumentFromTree(tree);
}

// Existing canonical trees can supply the complete rich view, including footnote segments,
// without invoking the parser again.
export function createMarkdownDocumentFromTree(tree: ReturnType<typeof parseFullDocumentTree>): MarkdownDocument {
  return projectMarkdownDocument(tree);
}

export function collectFootnoteDefinitions(
  source: string,
  options: MarkdownParseOptions = {}
): Map<string, FootnoteDefinition> {
  return new Map(parseFullDocumentTree(source, options).footnoteDefinitions);
}

