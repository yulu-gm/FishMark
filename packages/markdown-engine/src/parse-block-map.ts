import { parse, postprocess, preprocess } from "micromark";
import type { Event, Token } from "micromark-util-types";

import type {
  BlockMap,
  BlockquoteBlock,
  HeadingBlock,
  ListBlock,
  MarkdownBlock,
  ParagraphBlock
} from "./block-map";

export function parseBlockMap(source: string): BlockMap {
  const blocks: MarkdownBlock[] = [];
  let containerDepth = 0;

  for (const [kind, token] of parseEvents(source)) {
    if (kind === "enter") {
      if (token.type === "listOrdered" || token.type === "listUnordered") {
        if (containerDepth === 0) {
          blocks.push(createListBlock(token, token.type === "listOrdered"));
        }

        containerDepth += 1;
        continue;
      }

      if (token.type === "blockQuote") {
        if (containerDepth === 0) {
          blocks.push(createBlockquoteBlock(token));
        }

        containerDepth += 1;
        continue;
      }

      if (containerDepth > 0) {
        continue;
      }

      if (token.type === "atxHeading" || token.type === "setextHeading") {
        blocks.push(createHeadingBlock(token, source));
        continue;
      }

      if (token.type === "paragraph") {
        blocks.push(createParagraphBlock(token));
      }

      continue;
    }

    if (token.type === "listOrdered" || token.type === "listUnordered" || token.type === "blockQuote") {
      containerDepth -= 1;
    }
  }

  return { blocks };
}

function parseEvents(source: string): Event[] {
  return postprocess(parse().document().write(preprocess()(source, "utf8", true)));
}

function createHeadingBlock(token: Token, source: string): HeadingBlock {
  const base = createBaseBlock("heading", token);

  return {
    ...base,
    depth: getHeadingDepth(token, source)
  };
}

function createParagraphBlock(token: Token): ParagraphBlock {
  return createBaseBlock("paragraph", token);
}

function createListBlock(token: Token, ordered: boolean): ListBlock {
  return {
    ...createBaseBlock("list", token),
    ordered
  };
}

function createBlockquoteBlock(token: Token): BlockquoteBlock {
  return createBaseBlock("blockquote", token);
}

function createBaseBlock<TType extends MarkdownBlock["type"]>(
  type: TType,
  token: Token
): Extract<MarkdownBlock, { type: TType }> {
  const startOffset = token.start.offset;
  const endOffset = token.end.offset;

  return {
    id: `${type}:${startOffset}-${endOffset}`,
    type,
    startOffset,
    endOffset,
    startLine: token.start.line,
    endLine: token.end.line
  } as Extract<MarkdownBlock, { type: TType }>;
}

function getHeadingDepth(token: Token, source: string): number {
  const slice = source.slice(token.start.offset, token.end.offset);

  if (token.type === "atxHeading") {
    const match = /^\s{0,3}(#{1,6})(?:[ \t]+|$)/.exec(slice);
    const sequence = match?.[1];

    return sequence ? sequence.length : 1;
  }

  const match = /\n[ \t]{0,3}(=+|-+)[ \t]*$/.exec(slice);
  const sequence = match?.[1];

  if (!sequence) {
    return 1;
  }

  return sequence[0] === "=" ? 1 : 2;
}
