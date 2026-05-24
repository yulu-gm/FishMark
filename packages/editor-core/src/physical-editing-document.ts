import type {
  ListBlock,
  MarkdownBlock,
  MarkdownDocument
} from "@fishmark/markdown-engine";
import { blockRequiresLeadingStructuralSeparator } from "./structural-blank-lines";

export type EditingLineKind = "empty" | "whitespace" | "text";

export type EditingLine = {
  number: number;
  from: number;
  to: number;
  text: string;
  lineBreakTo: number;
  kind: EditingLineKind;
  isDocumentStart: boolean;
  isDocumentEnd: boolean;
};

export type SemanticLineRole =
  | "paragraph"
  | "heading"
  | "list-item"
  | "list-continuation"
  | "blockquote"
  | "code-fence-boundary"
  | "code-fence-content"
  | "table-source"
  | "thematic-break"
  | "definition"
  | "html-image"
  | "structural-separator"
  | "extra-blank"
  | "unparsed-text";

export type SemanticLine = {
  line: EditingLine;
  block: MarkdownBlock | null;
  role: SemanticLineRole;
};

export type SemanticLineMap = {
  lines: readonly SemanticLine[];
  byLineNumber: ReadonlyMap<number, SemanticLine>;
};

export type PhysicalEditingDocument = {
  source: string;
  lines: readonly EditingLine[];
  semanticLineMap: SemanticLineMap;
  getLineAtOffset: (offset: number) => EditingLine | null;
};

export function createPhysicalEditingDocument(
  source: string,
  markdownDocument?: MarkdownDocument
): PhysicalEditingDocument {
  const lines = createEditingLines(source);
  const semanticLineMap = createSemanticLineMap(lines, markdownDocument);

  return {
    source,
    lines,
    semanticLineMap,
    getLineAtOffset: (offset) => findLineAtOffset(lines, source, offset)
  };
}

function createEditingLines(source: string): EditingLine[] {
  if (source.length === 0) {
    return [
      {
        number: 1,
        from: 0,
        to: 0,
        text: "",
        lineBreakTo: 0,
        kind: "empty",
        isDocumentStart: true,
        isDocumentEnd: true
      }
    ];
  }

  const lines: EditingLine[] = [];
  let lineStart = 0;
  let lineNumber = 1;

  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] !== "\n") {
      continue;
    }

    const lineEnd = offset > lineStart && source[offset - 1] === "\r" ? offset - 1 : offset;
    lines.push(createEditingLine(source, lineNumber, lineStart, lineEnd, offset + 1));
    lineStart = offset + 1;
    lineNumber += 1;
  }

  lines.push(createEditingLine(source, lineNumber, lineStart, source.length, source.length));

  return lines.map((line, index) => ({
    ...line,
    isDocumentStart: index === 0,
    isDocumentEnd: index === lines.length - 1
  }));
}

function createEditingLine(
  source: string,
  number: number,
  from: number,
  to: number,
  lineBreakTo: number
): EditingLine {
  const text = source.slice(from, to);

  return {
    number,
    from,
    to,
    text,
    lineBreakTo,
    kind: classifyEditingLine(text),
    isDocumentStart: false,
    isDocumentEnd: false
  };
}

function classifyEditingLine(text: string): EditingLineKind {
  if (text.length === 0) {
    return "empty";
  }

  return /^[ \t]+$/u.test(text) ? "whitespace" : "text";
}

function findLineAtOffset(
  lines: readonly EditingLine[],
  source: string,
  offset: number
): EditingLine | null {
  const clampedOffset = Math.max(0, Math.min(offset, source.length));

  for (const line of lines) {
    if (clampedOffset >= line.from && clampedOffset <= line.to) {
      return line;
    }

    if (clampedOffset >= line.to && clampedOffset < line.lineBreakTo) {
      return line;
    }
  }

  return lines[lines.length - 1] ?? null;
}

function createSemanticLineMap(
  lines: readonly EditingLine[],
  markdownDocument: MarkdownDocument | undefined
): SemanticLineMap {
  const semanticLines = lines.map((line) => {
    const block = findBlockForLine(markdownDocument, line);

    return {
      line,
      block,
      role: resolveSemanticLineRole(line, block, markdownDocument, lines)
    };
  });

  return {
    lines: semanticLines,
    byLineNumber: new Map(semanticLines.map((line) => [line.line.number, line]))
  };
}

function findBlockForLine(
  markdownDocument: MarkdownDocument | undefined,
  line: EditingLine
): MarkdownBlock | null {
  if (!markdownDocument) {
    return null;
  }

  return markdownDocument.blocks.find((block) =>
    line.number >= block.startLine && line.number <= block.endLine
  ) ?? null;
}

function resolveSemanticLineRole(
  line: EditingLine,
  block: MarkdownBlock | null,
  markdownDocument: MarkdownDocument | undefined,
  lines: readonly EditingLine[]
): SemanticLineRole {
  if (!block) {
    if (line.kind === "text") {
      return "unparsed-text";
    }

    return isStructuralSeparator(line, markdownDocument, lines) ? "structural-separator" : "extra-blank";
  }

  switch (block.type) {
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "list":
      return resolveListLineRole(block, line);
    case "blockquote":
      return "blockquote";
    case "codeFence":
      return line.number === block.startLine || isCodeFenceClosingLine(line, block, lines)
        ? "code-fence-boundary"
        : "code-fence-content";
    case "definition":
      return "definition";
    case "thematicBreak":
      return "thematic-break";
    case "htmlImage":
      return "html-image";
    case "table":
      return "table-source";
  }
}

function isCodeFenceClosingLine(
  line: EditingLine,
  block: MarkdownBlock,
  lines: readonly EditingLine[]
): boolean {
  if (block.type !== "codeFence" || line.number !== block.endLine) {
    return false;
  }

  const openingLine = lines.find((candidate) => candidate.number === block.startLine);
  const openingFence = openingLine ? readOpeningFence(openingLine.text) : null;

  if (!openingFence) {
    return false;
  }

  const closingFencePattern = new RegExp(
    `^ {0,3}${openingFence.marker}{${openingFence.length},}[ \\t]*$`,
    "u"
  );

  return closingFencePattern.test(line.text);
}

function readOpeningFence(text: string): { marker: "`" | "~"; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(text);
  const marker = match?.[1];

  if (!marker) {
    return null;
  }

  return {
    marker: marker[0] as "`" | "~",
    length: marker.length
  };
}

function resolveListLineRole(block: ListBlock, line: EditingLine): SemanticLineRole {
  return block.items.some((item) => item.startLine === line.number)
    ? "list-item"
    : "list-continuation";
}

function isStructuralSeparator(
  line: EditingLine,
  markdownDocument: MarkdownDocument | undefined,
  lines: readonly EditingLine[]
): boolean {
  if (line.kind !== "empty" || !markdownDocument) {
    return false;
  }

  const nextBlock = markdownDocument.blocks.find((block) => block.startLine === line.number + 1);

  if (nextBlock && blockRequiresLeadingStructuralSeparator(nextBlock)) {
    return true;
  }

  if (markdownDocument.blocks.length < 2) {
    return false;
  }

  const previousBlock = [...markdownDocument.blocks]
    .reverse()
    .find((block) => block.endOffset <= line.from);
  const hasNextBlock = markdownDocument.blocks.some((block) => block.startOffset >= line.lineBreakTo);

  if (!previousBlock || !hasNextBlock) {
    return false;
  }

  const previousLineBreakCount = lines.filter(
    (candidate) =>
      candidate.lineBreakTo > previousBlock.endOffset &&
      candidate.lineBreakTo <= line.from
  ).length;

  return previousLineBreakCount === 1;
}
