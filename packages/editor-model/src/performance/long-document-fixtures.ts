export type LongMarkdownFixtureKind = "plain-paragraphs" | "mixed-blocks" | "code-fences";

export type LongMarkdownFixtureInput =
  | {
      kind: "plain-paragraphs";
      lineCount?: number;
    }
  | {
      kind: "mixed-blocks";
      lineCount?: number;
    }
  | {
      codeFenceCount?: number;
      kind: "code-fences";
    };

export type LongMarkdownFixture = {
  codeFenceCount: number;
  kind: LongMarkdownFixtureKind;
  lineCount: number;
  source: string;
};

const DEFAULT_LONG_DOCUMENT_LINE_COUNT = 5000;
const DEFAULT_CODE_FENCE_COUNT = 100;

export function countMarkdownLines(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  return source.split("\n").length;
}

export function createLongMarkdownFixture(input: LongMarkdownFixtureInput): LongMarkdownFixture {
  if (input.kind === "plain-paragraphs") {
    const lines = createPlainParagraphLines(input.lineCount ?? DEFAULT_LONG_DOCUMENT_LINE_COUNT);
    return {
      codeFenceCount: 0,
      kind: input.kind,
      lineCount: lines.length,
      source: lines.join("\n")
    };
  }

  if (input.kind === "mixed-blocks") {
    const lines = createMixedBlockLines(input.lineCount ?? DEFAULT_LONG_DOCUMENT_LINE_COUNT);
    return {
      codeFenceCount: countCodeFenceOpeners(lines),
      kind: input.kind,
      lineCount: lines.length,
      source: lines.join("\n")
    };
  }

  const lines = createCodeFenceLines(input.codeFenceCount ?? DEFAULT_CODE_FENCE_COUNT);
  return {
    codeFenceCount: input.codeFenceCount ?? DEFAULT_CODE_FENCE_COUNT,
    kind: input.kind,
    lineCount: lines.length,
    source: lines.join("\n")
  };
}

function createPlainParagraphLines(lineCount: number): string[] {
  return Array.from({ length: normalizePositiveInteger(lineCount, DEFAULT_LONG_DOCUMENT_LINE_COUNT) }, (_value, index) =>
    `Paragraph line ${index + 1} with enough words to exercise wrapping and document metrics.`
  );
}

function createMixedBlockLines(lineCount: number): string[] {
  const targetLineCount = normalizePositiveInteger(lineCount, DEFAULT_LONG_DOCUMENT_LINE_COUNT);
  const lines: string[] = [];
  let section = 1;

  while (lines.length < targetLineCount) {
    appendCapped(lines, targetLineCount, `# Section ${section}`);
    appendCapped(lines, targetLineCount, `Paragraph for section ${section} with **bold** and [link](https://example.com/${section}).`);
    appendCapped(lines, targetLineCount, `1. Ordered item ${section}.1`);
    appendCapped(lines, targetLineCount, `2. Ordered item ${section}.2`);
    appendCapped(lines, targetLineCount, `- Bullet item ${section}`);
    appendCapped(lines, targetLineCount, `> Quoted note ${section}`);
    appendCapped(lines, targetLineCount, "```ts");
    appendCapped(lines, targetLineCount, `const value${section} = ${section};`);
    appendCapped(lines, targetLineCount, "```");
    appendCapped(lines, targetLineCount, "");
    section += 1;
  }

  return lines;
}

function createCodeFenceLines(codeFenceCount: number): string[] {
  const targetCodeFenceCount = normalizePositiveInteger(codeFenceCount, DEFAULT_CODE_FENCE_COUNT);
  const lines: string[] = [];

  for (let index = 1; index <= targetCodeFenceCount; index += 1) {
    lines.push(`## Code sample ${index}`);
    lines.push("```ts");
    lines.push(`const value${index} = ${index};`);
    lines.push(`console.log(value${index});`);
    lines.push("```");
    lines.push("");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function appendCapped(lines: string[], targetLineCount: number, line: string): void {
  if (lines.length < targetLineCount) {
    lines.push(line);
  }
}

function countCodeFenceOpeners(lines: readonly string[]): number {
  return lines.filter((line) => line === "```ts").length;
}

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}
