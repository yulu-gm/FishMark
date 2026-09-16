import type { FootnoteDefinition } from "./inline-ast";
import type { MarkdownDocument } from "./markdown-document";
import type { MarkdownBlock } from "./block-map";
import type { MarkdownParseOptions } from "./parse-instrumentation";
import {
  attachFootnoteDefinitionBlocks,
  collectFootnoteDefinitionData,
  collectReferenceDefinitions
} from "./parse/definition-index";
import { projectMarkdownDocument } from "./parse/document-projection";
import { parseFullDocumentTree } from "./parse/full-document-parser";
import { parseInlineAst } from "./parse-inline-ast";

export { collectReferenceDefinitions };

// The rich document is one projection of the recursive tree: the tree owns structure, source
// geometry, inline ASTs, and the definition indexes, and this module only adds the footnote
// definition blocks that attach to top-level paragraphs.
export function parseMarkdownDocument(
  source: string,
  options: MarkdownParseOptions = {}
): MarkdownDocument {
  const tree = parseFullDocumentTree(source, options);
  const projected = projectMarkdownDocument(tree);
  const footnoteData = collectFootnoteDefinitionData(source, projected.blocks);
  const blocks = attachFootnoteDefinitionBlocks(
    projected.blocks,
    footnoteData.candidates,
    tree.footnoteDefinitions,
    source
  ).map((block) => attachSegmentInline(block, tree, source));

  return {
    blocks,
    referenceDefinitions: tree.referenceDefinitions,
    footnoteDefinitions: tree.footnoteDefinitions
  };
}

export function collectFootnoteDefinitions(
  source: string,
  options: MarkdownParseOptions = {}
): Map<string, FootnoteDefinition> {
  return new Map(parseFullDocumentTree(source, options).footnoteDefinitions);
}

// Footnote splitting can create fresh paragraph segments that no tree node covers, so any
// paragraph still missing inline data is parsed directly over its own range.
function attachSegmentInline(
  block: MarkdownBlock,
  tree: ReturnType<typeof parseFullDocumentTree>,
  source: string
): MarkdownBlock {
  if (block.type !== "paragraph" || block.inline !== undefined) {
    return block;
  }

  const endOffset = trimTrailingCarriageReturn(source, block.startOffset, block.endOffset);

  return {
    ...block,
    inline: parseInlineAst(source, block.startOffset, endOffset, {
      referenceDefinitions: tree.referenceDefinitions,
      footnoteDefinitions: tree.footnoteDefinitions
    })
  };
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  if (cursor > startOffset && source[cursor - 1] === "\r") {
    cursor -= 1;
  }

  return cursor;
}
