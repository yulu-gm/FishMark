import type { InlineRoot } from "../inline-ast";
import { parseBlockquoteLinePrefix } from "../blockquote";
import {
  childContainerPath,
  ROOT_CONTAINER_PATH,
  type ContainerPath
} from "../model/container-path";
import {
  assertMarkdownTreeInvariants,
  createContainerPrefixedSource,
  createMarkdownDocumentTree,
  createNodeIdForSource,
  type MarkdownDocumentTree
} from "../model/document-tree";
import {
  createMarkdownContainerNode,
  createMarkdownLeafNode,
  type MarkdownContainerKind,
  type MarkdownContainerNode,
  type MarkdownLeafKind,
  type MarkdownNode,
  type MarkdownNodeData
} from "../model/markdown-node";
import { createSourceRange, type SourceMarker, type SourceRange } from "../model/source-range";
import type { MarkdownParseOptions } from "../parse-instrumentation";
import { parseInlineAst } from "../parse-inline-ast";
import { collectFootnoteDefinitions, collectReferenceDefinitions } from "../parse-markdown-document";
import { collectMicromarkEventViews } from "./micromark-event-adapter";

// One micromark-based recursive parser. Every container child comes from the event stream and
// a container stack, so no renderer/editor/export regex scan is needed to discover nesting.
export function parseFullDocumentTree(
  source: string,
  options: MarkdownParseOptions = {}
): MarkdownDocumentTree {
  const events = collectMicromarkEventViews(source, options);
  const referenceDefinitions = collectReferenceDefinitions(source);
  const footnoteDefinitions = collectFootnoteDefinitions(source);

  const root: OpenFrame = {
    kind: "document",
    tokenType: "document",
    tokenStartOffset: 0,
    path: ROOT_CONTAINER_PATH,
    range: createSourceRange(0, source.length),
    markers: [],
    children: []
  };
  const stack: OpenFrame[] = [root];
  let openLeaf = false;

  for (const event of events) {
    const containerKind = CONTAINER_TOKEN_KINDS[event.type];
    if (containerKind !== undefined) {
      if (event.kind === "enter") {
        const range = createSourceRange(event.startOffset, event.endOffset);
        stack.push({
          kind: containerKind,
          tokenType: event.type,
          tokenStartOffset: event.startOffset,
          path: childContainerPath(current().path, current().children.length),
          range,
          markers: containerKind === "blockquote"
            ? collectBlockquoteMarkers(source, range)
            : [],
          children: []
        });
      } else {
        closeContainerFrame(event.type, event.startOffset);
      }
      continue;
    }

    // micromark emits `listItemPrefix` instead of a `listItem` wrapper token, so an item frame
    // opens on each direct-level prefix and closes on the next prefix or the list exit.
    if (event.type === "listItemPrefix" && event.kind === "enter") {
      if (current().kind === "list-item") {
        closeFrame(event.startOffset);
      }
      const listFrame = current();
      if (listFrame.kind !== "list") continue;
      stack.push({
        kind: "list-item",
        tokenType: "list-item",
        tokenStartOffset: event.startOffset,
        path: childContainerPath(listFrame.path, listFrame.children.length),
        range: createSourceRange(
          event.startOffset,
          Math.max(event.startOffset, listFrame.range.endOffset)
        ),
        markers: [],
        children: []
      });
      continue;
    }

    const leafKind = LEAF_TOKEN_KINDS[event.type];
    if (leafKind === undefined) continue;

    if (event.kind === "enter") {
      if (openLeaf) continue;
      const parent = current();
      parent.children.push(
        createLeafNode({
          kind: leafKind,
          path: childContainerPath(parent.path, parent.children.length),
          range: createSourceRange(event.startOffset, event.endOffset),
          source,
          referenceDefinitions,
          footnoteDefinitions,
          containerPrefixes: stack.flatMap((frame) => frame.markers.map((marker) => marker.range))
        })
      );
      openLeaf = true;
    } else if (openLeaf) {
      openLeaf = false;
    }
  }

  closeContainerFrame("document", source.length);

  const tree = createMarkdownDocumentTree(finalizeContainer(root, source));
  assertMarkdownTreeInvariants(tree);
  return tree;

  function current(): OpenFrame {
    return stack[stack.length - 1]!;
  }

  // Closes synthetic item frames until the container token being exited is the frame popped.
  function closeContainerFrame(tokenType: string, startOffset: number): void {
    while (stack.length > 1) {
      const frame = current();
      closeFrame(startOffset);
      if (frame.tokenType === tokenType && frame.tokenStartOffset === startOffset) return;
    }
  }

  // Closing trims trailing line breaks so sibling ranges never overlap the next sibling.
  function closeFrame(endOffset: number): void {
    const frame = stack.pop()!;
    const startOffset = frame.range.startOffset;
    const boundedEnd = Math.min(Math.max(endOffset, startOffset), frame.range.endOffset);
    let trimmedEnd = boundedEnd;
    while (trimmedEnd > startOffset &&
           (source[trimmedEnd - 1] === "\n" || source[trimmedEnd - 1] === "\r")) {
      trimmedEnd -= 1;
    }
    current().children.push(
      finalizeContainer({ ...frame, range: createSourceRange(startOffset, trimmedEnd) }, source)
    );
  }
}

interface OpenFrame {
  readonly kind: MarkdownContainerKind;
  readonly tokenType: string;
  readonly tokenStartOffset: number;
  readonly path: ContainerPath;
  readonly range: SourceRange;
  readonly markers: readonly SourceMarker[];
  readonly children: MarkdownNode[];
}

const CONTAINER_TOKEN_KINDS: Readonly<Record<string, MarkdownContainerKind>> = {
  blockQuote: "blockquote",
  listOrdered: "list",
  listUnordered: "list",
  listItem: "list-item"
};

const LEAF_TOKEN_KINDS: Readonly<Record<string, MarkdownLeafKind>> = {
  atxHeading: "heading",
  setextHeading: "heading",
  paragraph: "paragraph",
  codeFenced: "code-fence",
  codeIndented: "code-fence",
  mathFlow: "block-math",
  thematicBreak: "thematic-break",
  definition: "definition"
};

function finalizeContainer(frame: OpenFrame, source: string): MarkdownContainerNode {
  // micromark's container token can stop before a lazily continued child line, so the node's
  // source range is the union of its token range and its children.
  const first = frame.children[0];
  const last = frame.children[frame.children.length - 1];
  const range = first === undefined || last === undefined
    ? frame.range
    : createSourceRange(
        Math.min(frame.range.startOffset, first.source.startOffset),
        Math.max(frame.range.endOffset, last.source.endOffset)
      );
  return createMarkdownContainerNode({
    id: createNodeIdForSource({
      path: frame.path,
      kind: frame.kind,
      source: source.slice(range.startOffset, range.endOffset)
    }),
    kind: frame.kind,
    path: frame.path,
    source: range,
    content: range,
    markers: frame.markers,
    data: containerData(frame.kind),
    children: frame.children
  });
}

function containerData(kind: MarkdownContainerKind): MarkdownNodeData {
  if (kind === "list") {
    return { kind: "list", ordered: false, startOrdinal: null, delimiter: null };
  }
  if (kind === "list-item") {
    return { kind: "list-item", marker: "", checked: null };
  }
  return { kind };
}

// The `> ` prefixes of every line a blockquote covers. These are the ranges masked before
// inline parsing so inline offsets stay document offsets.
function collectBlockquoteMarkers(source: string, range: SourceRange): readonly SourceMarker[] {
  const markers: SourceMarker[] = [];
  for (const line of splitSourceLines(source, range)) {
    const prefix = parseBlockquoteLinePrefix(source, line.startOffset, line.endOffset);
    for (const marker of prefix.markers) {
      markers.push({
        kind: "blockquote",
        range: createSourceRange(marker.markerStart, marker.markerEnd)
      });
    }
  }
  return markers;
}

function splitSourceLines(source: string, range: SourceRange): readonly SourceRange[] {
  const lines: SourceRange[] = [];
  let lineStart = range.startOffset;
  for (let offset = range.startOffset; offset < range.endOffset; offset += 1) {
    if (source[offset] === "\n") {
      lines.push(createSourceRange(lineStart, offset));
      lineStart = offset + 1;
    }
  }
  lines.push(createSourceRange(lineStart, range.endOffset));
  return lines;
}

function createLeafNode(input: {
  readonly kind: MarkdownLeafKind;
  readonly path: ContainerPath;
  readonly range: SourceRange;
  readonly source: string;
  readonly referenceDefinitions: ReturnType<typeof collectReferenceDefinitions>;
  readonly footnoteDefinitions: ReturnType<typeof collectFootnoteDefinitions>;
  readonly containerPrefixes: readonly SourceRange[];
}): MarkdownNode {
  const inlineSource = input.containerPrefixes.length === 0
    ? input.source
    : createContainerPrefixedSource(input.source, input.containerPrefixes).masked;
  const inline = supportsInline(input.kind)
    ? parseInlineAst(inlineSource, input.range.startOffset, input.range.endOffset, {
        referenceDefinitions: input.referenceDefinitions,
        footnoteDefinitions: input.footnoteDefinitions
      })
    : undefined;

  return createMarkdownLeafNode({
    id: createNodeIdForSource({
      path: input.path,
      kind: input.kind,
      source: input.source.slice(input.range.startOffset, input.range.endOffset)
    }),
    kind: input.kind,
    path: input.path,
    source: input.range,
    content: input.range,
    markers: [],
    data: leafData(input.kind, input.range, input.source),
    ...(inline === undefined ? {} : { inline: inline as InlineRoot })
  });
}

function supportsInline(kind: MarkdownLeafKind): boolean {
  return kind === "paragraph" || kind === "heading";
}

function leafData(kind: MarkdownLeafKind, range: SourceRange, source: string): MarkdownNodeData {
  if (kind === "heading") {
    return { kind: "heading", depth: headingDepthAt(source, range.startOffset) };
  }
  if (kind === "code-fence") {
    return { kind: "code-fence", info: null, closed: true };
  }
  if (kind === "block-math") {
    return { kind: "block-math", closed: true };
  }
  if (kind === "table") {
    return { kind: "table", alignments: [] };
  }
  return { kind: kind as "paragraph" | "thematic-break" | "definition" | "html-image" };
}

function headingDepthAt(source: string, startOffset: number): number {
  let cursor = startOffset;
  let depth = 0;
  while (source[cursor] === "#" && depth < 6) {
    depth += 1;
    cursor += 1;
  }
  return depth === 0 ? 1 : depth;
}
