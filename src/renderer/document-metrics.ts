import {
  collectReferenceDefinitions,
  parseInlineAst,
  parseMarkdownDocument,
  type CodeFenceBlock,
  type InlineNode,
  type InlineRoot,
  type ListBlock,
  type ListItemBlock,
  type MarkdownBlock,
  type TableCell
} from "@fishmark/markdown-engine";

export type DocumentMetrics = {
  meaningfulCharacterCount: number;
};

export function getDocumentMetrics(content: string): DocumentMetrics {
  const readableText = collectReadableMarkdownText(content);
  return {
    meaningfulCharacterCount: countMeaningfulCharacters(readableText)
  };
}

function countMeaningfulCharacters(value: string): number {
  const meaningfulChars = value.match(/[^\s]/gu);
  return meaningfulChars?.length ?? 0;
}

function collectReadableMarkdownText(source: string): string {
  const referenceDefinitions = collectReferenceDefinitions(source);
  return parseMarkdownDocument(source)
    .blocks.map((block) => collectBlockReadableText(block, source, referenceDefinitions))
    .filter((text) => text.length > 0)
    .join("\n");
}

function collectBlockReadableText(
  block: MarkdownBlock,
  source: string,
  referenceDefinitions: ReturnType<typeof collectReferenceDefinitions>
): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return block.inline ? collectInlineRootReadableText(block.inline) : "";
    case "list":
      return collectListReadableText(block);
    case "blockquote":
      return block.lines?.map((line) => collectInlineRootReadableText(line.inline)).join("\n") ?? "";
    case "table":
      return [...block.header, ...block.rows.flat()]
        .map((cell) => collectTableCellReadableText(cell, source, referenceDefinitions))
        .join("\n");
    case "codeFence":
      return collectCodeFenceReadableText(block, source);
    case "blockMath":
      return block.value;
    case "htmlImage":
      return block.alt;
    case "definition":
    case "thematicBreak":
      return "";
  }
}

function collectListReadableText(block: ListBlock): string {
  return block.items.map((item) => collectListItemReadableText(item)).join("\n");
}

function collectListItemReadableText(item: ListItemBlock): string {
  return [
    item.inline ? collectInlineRootReadableText(item.inline) : "",
    ...item.children.map((child) => collectListReadableText(child))
  ]
    .filter((text) => text.length > 0)
    .join("\n");
}

function collectTableCellReadableText(
  cell: TableCell,
  source: string,
  referenceDefinitions: ReturnType<typeof collectReferenceDefinitions>
): string {
  const inline = parseInlineAst(source, cell.contentStartOffset, cell.contentEndOffset, {
    referenceDefinitions
  });
  return collectInlineRootReadableText(inline);
}

function collectInlineRootReadableText(root: InlineRoot): string {
  return root.children.map((node) => collectInlineNodeReadableText(node)).join("");
}

function collectInlineNodeReadableText(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "hardBreak":
      return "\n";
    case "codeSpan":
      return node.text;
    case "inlineMath":
      return node.value;
    case "footnoteReference":
      return node.label;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.map((child) => collectInlineNodeReadableText(child)).join("");
  }
}

function collectCodeFenceReadableText(block: CodeFenceBlock, source: string): string {
  const blockText = source.slice(block.startOffset, block.endOffset);

  if (block.kind === "indented") {
    return blockText
      .split("\n")
      .map((line) => line.replace(/^(?: {4}|\t)/u, ""))
      .join("\n");
  }

  const lines = blockText.split("\n");
  const contentLines = lines.slice(1);

  if (contentLines.length > 0 && /^\s*(`{3,}|~{3,})\s*$/u.test(contentLines[contentLines.length - 1] ?? "")) {
    contentLines.pop();
  }

  return contentLines.join("\n");
}
