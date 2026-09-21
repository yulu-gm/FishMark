import type { FootnoteDefinition, InlineReferenceDefinition } from "../inline-ast";
import { collectBlockquotePrefixSpans, type BlockquotePrefixSpans } from "../blockquote";
import type { ListItemBlock, MarkdownBlock } from "../block-map";
import { childContainerPath, ROOT_CONTAINER_PATH, type ContainerPath } from "../model/container-path";
import {
  assertMarkdownTreeInvariants,
  createMarkdownDocumentTree,
  createNodeIdForSource,
  type MarkdownDocumentTree
} from "../model/document-tree";
import {
  createMarkdownContainerNode,
  type MarkdownContainerKind,
  type MarkdownContainerNode,
  type MarkdownNode,
  type MarkdownNodeData
} from "../model/markdown-node";
import { createSourceRange, type SourceMarker, type SourceRange } from "../model/source-range";
import { createMaskedSource, type SourceText } from "../source-text";
import type { MarkdownParseOptions } from "../parse-instrumentation";
import {
  collectFootnoteDefinitionData,
  attachFootnoteDefinitionBlocks,
  type FootnoteDefinitionCandidate,
  collectReferenceDefinitions,
  enrichFootnoteDefinitions
} from "./definition-index";
import {
  createLeafNodeContext,
  createListItemContentRange,
  createNodesFromBlocks
} from "./leaf-nodes";
import { createLeafBlocksForToken, mergeLeafSiblingBlocks } from "./leaf-blocks";
import { collectMicromarkEventViews } from "./micromark-event-adapter";
import { normalizeListFrames } from "./list-frames";

// One micromark-based recursive parser. Every container child comes from the event stream and
// a container stack, so no renderer/editor/export regex scan is needed to discover nesting.
// Leaf blocks are derived by the shared leaf classifier and materialized into nodes only
// after the whole raw structure is known, which keeps container paths stable under sibling
// merges such as loose pipe tables.
export function parseFullDocumentTree(
  source: string,
  options: MarkdownParseOptions = {}
): MarkdownDocumentTree {
  const referenceDefinitions = collectReferenceDefinitions(source, options);
  const events = collectMicromarkEventViews(source, options);

  const root: RawContainer = {
    kind: "document",
    tokenType: "document",
    tokenStartOffset: 0,
    range: createSourceRange(0, source.length),
    markers: [],
    prefixes: [],
    maskedSource: source,
    data: { kind: "document" },
    children: [],
    itemPrefixes: []
  };
  const stack: RawContainer[] = [root];
  let openLeafType: string | null = null;

  for (const event of events) {
    const containerKind = CONTAINER_TOKEN_KINDS[event.type];
    if (containerKind !== undefined) {
      if (event.kind === "enter") {
        const range = createSourceRange(event.startOffset, event.endOffset);
        const blockquotePrefixes = containerKind === "blockquote"
          ? collectBlockquotePrefixSpans(source, range)
          : EMPTY_PREFIXES;
        stack.push({
          kind: containerKind,
          tokenType: event.type,
          tokenStartOffset: event.startOffset,
          range,
          markers: blockquotePrefixes.markers.map((marker) => ({
            kind: "blockquote" as const,
            range: createSourceRange(marker.markerStart, marker.markerEnd)
          })) as readonly SourceMarker[],
          prefixes: blockquotePrefixes.prefixes,
          maskedSource: containerMaskedSource(current().maskedSource, blockquotePrefixes.prefixes),
          data: initialContainerData(containerKind),
          children: [],
          itemPrefixes: []
        });
      } else {
        // An exit event carries the container's own start offset for matching and its true end
        // offset for the range, so a closed frame never loses trailing content characters.
        closeContainerFrame(event.type, event.startOffset, event.endOffset);
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
      const isFirstItem = listFrame.itemPrefixes.length === 0;
      listFrame.itemPrefixes.push(event.startOffset);
      stack.push(createListItemFrame(source, stack, listFrame, isFirstItem, event.startOffset, event.endOffset));
      continue;
    }

    if (!LEAF_TOKEN_TYPES.has(event.type)) continue;

    if (event.kind === "enter") {
      if (openLeafType !== null) continue;
      openLeafType = event.type;
      const parent = current();
      // Leaf classification runs on the container-masked source, so a table or code block inside
      // a blockquote is recognised exactly like one at the top level while offsets stay absolute.
      parent.children.push({
        type: "blocks",
        blocks: createLeafBlocksForToken(event.token, parent.maskedSource, parent.prefixes)
      });
    } else if (openLeafType === event.type) {
      openLeafType = null;
    }
  }

  closeContainerFrame("document", 0, source.length);
  normalizeListFrames(root, source);

  // Footnote definitions attach to top-level paragraph/definition blocks, so they are derived
  // from the raw top-level leaf blocks before nodes are materialized. Inline parsing of every
  // container child then sees the same definition index.
  const topLevelBlocks = mergeLeafSiblingBlocks([...topLevelLeafBlocks(root)], source);
  const footnoteData = collectFootnoteDefinitionData(source, topLevelBlocks);
  const footnoteDefinitions = enrichFootnoteDefinitions(
    footnoteData.definitions,
    source,
    referenceDefinitions,
    options
  );

  const tree = createMarkdownDocumentTree(
    materializeContainer({
      frame: root,
      path: ROOT_CONTAINER_PATH,
      source,
      referenceDefinitions,
      footnoteDefinitions,
      footnoteCandidates: footnoteData.candidates,
      options,
      maskedSource: source
    }),
    { source, referenceDefinitions, footnoteDefinitions }
  );
  assertMarkdownTreeInvariants(tree);
  return tree;

  function current(): RawContainer {
    return stack[stack.length - 1]!;
  }

  // Closes synthetic item frames until the container token being exited is the frame popped.
  function closeContainerFrame(tokenType: string, tokenStartOffset: number, endOffset: number): void {
    while (stack.length > 1) {
      const frame = current();
      closeFrame(endOffset);
      if (frame.tokenType === tokenType && frame.tokenStartOffset === tokenStartOffset) return;
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
    current().children.push({
      type: "container",
      container: { ...frame, range: createSourceRange(startOffset, trimmedEnd) }
    });
  }
}

export interface RawContainer {
  readonly kind: MarkdownContainerKind;
  readonly tokenType: string;
  readonly tokenStartOffset: number;
  readonly range: SourceRange;
  readonly markers: readonly SourceMarker[];
  // The exact prefix spans masked for this container's children. They can be wider than the
  // semantic markers (a blockquote prefix includes its padding), which is why they are
  // tracked separately from marker metadata.
  readonly prefixes: readonly SourceRange[];
  // The source with every enclosing blockquote prefix blanked out. Container children are
  // classified against it, so nesting never changes what counts as a table, fence, or heading.
  readonly maskedSource: SourceText;
  data: MarkdownNodeData;
  children: RawChild[];
  readonly itemPrefixes: number[];
  readonly itemGeometry?: ListItemGeometry;
}

export type RawChild =
  | { readonly type: "container"; readonly container: RawContainer }
  | { readonly type: "blocks"; readonly blocks: readonly MarkdownBlock[] };

type ListItemGeometry = {
  readonly marker: string;
  readonly markerStart: number;
  readonly markerEnd: number;
  readonly indent: number;
  readonly task: ListItemBlock["task"];
};

const CONTAINER_TOKEN_KINDS: Readonly<Record<string, MarkdownContainerKind>> = {
  blockQuote: "blockquote",
  listOrdered: "list",
  listUnordered: "list",
  listItem: "list-item"
};

const LEAF_TOKEN_TYPES: ReadonlySet<string> = new Set([
  "atxHeading",
  "setextHeading",
  "paragraph",
  "codeFenced",
  "codeIndented",
  "mathFlow",
  "thematicBreak",
  "definition",
  "htmlFlow"
]);

const LIST_ITEM_MARKER_PATTERN = /^(\d{1,9}[.)]|[*+-])/u;
const LIST_ITEM_TASK_PATTERN = /^\[( |x|X)\](?=[ \t]|$)/u;
const ORDERED_MARKER_PATTERN = /^(\d{1,9})([.)])/u;

// Footnote definitions can only attach to top-level paragraph/definition leaf blocks, so the
// definition index is built from exactly those blocks before any node is materialized.
function topLevelLeafBlocks(root: RawContainer): readonly MarkdownBlock[] {
  return root.children.flatMap((child) => (child.type === "blocks" ? child.blocks : []));
}

function containerMaskedSource(parentMaskedSource: SourceText, prefixes: readonly SourceRange[]): SourceText {
  return createMaskedSource(parentMaskedSource, prefixes);
}

function initialContainerData(kind: MarkdownContainerKind): MarkdownNodeData {  if (kind === "list") {
    return { kind: "list", ordered: false, startOrdinal: null, delimiter: null };
  }
  if (kind === "list-item") {
    return { kind: "list-item", marker: "", checked: null, indent: 0 };
  }
  return { kind };
}

function createListItemFrame(
  source: string,
  stack: readonly RawContainer[],
  listFrame: RawContainer,
  isFirstItem: boolean,
  prefixStart: number,
  prefixEnd: number
): RawContainer {
  const geometry = readListItemGeometry(source, stack, prefixStart, prefixEnd);

  if (isFirstItem) {
    listFrame.data = listDataForToken(listFrame.tokenType, geometry.marker);
  }

  return {
    kind: "list-item",
    tokenType: "list-item",
    tokenStartOffset: prefixStart,
    range: createSourceRange(prefixStart, Math.max(prefixEnd, listFrame.range.endOffset)),
    markers: listItemMarkers(geometry),
    prefixes: listItemMarkers(geometry).map((marker) => marker.range),
    maskedSource: listFrame.maskedSource,
    data: {
      kind: "list-item",
      marker: geometry.marker,
      checked: geometry.task ? geometry.task.checked : null,
      indent: geometry.indent
    },
    children: [],
    itemPrefixes: [],
    itemGeometry: geometry
  };
}

function readListItemGeometry(
  source: string,
  stack: readonly RawContainer[],
  prefixStart: number,
  prefixEnd: number
): ListItemGeometry {
  const lineStart = source.lastIndexOf("\n", prefixStart - 1) + 1;
  const contentBase = containerContentStart(stack, prefixStart, lineStart);
  const markerMatch = LIST_ITEM_MARKER_PATTERN.exec(source.slice(prefixStart, prefixEnd));
  const marker = markerMatch?.[0] ?? "-";
  const markerEnd = prefixStart + marker.length;
  const taskMatch = LIST_ITEM_TASK_PATTERN.exec(source.slice(prefixEnd));
  const indentCandidate = source.slice(contentBase, prefixStart);
  const indent = /^[ \t]*$/u.test(indentCandidate) ? indentCandidate.length : 0;

  return {
    marker,
    markerStart: prefixStart,
    markerEnd,
    indent,
    task: taskMatch
      ? {
          checked: taskMatch[1]?.toLowerCase() === "x",
          markerStart: prefixEnd,
          markerEnd: prefixEnd + taskMatch[0].length
        }
      : null
  };
}

// A list item's indentation is measured from the innermost ancestor container prefix on its
// line, so a list nested in a blockquote reports the same indentation the masked content would.
function containerContentStart(
  stack: readonly RawContainer[],
  prefixStart: number,
  lineStart: number
): number {
  let contentBase = lineStart;

  for (const frame of stack) {
    for (const prefix of frame.prefixes) {
      if (prefix.startOffset >= lineStart && prefix.endOffset <= prefixStart) {
        contentBase = Math.max(contentBase, prefix.endOffset);
      }
    }
  }

  return contentBase;
}

function listDataForToken(tokenType: string, marker: string): MarkdownNodeData {
  if (tokenType !== "listOrdered") {
    return { kind: "list", ordered: false, startOrdinal: null, delimiter: null };
  }

  const orderedMatch = ORDERED_MARKER_PATTERN.exec(marker);

  if (!orderedMatch) {
    return { kind: "list", ordered: true, startOrdinal: 1, delimiter: "." };
  }

  return {
    kind: "list",
    ordered: true,
    startOrdinal: Number.parseInt(orderedMatch[1] ?? "1", 10),
    delimiter: orderedMatch[2] === ")" ? ")" : "."
  };
}

function listItemMarkers(geometry: ListItemGeometry): readonly SourceMarker[] {
  const markers: SourceMarker[] = [
    { kind: "list-marker", range: createSourceRange(geometry.markerStart, geometry.markerEnd) }
  ];

  if (geometry.task) {
    markers.push({
      kind: "task-marker",
      range: createSourceRange(geometry.task.markerStart, geometry.task.markerEnd)
    });
  }

  return markers;
}

function materializeContainer(input: {
  readonly frame: RawContainer;
  readonly path: ContainerPath;
  readonly source: string;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly footnoteCandidates?: readonly FootnoteDefinitionCandidate[];
  readonly options?: MarkdownParseOptions;
  readonly maskedSource: SourceText;
}): MarkdownContainerNode {
  const children: MarkdownNode[] = [];
  const maskedSource = input.frame.maskedSource;
  const context = createLeafNodeContext({
    instrumentation: input.options?.instrumentation,
    source: input.source,
    referenceDefinitions: input.referenceDefinitions,
    footnoteDefinitions: input.footnoteDefinitions,
    maskedSource
  });
  let index = 0;
  let pendingBlocks: MarkdownBlock[] = [];
  let footnoteCandidateIndex = 0;

  const flushBlocks = () => {
    if (pendingBlocks.length === 0) return;
    const merged = mergeLeafSiblingBlocks(pendingBlocks, maskedSource);
    const candidates: FootnoteDefinitionCandidate[] = [];
    while (input.footnoteCandidates !== undefined && footnoteCandidateIndex < input.footnoteCandidates.length &&
        input.footnoteCandidates[footnoteCandidateIndex]!.startOffset < merged.at(-1)!.endOffset) {
      candidates.push(input.footnoteCandidates[footnoteCandidateIndex++]!);
    }
    const blocks = candidates.length === 0 ? merged : attachFootnoteDefinitionBlocks(
      merged, candidates, input.footnoteDefinitions, input.source
    );
    const nodes = createNodesFromBlocks({
      blocks,
      context,
      parentPath: input.path,
      startIndex: index
    });
    children.push(...nodes);
    index += nodes.length;
    pendingBlocks = [];
  };

  for (const child of input.frame.children) {
    if (child.type === "blocks") {
      pendingBlocks.push(...child.blocks);
      continue;
    }

    flushBlocks();
    children.push(materializeContainer({
      frame: child.container,
      path: childContainerPath(input.path, index),
      source: input.source,
      referenceDefinitions: input.referenceDefinitions,
      footnoteDefinitions: input.footnoteDefinitions,
      options: input.options,
      maskedSource
    }));
    index += 1;
  }

  flushBlocks();

  const range = containerRange(input.frame.range, children);
  const data = materializeContainerData(input.frame);

  return createMarkdownContainerNode({
    id: createNodeIdForSource({
      path: input.path,
      kind: input.frame.kind,
      source: input.source.slice(range.startOffset, range.endOffset)
    }),
    kind: input.frame.kind,
    path: input.path,
    source: range,
    content: input.frame.kind === "list-item" ? listItemContent(input.frame, children, input.source, range) : range,
    markers: input.frame.markers,
    data,
    children
  });
}

function materializeContainerData(frame: RawContainer): MarkdownNodeData {
  if (frame.kind !== "list-item" || frame.itemGeometry === undefined) {
    return frame.data;
  }

  return {
    kind: "list-item",
    marker: frame.itemGeometry.marker,
    checked: frame.itemGeometry.task ? frame.itemGeometry.task.checked : null,
    indent: frame.itemGeometry.indent
  };
}

function listItemContent(
  frame: RawContainer,
  children: readonly MarkdownNode[],
  source: string,
  range: SourceRange
): SourceRange {
  const geometry = frame.itemGeometry;

  return createListItemContentRange({
    source,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    markerEnd: geometry?.markerEnd ?? range.startOffset,
    task: geometry?.task ?? null,
    children
  });
}

// micromark's container token can stop before a lazily continued child line, so the node's
// source range is the union of its token range and its children.
function containerRange(frameRange: SourceRange, children: readonly MarkdownNode[]): SourceRange {
  const first = children[0];
  const last = children[children.length - 1];

  if (first === undefined || last === undefined) {
    return frameRange;
  }

  return createSourceRange(
    Math.min(frameRange.startOffset, first.source.startOffset),
    Math.max(frameRange.endOffset, last.source.endOffset)
  );
}

const EMPTY_PREFIXES: BlockquotePrefixSpans = Object.freeze({ markers: [], prefixes: [] });




