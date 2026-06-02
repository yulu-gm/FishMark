import { parse, postprocess, preprocess } from "micromark";
import { math } from "micromark-extension-math";
import type { Token } from "micromark-util-types";

import { strikethrough } from "./extensions/strikethrough";
import type {
  FootnoteDefinition,
  InlineCodeSpan,
  InlineEmphasis,
  InlineFootnoteReference,
  InlineHardBreak,
  InlineImage,
  InlineLink,
  InlineMarker,
  InlineMath,
  InlineNode,
  InlineReferenceDefinition,
  InlineRoot,
  InlineStrong,
  InlineStrikethrough,
  InlineText
} from "./inline-ast";

type ContainerKind = InlineContainerNode["type"];
type InlineContainerNode = InlineStrong | InlineEmphasis | InlineStrikethrough | InlineLink | InlineImage;

type RootEntry = {
  kind: "root";
  node: InlineRoot;
};

type ContainerEntry = {
  kind: "container";
  containerKind: ContainerKind;
  node: InlineContainerNode;
  markerCount: number;
  referenceIdentifier: string | null;
};

type CodeEntry = {
  kind: "code";
  node: InlineCodeSpan;
  markerCount: number;
  textChunks: string[];
};

type MathEntry = {
  kind: "math";
  node: InlineMath;
  markerCount: number;
  textChunks: string[];
};

type AstStackEntry = RootEntry | ContainerEntry | CodeEntry | MathEntry;

export type ParseInlineAstOptions = {
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
};

export function normalizeReferenceIdentifier(value: string): string {
  return value.trim().replace(/[\t\n\r ]+/gu, " ").toLowerCase();
}

export function parseInlineAst(
  source: string,
  startOffset: number,
  endOffset: number,
  options: ParseInlineAstOptions = {}
): InlineRoot {
  const clampedStartOffset = clampOffset(startOffset, 0, source.length);
  const clampedEndOffset = clampOffset(endOffset, clampedStartOffset, source.length);
  const sourceSlice = source.slice(clampedStartOffset, clampedEndOffset);
  const root: InlineRoot = {
    type: "root",
    startOffset: clampedStartOffset,
    endOffset: clampedEndOffset,
    children: []
  };

  if (sourceSlice.length === 0) {
    return root;
  }

  const events = postprocess(
    parse({ extensions: [math({ singleDollarTextMath: true }), strikethrough()] })
      .text()
      .write(preprocess()(sourceSlice, "utf8", true))
  );

  const stack: AstStackEntry[] = [{ kind: "root", node: root }];
  let resourceDepth = 0;
  let referenceDepth = 0;

  for (const [phase, token] of events) {
    const tokenType = token.type as string;

    if (phase === "enter") {
      if (tokenType === "resource") {
        resourceDepth += 1;
      }
      if (tokenType === "reference") {
        referenceDepth += 1;
      }

      if (tokenType === "strong") {
        stack.push({
          kind: "container",
          containerKind: "strong",
          markerCount: 0,
          referenceIdentifier: null,
          node: createContainerNode("strong", token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "emphasis") {
        stack.push({
          kind: "container",
          containerKind: "emphasis",
          markerCount: 0,
          referenceIdentifier: null,
          node: createContainerNode("emphasis", token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "strikethrough") {
        stack.push({
          kind: "container",
          containerKind: "strikethrough",
          markerCount: 0,
          referenceIdentifier: null,
          node: createContainerNode("strikethrough", token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "link") {
        stack.push({
          kind: "container",
          containerKind: "link",
          markerCount: 0,
          referenceIdentifier: null,
          node: createLinkNode(token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "image") {
        stack.push({
          kind: "container",
          containerKind: "image",
          markerCount: 0,
          referenceIdentifier: null,
          node: createImageNode(token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "codeText") {
        stack.push({
          kind: "code",
          markerCount: 0,
          textChunks: [],
          node: createCodeSpanNode(token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "mathText") {
        stack.push({
          kind: "math",
          markerCount: 0,
          textChunks: [],
          node: createInlineMathNode(token, clampedStartOffset)
        });
        continue;
      }

      if (tokenType === "strongSequence") {
        assignContainerMarker(stack, "strong", token, clampedStartOffset);
        continue;
      }

      if (tokenType === "emphasisSequence") {
        assignContainerMarker(stack, "emphasis", token, clampedStartOffset);
        continue;
      }

      if (tokenType === "strikethroughSequence") {
        assignContainerMarker(stack, "strikethrough", token, clampedStartOffset);
        continue;
      }

      if (tokenType === "labelMarker") {
        assignContainerMarker(stack, ["link", "image"], token, clampedStartOffset);
        continue;
      }

      if (tokenType === "codeTextSequence") {
        assignCodeMarker(stack, token, clampedStartOffset);
        continue;
      }

      if (tokenType === "mathTextSequence") {
        assignMathMarker(stack, token, clampedStartOffset);
        continue;
      }

      if (tokenType === "codeTextData") {
        const codeEntry = getNearestCodeEntry(stack);
        if (codeEntry) {
          codeEntry.textChunks.push(readSlice(sourceSlice, token));
        }
        continue;
      }

      if (tokenType === "mathTextData") {
        const mathEntry = getNearestMathEntry(stack);
        if (mathEntry) {
          appendMathData(mathEntry, sourceSlice, token, clampedStartOffset);
        }
        continue;
      }

      if (tokenType === "htmlTextData") {
        const value = readSlice(sourceSlice, token);
        if (isInlineHardBreakTag(value)) {
          appendNode(stack, createHardBreakNode(token, clampedStartOffset));
        }
        continue;
      }

      if (tokenType === "characterEscapeValue" && resourceDepth === 0 && referenceDepth === 0) {
        const value = readSlice(sourceSlice, token);
        if (value.length > 0) {
          appendNode(stack, {
            type: "text",
            startOffset: toAbsoluteOffset(clampedStartOffset, token.start.offset),
            endOffset: toAbsoluteOffset(clampedStartOffset, token.end.offset),
            value
          });
        }
        continue;
      }

      if (tokenType === "resourceDestination") {
        const mediaNode = getNearestMediaNode(stack);
        if (mediaNode) {
          mediaNode.href = readSlice(sourceSlice, token);
          mediaNode.destinationStartOffset = toAbsoluteOffset(clampedStartOffset, token.start.offset);
          mediaNode.destinationEndOffset = toAbsoluteOffset(clampedStartOffset, token.end.offset);
        }
        continue;
      }

      if (tokenType === "resourceTitleString") {
        const mediaNode = getNearestMediaNode(stack);
        if (mediaNode) {
          mediaNode.title = readSlice(sourceSlice, token);
          mediaNode.titleStartOffset = toAbsoluteOffset(clampedStartOffset, token.start.offset);
          mediaNode.titleEndOffset = toAbsoluteOffset(clampedStartOffset, token.end.offset);
        }
        continue;
      }

      if (tokenType === "referenceString") {
        const mediaEntry = getNearestMediaEntry(stack);
        if (mediaEntry) {
          mediaEntry.referenceIdentifier = normalizeReferenceIdentifier(readSlice(sourceSlice, token));
        }
        continue;
      }

      if (tokenType === "data" && resourceDepth === 0 && referenceDepth === 0) {
        const value = readSlice(sourceSlice, token);
        if (value.length === 0) {
          continue;
        }

        const textNode: InlineText = {
          type: "text",
          startOffset: toAbsoluteOffset(clampedStartOffset, token.start.offset),
          endOffset: toAbsoluteOffset(clampedStartOffset, token.end.offset),
          value
        };
        appendNode(stack, textNode);
      }

      continue;
    }

    if (tokenType === "resource") {
      resourceDepth = Math.max(0, resourceDepth - 1);
      continue;
    }
    if (tokenType === "reference") {
      referenceDepth = Math.max(0, referenceDepth - 1);
      continue;
    }

    if (tokenType === "strong" || tokenType === "emphasis" || tokenType === "strikethrough" || tokenType === "link" || tokenType === "image") {
      const containerKind = tokenType as ContainerKind;
      const containerEntry = popContainerEntry(stack, containerKind);
      if (containerEntry) {
        if (containerKind === "link" || containerKind === "image") {
          resolveMediaReference(containerEntry, options.referenceDefinitions);
        }
        ensureContainerMarkers(containerEntry.node);
        appendNode(stack, containerEntry.node);
      }
      continue;
    }

    if (tokenType === "codeText") {
      const codeEntry = popCodeEntry(stack);
      if (codeEntry) {
        codeEntry.node.text = codeEntry.textChunks.join("");
        ensureCodeMarkers(codeEntry.node);
        appendNode(stack, codeEntry.node);
      }
      continue;
    }

    if (tokenType === "mathText") {
      const mathEntry = popMathEntry(stack);
      if (mathEntry) {
        mathEntry.node.value = mathEntry.textChunks.join("");
        ensureMathMarkers(mathEntry.node);
        if (shouldAcceptInlineMath(mathEntry.node, source)) {
          appendNode(stack, mathEntry.node);
        } else {
          appendTextNode(stack, source, mathEntry.node.startOffset, mathEntry.node.endOffset);
        }
      }
    }
  }

  resolveReferenceMediaTextNodes(root, source, options.referenceDefinitions);
  resolveFootnoteReferenceTextNodes(root, source, options.footnoteDefinitions);
  return root;
}

function clampOffset(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toAbsoluteOffset(base: number, localOffset: number): number {
  return base + localOffset;
}

function readSlice(source: string, token: Token): string {
  return source.slice(token.start.offset, token.end.offset);
}

function createMarker(startOffset: number, endOffset: number): InlineMarker {
  return { startOffset, endOffset };
}

function createContainerNode(kind: "strong" | "emphasis" | "strikethrough", token: Token, baseOffset: number): InlineStrong | InlineEmphasis | InlineStrikethrough {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  return {
    type: kind,
    startOffset,
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset),
    children: [],
    openMarker: createMarker(startOffset, startOffset),
    closeMarker: createMarker(startOffset, startOffset)
  };
}

function createLinkNode(token: Token, baseOffset: number): InlineLink {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  return {
    type: "link",
    startOffset,
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset),
    children: [],
    openMarker: createMarker(startOffset, startOffset),
    closeMarker: createMarker(startOffset, startOffset),
    href: null,
    title: null,
    destinationStartOffset: null,
    destinationEndOffset: null,
    titleStartOffset: null,
    titleEndOffset: null
  };
}

function createImageNode(token: Token, baseOffset: number): InlineImage {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  return {
    type: "image",
    startOffset,
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset),
    children: [],
    openMarker: createMarker(startOffset, startOffset),
    closeMarker: createMarker(startOffset, startOffset),
    href: null,
    title: null,
    destinationStartOffset: null,
    destinationEndOffset: null,
    titleStartOffset: null,
    titleEndOffset: null
  };
}

function createCodeSpanNode(token: Token, baseOffset: number): InlineCodeSpan {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  return {
    type: "codeSpan",
    startOffset,
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset),
    text: "",
    openMarker: createMarker(startOffset, startOffset),
    closeMarker: createMarker(startOffset, startOffset)
  };
}

function createInlineMathNode(token: Token, baseOffset: number): InlineMath {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  return {
    type: "inlineMath",
    startOffset,
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset),
    value: "",
    contentStartOffset: startOffset,
    contentEndOffset: startOffset,
    openMarker: createMarker(startOffset, startOffset),
    closeMarker: createMarker(startOffset, startOffset)
  };
}

function createHardBreakNode(token: Token, baseOffset: number): InlineHardBreak {
  return {
    type: "hardBreak",
    startOffset: toAbsoluteOffset(baseOffset, token.start.offset),
    endOffset: toAbsoluteOffset(baseOffset, token.end.offset)
  };
}

function isInlineHardBreakTag(value: string): boolean {
  return /^<br\s*\/?>$/iu.test(value);
}

function appendNode(stack: AstStackEntry[], node: InlineNode): void {
  const parent = stack[stack.length - 1];
  if (!parent || parent.kind === "code" || parent.kind === "math") {
    return;
  }

  const siblings = parent.node.children;
  if (node.type === "text") {
    const lastNode = siblings[siblings.length - 1];
    if (lastNode?.type === "text") {
      lastNode.value += node.value;
      lastNode.endOffset = node.endOffset;
      return;
    }
  }

  siblings.push(node);
}

function appendTextNode(stack: AstStackEntry[], source: string, startOffset: number, endOffset: number): void {
  if (endOffset <= startOffset) {
    return;
  }

  appendNode(stack, {
    type: "text",
    startOffset,
    endOffset,
    value: source.slice(startOffset, endOffset)
  });
}

function assignContainerMarker(
  stack: AstStackEntry[],
  kind: ContainerKind | ContainerKind[],
  token: Token,
  baseOffset: number
): void {
  const targetKinds = Array.isArray(kind) ? kind : [kind];
  const containerEntry = [...stack]
    .reverse()
    .find(
      (entry): entry is ContainerEntry => entry.kind === "container" && targetKinds.includes(entry.containerKind)
    );

  if (!containerEntry) {
    return;
  }

  const marker = createMarker(
    toAbsoluteOffset(baseOffset, token.start.offset),
    toAbsoluteOffset(baseOffset, token.end.offset)
  );

  if (containerEntry.markerCount === 0) {
    containerEntry.node.openMarker = marker;
  } else {
    containerEntry.node.closeMarker = marker;
  }
  containerEntry.markerCount += 1;
}

function assignCodeMarker(stack: AstStackEntry[], token: Token, baseOffset: number): void {
  const codeEntry = getNearestCodeEntry(stack);
  if (!codeEntry) {
    return;
  }

  const marker = createMarker(
    toAbsoluteOffset(baseOffset, token.start.offset),
    toAbsoluteOffset(baseOffset, token.end.offset)
  );
  if (codeEntry.markerCount === 0) {
    codeEntry.node.openMarker = marker;
  } else {
    codeEntry.node.closeMarker = marker;
  }
  codeEntry.markerCount += 1;
}

function assignMathMarker(stack: AstStackEntry[], token: Token, baseOffset: number): void {
  const mathEntry = getNearestMathEntry(stack);
  if (!mathEntry) {
    return;
  }

  const marker = createMarker(
    toAbsoluteOffset(baseOffset, token.start.offset),
    toAbsoluteOffset(baseOffset, token.end.offset)
  );
  if (mathEntry.markerCount === 0) {
    mathEntry.node.openMarker = marker;
    mathEntry.node.contentStartOffset = marker.endOffset;
    mathEntry.node.contentEndOffset = marker.endOffset;
  } else {
    mathEntry.node.closeMarker = marker;
  }
  mathEntry.markerCount += 1;
}

function appendMathData(mathEntry: MathEntry, sourceSlice: string, token: Token, baseOffset: number): void {
  const startOffset = toAbsoluteOffset(baseOffset, token.start.offset);
  const endOffset = toAbsoluteOffset(baseOffset, token.end.offset);

  mathEntry.textChunks.push(readSlice(sourceSlice, token));
  if (mathEntry.node.contentEndOffset <= mathEntry.node.contentStartOffset) {
    mathEntry.node.contentStartOffset = startOffset;
  }
  mathEntry.node.contentEndOffset = endOffset;
}

function popContainerEntry(stack: AstStackEntry[], kind: ContainerKind): ContainerEntry | null {
  const entry = stack[stack.length - 1];
  if (!entry || entry.kind !== "container" || entry.containerKind !== kind) {
    return null;
  }

  stack.pop();
  return entry;
}

function popCodeEntry(stack: AstStackEntry[]): CodeEntry | null {
  const entry = stack[stack.length - 1];
  if (!entry || entry.kind !== "code") {
    return null;
  }

  stack.pop();
  return entry;
}

function popMathEntry(stack: AstStackEntry[]): MathEntry | null {
  const entry = stack[stack.length - 1];
  if (!entry || entry.kind !== "math") {
    return null;
  }

  stack.pop();
  return entry;
}

function getNearestCodeEntry(stack: AstStackEntry[]): CodeEntry | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (entry?.kind === "code") {
      return entry;
    }
  }

  return null;
}

function getNearestMathEntry(stack: AstStackEntry[]): MathEntry | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (entry?.kind === "math") {
      return entry;
    }
  }

  return null;
}

function getNearestMediaNode(stack: AstStackEntry[]): InlineLink | InlineImage | null {
  return (getNearestMediaEntry(stack)?.node as InlineLink | InlineImage | undefined) ?? null;
}

function getNearestMediaEntry(stack: AstStackEntry[]): ContainerEntry | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (
      entry?.kind === "container" &&
      (entry.containerKind === "link" || entry.containerKind === "image")
    ) {
      return entry;
    }
  }

  return null;
}

function resolveMediaReference(
  entry: ContainerEntry,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition> | undefined
): void {
  if (!referenceDefinitions || (entry.containerKind !== "link" && entry.containerKind !== "image")) {
    return;
  }

  const node = entry.node as InlineLink | InlineImage;
  if (node.href !== null) {
    return;
  }

  const identifier = entry.referenceIdentifier ?? normalizeReferenceIdentifier(readInlineText(node.children));
  const definition = referenceDefinitions.get(identifier);
  if (!definition) {
    return;
  }

  node.href = definition.href;
  node.title = definition.title;
  node.destinationStartOffset = definition.destinationStartOffset;
  node.destinationEndOffset = definition.destinationEndOffset;
  node.titleStartOffset = definition.titleStartOffset;
  node.titleEndOffset = definition.titleEndOffset;
}

function readInlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => readInlineNodeText(node)).join("");
}

function readInlineNodeText(node: InlineNode): string {
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
      return readInlineText(node.children);
  }
}

function resolveReferenceMediaTextNodes(
  root: InlineRoot | InlineContainerNode,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition> | undefined
): void {
  if (!referenceDefinitions || referenceDefinitions.size === 0) {
    return;
  }

  root.children = root.children.flatMap((node) => {
    if (
      node.type === "codeSpan" ||
      node.type === "hardBreak" ||
      node.type === "inlineMath" ||
      node.type === "footnoteReference"
    ) {
      return [node];
    }

    if (node.type !== "text") {
      resolveReferenceMediaTextNodes(node, source, referenceDefinitions);
      return [node];
    }

    return splitReferenceMediaTextNode(node, source, referenceDefinitions);
  });
}

function splitReferenceMediaTextNode(
  node: InlineText,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>
): InlineNode[] {
  const replacements: InlineNode[] = [];
  let cursor = 0;
  const pattern = /(!?)\[([^\]\n]*)\](?:\[([^\]\n]*)\])?/gu;

  for (const match of node.value.matchAll(pattern)) {
    if (typeof match.index !== "number") {
      continue;
    }

    const marker = match[1] ?? "";
    const label = match[2] ?? "";
    const explicitReference = match[3];
    const nextCharacter = node.value[match.index + match[0].length] ?? "";

    if (explicitReference === undefined && (nextCharacter === "(" || nextCharacter === "[")) {
      continue;
    }

    const referenceLabel = explicitReference && explicitReference.length > 0 ? explicitReference : label;
    const definition = referenceDefinitions.get(normalizeReferenceIdentifier(referenceLabel));
    if (!definition) {
      continue;
    }

    const matchStartOffset = node.startOffset + match.index;
    const matchEndOffset = matchStartOffset + match[0].length;

    if (match.index > cursor) {
      replacements.push({
        type: "text",
        startOffset: node.startOffset + cursor,
        endOffset: matchStartOffset,
        value: node.value.slice(cursor, match.index)
      });
    }

    replacements.push(
      createReferenceMediaNode({
        definition,
        endOffset: matchEndOffset,
        isImage: marker === "!",
        labelEndOffset: matchStartOffset + marker.length + 1 + label.length,
        labelStartOffset: matchStartOffset + marker.length + 1,
        source,
        startOffset: matchStartOffset
      })
    );
    cursor = match.index + match[0].length;
  }

  if (replacements.length === 0) {
    return [node];
  }

  if (cursor < node.value.length) {
    replacements.push({
      type: "text",
      startOffset: node.startOffset + cursor,
      endOffset: node.endOffset,
      value: node.value.slice(cursor)
    });
  }

  return replacements;
}

function resolveFootnoteReferenceTextNodes(
  root: InlineRoot | InlineContainerNode,
  source: string,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition> | undefined
): void {
  if (!footnoteDefinitions || footnoteDefinitions.size === 0) {
    return;
  }

  root.children = root.children.flatMap((node) => {
    if (
      node.type === "codeSpan" ||
      node.type === "hardBreak" ||
      node.type === "inlineMath" ||
      node.type === "footnoteReference"
    ) {
      return [node];
    }

    if (node.type !== "text") {
      resolveFootnoteReferenceTextNodes(node, source, footnoteDefinitions);
      return [node];
    }

    return splitFootnoteReferenceTextNode(node, source, footnoteDefinitions);
  });
}

function splitFootnoteReferenceTextNode(
  node: InlineText,
  source: string,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): InlineNode[] {
  const replacements: InlineNode[] = [];
  let cursor = 0;
  const pattern = /\[\^([^\]\n\r]+)\]/gu;

  for (const match of node.value.matchAll(pattern)) {
    if (typeof match.index !== "number") {
      continue;
    }

    const label = match[1] ?? "";
    const identifier = normalizeReferenceIdentifier(label);

    if (identifier.length === 0 || !footnoteDefinitions.has(identifier)) {
      continue;
    }

    const matchStartOffset = node.startOffset + match.index;
    const matchEndOffset = matchStartOffset + match[0].length;

    if (
      isLikelyLinkReferenceSecondLabel(node.value, match.index) ||
      isFootnoteDefinitionLikeReference(source, matchStartOffset, matchEndOffset)
    ) {
      continue;
    }

    if (match.index > cursor) {
      replacements.push({
        type: "text",
        startOffset: node.startOffset + cursor,
        endOffset: matchStartOffset,
        value: node.value.slice(cursor, match.index)
      });
    }

    replacements.push(createFootnoteReferenceNode(matchStartOffset, matchEndOffset, identifier, label));
    cursor = match.index + match[0].length;
  }

  if (replacements.length === 0) {
    return [node];
  }

  if (cursor < node.value.length) {
    replacements.push({
      type: "text",
      startOffset: node.startOffset + cursor,
      endOffset: node.endOffset,
      value: node.value.slice(cursor)
    });
  }

  return replacements;
}

function createFootnoteReferenceNode(
  startOffset: number,
  endOffset: number,
  identifier: string,
  label: string
): InlineFootnoteReference {
  const labelStartOffset = startOffset + 2;
  const labelEndOffset = endOffset - 1;

  return {
    type: "footnoteReference",
    startOffset,
    endOffset,
    identifier,
    label,
    labelStartOffset,
    labelEndOffset,
    openMarker: createMarker(startOffset, labelStartOffset),
    closeMarker: createMarker(labelEndOffset, endOffset)
  };
}

function isLikelyLinkReferenceSecondLabel(value: string, matchIndex: number): boolean {
  return matchIndex > 0 && value[matchIndex - 1] === "]";
}

function isFootnoteDefinitionLikeReference(source: string, matchStartOffset: number, matchEndOffset: number): boolean {
  if (source[matchEndOffset] !== ":") {
    return false;
  }

  const previousLineBreakOffset = source.lastIndexOf("\n", Math.max(0, matchStartOffset - 1));
  const lineStartOffset = previousLineBreakOffset === -1 ? 0 : previousLineBreakOffset + 1;
  return /^[ \t]{0,3}$/u.test(source.slice(lineStartOffset, matchStartOffset));
}

function createReferenceMediaNode(input: {
  definition: InlineReferenceDefinition;
  endOffset: number;
  isImage: boolean;
  labelEndOffset: number;
  labelStartOffset: number;
  source: string;
  startOffset: number;
}): InlineLink | InlineImage {
  const children = parseInlineAst(input.source, input.labelStartOffset, input.labelEndOffset).children;
  const common = {
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    children:
      children.length > 0
        ? children
        : [
            {
              type: "text" as const,
              startOffset: input.labelStartOffset,
              endOffset: input.labelEndOffset,
              value: input.source.slice(input.labelStartOffset, input.labelEndOffset)
            }
          ],
    openMarker: createMarker(input.labelStartOffset - 1, input.labelStartOffset),
    closeMarker: createMarker(input.labelEndOffset, input.labelEndOffset + 1),
    href: input.definition.href,
    title: input.definition.title,
    destinationStartOffset: input.definition.destinationStartOffset,
    destinationEndOffset: input.definition.destinationEndOffset,
    titleStartOffset: input.definition.titleStartOffset,
    titleEndOffset: input.definition.titleEndOffset
  };

  return input.isImage ? { ...common, type: "image" } : { ...common, type: "link" };
}

function ensureContainerMarkers(node: InlineContainerNode): void {
  if (node.closeMarker.startOffset === node.closeMarker.endOffset) {
    node.closeMarker = { ...node.openMarker };
  }
}

function ensureCodeMarkers(node: InlineCodeSpan): void {
  if (node.closeMarker.startOffset === node.closeMarker.endOffset) {
    node.closeMarker = { ...node.openMarker };
  }
}

function ensureMathMarkers(node: InlineMath): void {
  if (node.closeMarker.startOffset === node.closeMarker.endOffset) {
    node.closeMarker = { ...node.openMarker };
  }
}

function shouldAcceptInlineMath(node: InlineMath, source: string): boolean {
  if (node.value.trim().length === 0) {
    return false;
  }

  if (node.openMarker.endOffset >= node.closeMarker.startOffset) {
    return false;
  }

  return !isLikelyCurrencyInlineMath(node, source);
}

function isLikelyCurrencyInlineMath(node: InlineMath, source: string): boolean {
  const markerLength = node.openMarker.endOffset - node.openMarker.startOffset;
  const value = node.value.trim();

  if (markerLength !== 1 || !/^\d/u.test(value)) {
    return false;
  }

  const previousCharacter = source[node.startOffset - 1] ?? "";
  const nextCharacter = source[node.endOffset] ?? "";
  const looksLikePlainAmount = !/[\\^_=+\-*/{}()[\]]/u.test(value);

  return /[0-9]/u.test(nextCharacter) || (looksLikePlainAmount && isCurrencyBoundary(previousCharacter));
}

function isCurrencyBoundary(character: string): boolean {
  return character.length === 0 || /\s/u.test(character);
}
