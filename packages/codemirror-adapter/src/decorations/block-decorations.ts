import { Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { type Range } from "@codemirror/state";
import type { EditorDerivedSnapshot, PhysicalLine } from "@fishmark/editor-model";
import { buildRenderPlan, consumeHorizontalSpace, createInactiveBlockquoteDepthClass, createListLineAttributes, resolveListItemMarkerContentStartOffset, type RenderPlan, type RenderPlanEntry } from "@fishmark/markdown-presentation";
import { canonicalLeafView } from "./canonical-leaf-view";

import {
  type FootnoteDefinition,
  type DefinitionBlock,
  type ListItemBlock,
  type InlineReferenceDefinition,
  type BlockquoteMarker
} from "@fishmark/markdown-engine";
import { childrenOf, isMarkdownLeafNode, type MarkdownBlock, type MarkdownNode } from "@fishmark/markdown-engine";

import type { ActiveBlockState } from "@fishmark/editor-model";
import { getInactiveCodeFenceLines } from "@fishmark/editor-model";
import { appendCodeHighlightRanges } from "./code-highlight";
import {
  createActiveInlineDecorations,
  createInactiveInlineDecorations
} from "./inline-decorations";
import {
  createActiveHtmlImagePreviewDecoration,
  createActiveInlineImageDecorations,
  createInactiveHtmlImagePreviewDecoration
} from "./image-widgets";
import { createTableWidgetDecoration, type TableWidgetCallbacks } from "./table-widget";
import { createInactiveBlockMathPreviewDecoration } from "./math-widgets";
import { createInactiveMermaidPreviewDecoration, isMermaidCodeFence } from "./mermaid-widgets";
import {
  createLineInfosInRange,
  resolveLineStartOffset,
  trimTrailingCarriageReturn
} from "@fishmark/editor-model";
import { nodeRequiresLeadingStructuralSeparator } from "@fishmark/editor-model";
import {
  createSemanticEditingDocument as createPhysicalEditingDocument,
  type EditingLine,
  type SemanticEditingDocument as PhysicalEditingDocument,
  type SemanticLineRole
} from "@fishmark/editor-model";
import type { EditorViewMode } from "../editor-view-mode";
import { headingMarkerAt, headingMarkerIsVisible, type HeadingMarkerPresentation } from "../heading-marker-presentation";


export type CreateBlockDecorationsOptions = {
  snapshot: EditorDerivedSnapshot;
  activeBlockState: ActiveBlockState;
  activeLine?: EditingLine;
  editingDocument?: PhysicalEditingDocument;
  hasEditorFocus: boolean;
  source: string;
  referenceDefinitions?: ReadonlyMap<string, InlineReferenceDefinition>;
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  headingMarkerPresentation?: HeadingMarkerPresentation;
  viewMode?: EditorViewMode;
};

export type BlockDecorationsResult = {
  decorationSet: DecorationSet;
  signature: string;
};

export type SelectionScopedBlockDecorationsResult = BlockDecorationsResult & {
  didUpdateDecorations: boolean;
};

export type CreateSelectionScopedBlockDecorationsOptions = CreateBlockDecorationsOptions & {
  baseDecorationSet: DecorationSet;
  previousActiveBlockState: ActiveBlockState;
  previousActiveLine?: EditingLine;
};

// Widget and preview paths consume this DTO; it is built from the canonical leaf node, not from
// the rich projection.
type DecoratableBlock = MarkdownBlock;

type BlockDecorationContainerContext =
  | {
      readonly type: "blockquote";
      readonly depth: number;
    }
  | null;

type BlockDecorationContext = {
  snapshot: EditorDerivedSnapshot;
  plan: RenderPlan;
  activeBlockState: ActiveBlockState;
  activeLine: EditingLine;
  editingDocument: PhysicalEditingDocument;
  activeRootNodeId: string | null;
  activeTableCursor: ActiveBlockState["tableCursor"];
  activeCodeFenceInContentEdit: boolean;
  activeListLineStart: number | null;
  activeSelectionLineStart: number | null;
  hasEditorFocus: boolean;
  source: string;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  tableWidgetCallbacks?: TableWidgetCallbacks | null;
  headingMarkerPresentation?: HeadingMarkerPresentation;
  viewMode: EditorViewMode;
};

export function createBlockDecorations(
  options: CreateBlockDecorationsOptions
): BlockDecorationsResult {
  const context = createBlockDecorationContext(options);
  const ranges: Range<Decoration>[] = [];
  const signatures: string[] = [
    createActiveDecorationSignature(context)
  ];

  appendPhysicalLineDecorations(context, ranges);

  if (context.viewMode === "source") {
    return {
      decorationSet: Decoration.set(ranges, true),
      signature: signatures.join("|")
    };
  }

  appendInactiveBlankLineDecorations(
    context.source,
    childrenOf(context.snapshot.tree.root),
    context.activeSelectionLineStart,
    ranges
  );

  for (const node of childrenOf(context.snapshot.tree.root)) {
    appendDecorationsForNode(node, context, ranges, signatures);
  }

  return {
    decorationSet: Decoration.set(ranges, true),
    signature: signatures.join("|")
  };
}

export function createSelectionScopedBlockDecorations(
  options: CreateSelectionScopedBlockDecorationsOptions
): SelectionScopedBlockDecorationsResult {
  if (!options.hasEditorFocus) {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(createBlockDecorationContext(options)),
      didUpdateDecorations: false
    };
  }

  const context = createBlockDecorationContext(options);
  const shouldRefreshPhysicalLineDecorations =
    options.previousActiveLine?.number !== context.activeLine.number ||
    options.previousActiveLine?.from !== context.activeLine.from;
  const shouldRefreshWhitespaceOnlyActiveLine = shouldRefreshWhitespaceOnlyLineDecorations(
    context.source,
    options.previousActiveBlockState.selection.head,
    options.activeBlockState.selection.head,
    context.hasEditorFocus
  );

  if (shouldRefreshPhysicalLineDecorations || shouldRefreshWhitespaceOnlyActiveLine) {
    const refreshed = createBlockDecorations({
      snapshot: options.snapshot,
      activeBlockState: options.activeBlockState,
      activeLine: context.activeLine,
      editingDocument: context.editingDocument,
      hasEditorFocus: options.hasEditorFocus,
      source: options.source,
      referenceDefinitions: options.referenceDefinitions,
      footnoteDefinitions: options.footnoteDefinitions,
      resolveImagePreviewUrl: options.resolveImagePreviewUrl,
      tableWidgetCallbacks: options.tableWidgetCallbacks,
      headingMarkerPresentation: options.headingMarkerPresentation,
      viewMode: options.viewMode
    });

    return {
      ...refreshed,
      didUpdateDecorations: true
    };
  }

  const affectedNodes = collectSelectionAffectedNodes(
    options.previousActiveBlockState,
    options.activeBlockState
  );

  if (context.viewMode === "source") {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(context),
      didUpdateDecorations: false
    };
  }

  if (affectedNodes.length === 0) {
    return {
      decorationSet: options.baseDecorationSet,
      signature: createScopedSelectionSignature(context),
      didUpdateDecorations: false
    };
  }

  let decorationSet = options.baseDecorationSet;

  for (const node of affectedNodes) {
    const blockRanges: Range<Decoration>[] = [];
    const span = createBlockDecorationSpan(node);

    appendDecorationsForNode(node, context, blockRanges);
    decorationSet = decorationSet.update({
      filterFrom: span.from,
      filterTo: span.to,
      filter: (from, to) => !rangeTouchesSpan(from, to, span),
      add: blockRanges,
      sort: true
    });
  }

  return {
    decorationSet,
    signature: createScopedSelectionSignature(context),
    didUpdateDecorations: true
  };
}

function createBlockDecorationContext(
  options: CreateBlockDecorationsOptions
): BlockDecorationContext {
  const {
    activeBlockState,
    hasEditorFocus,
    source,
    resolveImagePreviewUrl,
    tableWidgetCallbacks
  } = options;
  const editingDocument = options.editingDocument ??
    createPhysicalEditingDocument(options.snapshot.document, options.snapshot);
  const activeLine = options.activeLine ??
    editingDocument.getLineAtOffset(activeBlockState.selection.head) ??
    editingDocument.lines[0]!;
  const activeRootNodeId = hasEditorFocus ? activeBlockState.activeRootNodeId : null;
  const activeRootNode = activeRootNodeId === null ? null : options.snapshot.nodeById(activeRootNodeId);
  const activeCodeFenceInContentEdit =
    hasEditorFocus &&
    activeRootNode?.kind === "code-fence" &&
    isCodeFenceContentSelection(activeRootNode, activeBlockState.selection.head, source);
  const activeListLineStart =
    hasEditorFocus && activeRootNode?.kind === "list"
      ? resolveLineStartOffset(source, activeBlockState.selection.head)
      : null;
  const activeSelectionLineStart = hasEditorFocus
    ? resolveLineStartOffset(source, activeBlockState.selection.head)
    : null;
  return {
    snapshot: options.snapshot,
    plan: buildRenderPlan(options.snapshot.tree, { revision: options.snapshot.revision }),
    activeBlockState,
    activeLine,
    editingDocument,
    activeRootNodeId,
    activeTableCursor: activeBlockState.tableCursor,
    activeCodeFenceInContentEdit,
    activeListLineStart,
    activeSelectionLineStart,
    hasEditorFocus,
    source,
    resolveImagePreviewUrl,
    tableWidgetCallbacks,
    headingMarkerPresentation: options.headingMarkerPresentation,
    viewMode: options.viewMode ?? "wysiwym"
  };
}

function appendCanonicalContainerDecorations(
  root: MarkdownNode,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[]
): void {
  const { snapshot, plan, source } = context;
  const entries: RenderPlanEntry[] = [];
  const visit = (entry: RenderPlanEntry): void => {
    entries.push(entry);
    for (const child of plan.childrenOf(entry.node.id)) visit(child);
  };
  visit(plan.entryByNodeId.get(root.id)!);
  const ids = new Set(entries.map(entry => entry.node.id));
  const firstLine = snapshot.lineAt(root.source.startOffset)!;
  const lastLine = snapshot.lineAt(Math.max(root.source.startOffset, root.source.endOffset - 1))!;
  const lines = snapshot.document.lines.slice(firstLine.lineNumber - 1, lastLine.lineNumber)
    .filter(line => line.nodeId !== null && ids.has(line.nodeId));
  const linesByNode = new Map<string, PhysicalLine[]>();
  for (const line of lines) {
    if (line.nodeId === null) continue;
    const nodeLines = linesByNode.get(line.nodeId);
    if (nodeLines) nodeLines.push(line);
    else linesByNode.set(line.nodeId, [line]);
  }
  for (const line of lines) {
    const entry = line.nodeId === null ? undefined : plan.entryByNodeId.get(line.nodeId);
    if (!entry) continue;
    const ancestors = [...plan.ancestorsOf(entry.node.id), entry];
    const quotes = ancestors.filter(value => value.node.kind === "blockquote");
    const item = ancestors.findLast(value => value.node.kind === "list-item")?.node;
    const active = context.activeSelectionLineStart === line.range.startOffset;
    const quoteMarkers = line.segments.filter(segment => segment.kind === "quote-marker");
    if (quotes.length > 0) {
      const markers = quoteMarkers.map(marker => ({ markerStart: marker.range.startOffset, markerEnd: marker.range.endOffset }));
      const markerEnd = markers.at(-1)?.markerEnd ?? line.range.startOffset;
      const nextPrefix = line.segments.find(segment => segment.range.startOffset >= markerEnd &&
        segment.kind !== "spacing" && segment.kind !== "quote-marker");
      const quoteContentStart = nextPrefix?.range.startOffset ?? line.contentStartOffset;
      const draft = active ? resolveActiveDraftBlockquoteMarker({ lineStartOffset: line.range.startOffset,
        markerEndOffset: markerEnd, contentStartOffset: quoteContentStart,
        contentEndOffset: line.contentEndOffset, markers }, context.activeBlockState.selection) : null;
      const depth = draft?.quoteDepth ?? quotes.length;
      if (depth > 0) {
        const classes = ["cm-inactive-blockquote", createInactiveBlockquoteDepthClass(depth)];
        if (line.role === "separator" || (line.role !== "fence-content" && markerEnd === line.contentStartOffset && line.contentStartOffset === line.contentEndOffset && draft === null)) classes.push("cm-inactive-blockquote-separator");
        if (line.role === "fence-content") classes.push("cm-blockquote-code-content");
        if (snapshot.lineAt(quotes[0]!.node.source.startOffset)?.lineNumber === line.lineNumber) classes.push("cm-inactive-blockquote-start");
        if (snapshot.lineAt(Math.max(quotes[0]!.node.source.startOffset, quotes[0]!.node.source.endOffset - 1))?.lineNumber === line.lineNumber) classes.push("cm-inactive-blockquote-end");
        ranges.push(Decoration.line({ attributes: { class: classes.join(" ") } }).range(line.range.startOffset));
        if (active && draft) appendActiveDraftBlockquoteSourcePrefixDecorations(line.range.startOffset, draft, ranges);
        else if (active) appendActiveBlockquoteSourcePrefixDecorations(line.range.startOffset, markerEnd, quoteContentStart, ranges);
        else appendSourcePrefixMark(line.range.startOffset, quoteContentStart, "cm-inactive-blockquote-marker", ranges);
      }
    }
    if (item?.data.kind === "list-item") {
      const marker = item.markers.find(value => value.kind === "list-marker")?.range;
      if (!marker) continue;
      const task = item.markers.find(value => value.kind === "task-marker")?.range;
      const first = snapshot.lineAt(item.source.startOffset)!;
      const parentList = plan.ancestorsOf(item.id).findLast(value => value.node.kind === "list")?.node;
      const ordered = parentList?.data.kind === "list" && parentList.data.ordered;
      const view: ListItemBlock = { id: item.id, startOffset: first.range.startOffset,
        endOffset: item.source.endOffset, startLine: first.lineNumber, endLine: line.lineNumber,
        indent: 2 * Math.max(0, ancestors.filter(value => value.node.kind === "list-item").length - 1),
        marker: item.data.marker, markerStart: marker.startOffset, markerEnd: marker.endOffset,
        contentStartOffset: first.contentStartOffset, children: [],
        task: task && item.data.checked !== null ? { checked: item.data.checked, markerStart: task.startOffset, markerEnd: task.endOffset } : null };
      if (line.lineNumber === first.lineNumber) {
        const prefix = { from: view.markerStart, to: resolveListItemContentStartOffset(view, source) };
        if (headingMarkerIsVisible(prefix, context.activeBlockState.selection, context.hasEditorFocus,
          context.headingMarkerPresentation)) appendActiveListItemFirstLineDecorations(view, source, ordered, ranges);
        else appendInactiveListItemFirstLineDecorations(view, source, ordered, ranges);
      } else {
        const mode = active ? "active" : "inactive";
        // Leading list indentation and canonical indentation after an outer quote belong to the
        // list. Quote markers and their padding anchors stay in flow, including on bare quote rows.
        const sourcePrefixEndOffset = consumeHorizontalSpace(source, line.range.startOffset, line.contentEndOffset);
        const sourcePrefixLength = sourcePrefixEndOffset - line.range.startOffset;
        const sourcePrefixClassName = `cm-${mode}-list-source-prefix`;
        ranges.push(Decoration.line({ attributes: createListItemLineAttributes(mode, view, source, ordered,
          "continuation", sourcePrefixLength) }).range(line.range.startOffset));
        appendSourcePrefixMark(line.range.startOffset, sourcePrefixEndOffset, sourcePrefixClassName, ranges);
        const quoteEndOffset = quoteMarkers.at(-1)?.range.endOffset;
        if (quoteEndOffset !== undefined && (entry.node.kind === "paragraph" || entry.node.kind === "heading")) for (const segment of line.segments) {
          if (segment.kind === "indentation" && segment.range.startOffset >= quoteEndOffset) {
            appendSourcePrefixMark(segment.range.startOffset, segment.range.endOffset, sourcePrefixClassName, ranges);
          }
        }
      }
    }
  }
  for (const entry of entries) {
    const node = entry.node;
    if (!isMarkdownLeafNode(node)) continue;
    if (node.kind === "paragraph" || node.kind === "heading") {
      const ancestors = plan.ancestorsOf(node.id);
      // A container line (list item or blockquote) already owns the line box: its indent, rail and
      // leading. A nested leaf contributes text presentation only and never overrides those.
      const inContainer = ancestors.some(value => value.node.kind === "list-item" || value.node.kind === "blockquote");
      const firstLine = snapshot.lineAt(node.source.startOffset)!;
      const nodeLines = linesByNode.get(node.id) ?? [];
      const leafActive = nodeLines.some(line => context.activeSelectionLineStart === line.range.startOffset);
      if (node.data.kind === "heading") {
        // Leaf typography and source-marker visibility are independent.
        const mode = leafActive ? "active" : "inactive";
        ranges.push(Decoration.line({ attributes: {
          class: `cm-${mode}-heading cm-${mode}-heading-depth-${node.data.depth}`
        } }).range(firstLine.range.startOffset));
        appendHeadingMarker(node.source.startOffset, context, ranges);
      } else if (!inContainer && !leafActive) {
        ranges.push(Decoration.line({ attributes: {
          class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
        } }).range(firstLine.range.startOffset));
      }
      const options = inlinePresentationOptions(context);
      const inactive = createInactiveInlineDecorations(node.inline, options);
      const active = [...createActiveInlineDecorations(node.inline, options), ...createActiveInlineImageDecorations(node.inline, source, context.resolveImagePreviewUrl)];
      for (const line of nodeLines) {
        appendClippedInlineDecorations(
          context.activeSelectionLineStart === line.range.startOffset ? active : inactive,
          line,
          ranges
        );
      }
      continue;
    }
    const quoteDepth = plan.ancestorsOf(node.id).filter(value => value.node.kind === "blockquote").length;
    const activeLine = context.activeSelectionLineStart;
    if (activeLine !== null && node.kind !== "table" &&
      snapshot.lineAt(node.source.startOffset)!.range.startOffset <= activeLine && activeLine < node.source.endOffset) {
      appendActiveDecorationsForBlock(canonicalLeafView(node, snapshot), source, ranges, context.resolveImagePreviewUrl);
      continue;
    }
    appendInactiveDecorationsForBlock(canonicalLeafView(node, snapshot), context, ranges, signatures,
      quoteDepth > 0 ? { type: "blockquote", depth: quoteDepth } : null, true);
  }
}

// A canonical inline decoration spans the whole leaf, so each physical line presents only its own
// part of it. Marks split at a soft line break; a point widget belongs to the line it sits on and
// must survive clipping; a replaced span cannot be split without duplicating its widget, so the
// surrounding text stays visible instead.
function appendClippedInlineDecorations(
  decorations: readonly Range<Decoration>[],
  line: PhysicalLine,
  ranges: Range<Decoration>[]
): void {
  for (const range of decorations) {
    if (range.from === range.to) {
      if (range.from >= line.contentStartOffset && range.from <= line.contentEndOffset) {
        ranges.push(range.value.range(range.from, range.from));
      }
      continue;
    }
    if (range.from >= line.contentStartOffset && range.to <= line.contentEndOffset) {
      ranges.push(range.value.range(range.from, range.to));
      continue;
    }
    if (isWidgetDecoration(range.value)) continue;
    const from = Math.max(range.from, line.contentStartOffset);
    const to = Math.min(range.to, line.contentEndOffset);
    if (to > from) ranges.push(range.value.range(from, to));
  }
}

// CodeMirror keeps the original spec on every decoration; only widget-bearing specs (replace or
// point previews) are atomic.
function isWidgetDecoration(decoration: Decoration): boolean {
  return (decoration.spec as { widget?: unknown } | null)?.widget !== undefined;
}

// Root-level traversal is driven by the canonical tree: containers keep their own decoration walk,
// leaves are fed to the widget paths through the canonical leaf DTO.
function appendDecorationsForNode(
  node: MarkdownNode,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[]
): void {
  if (!isMarkdownLeafNode(node)) {
    const active = node.id === context.activeRootNodeId;
    signatures?.push(`${createCanonicalNodeSignature(node)}${
      active ? node.kind === "blockquote" ? ":content-edit" : `:line-edit:${context.activeListLineStart ?? "none"}` : ""
    }`);
    appendCanonicalContainerDecorations(node, context, ranges, signatures);
    return;
  }

  appendDecorationsForBlock(canonicalLeafView(node, context.snapshot), context, ranges, signatures);
}

// Canonical nodes already own their source fingerprint and projected offsets.
// Source changes are applied unconditionally by the host, including changes to
// external reference definitions; selection-only refreshes reuse these identities.
function createCanonicalNodeSignature(node: MarkdownNode): string {
  return `${node.kind}:${node.id}:${node.source.startOffset}:${node.source.endOffset}`;
}

function appendDecorationsForBlock(
  block: DecoratableBlock,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[],
  containerContext: BlockDecorationContainerContext = null
): void {
  if (block.type === "heading" || block.type === "paragraph") {
    const active = block.id === context.activeRootNodeId, mode = active ? "active" : "inactive";
    if (!active) signatures?.push(createCanonicalNodeSignature(context.snapshot.nodeById(block.id)!));
    ranges.push(Decoration.line({ attributes: { class: block.type === "heading" ?
      `cm-${mode}-heading cm-${mode}-heading-depth-${block.depth}` : `cm-${mode}-paragraph cm-${mode}-paragraph-leading`
    } }).range(block.startOffset));
    if (block.type === "heading") appendHeadingMarker(block.startOffset, context, ranges);
    ranges.push(...createInactiveInlineDecorations(block.inline, { ...inlinePresentationOptions(context), active }));
    if (active) ranges.push(...createActiveInlineImageDecorations(block.inline, context.source, context.resolveImagePreviewUrl));
    return;
  }
  if (block.type === "table") {
    const cursorForBlock =
      context.activeTableCursor?.mode === "inside" &&
      context.activeTableCursor.tableStartOffset === block.startOffset
        ? context.activeTableCursor
        : null;
    const tableRenderOptions =
      containerContext?.type === "blockquote"
        ? {
            containerClassName: "cm-table-widget-blockquote",
            containerDepth: containerContext.depth
          }
        : {};
    const tableSignature = `${createCanonicalNodeSignature(context.snapshot.nodeById(block.id)!)}${
      containerContext ? `:container:${containerContext.type}:${containerContext.depth}` : ""
    }`;

    signatures?.push(
      cursorForBlock
        ? `${tableSignature}:table-cursor:${cursorForBlock.mode}:${cursorForBlock.row}:${cursorForBlock.column}`
        : tableSignature
    );
    ranges.push(
      createTableWidgetDecoration(
        block,
        cursorForBlock
          ? {
              row: cursorForBlock.row,
              column: cursorForBlock.column,
              tableStartOffset: cursorForBlock.tableStartOffset,
              offsetInCell: cursorForBlock.offsetInCell
            }
          : null,
        context.tableWidgetCallbacks ?? null,
        context.source,
        tableRenderOptions
      )
    );
    return;
  }

  if (block.id === context.activeRootNodeId) {

    if (context.activeCodeFenceInContentEdit && block.type === "codeFence") {
      signatures?.push(`${createCanonicalNodeSignature(context.snapshot.nodeById(block.id)!)}:content-edit`);
      appendCodeFenceDecorations(block.startOffset, block.endOffset, context.source, ranges, block.info, block.kind);
      return;
    }

    appendActiveDecorationsForBlock(block, context.source, ranges, context.resolveImagePreviewUrl);
    return;
  }

  signatures?.push(createCanonicalNodeSignature(context.snapshot.nodeById(block.id)!));

  appendInactiveDecorationsForBlock(block, context, ranges, signatures);
}

function appendInactiveDecorationsForBlock(
  block: DecoratableBlock,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[],
  containerContext: BlockDecorationContainerContext = null,
  insideContainer = false
): void {
  if (block.type === "table") {
    appendDecorationsForBlock(block, context, ranges, signatures, containerContext);
    return;
  }

  if (block.type === "htmlImage") {
    ranges.push(createInactiveHtmlImagePreviewDecoration(block, context.resolveImagePreviewUrl));
    return;
  }

  if (block.type === "codeFence") {
    if (isMermaidCodeFence(block, context.source)) {
      ranges.push(createInactiveMermaidPreviewDecoration(block, context.source).range(block.startOffset, block.endOffset));
      return;
    }

    appendCodeFenceDecorations(block.startOffset, block.endOffset, context.source, ranges, block.info, block.kind, !insideContainer);
    return;
  }

  if (block.type === "blockMath") {
    if (block.closed) {
      // A quoted math block drops the standalone math surface (transparent, square, quote text
      // colour) so it reads as part of the quote instead of a panel inside it.
      ranges.push(createInactiveBlockMathPreviewDecoration(
        block,
        containerContext?.type === "blockquote" ? { className: "cm-math-preview-blockquote" } : {}
      ).range(block.startOffset, block.endOffset));
    }
    return;
  }

  if (block.type === "definition") {
    if (block.footnoteDefinition?.status === "valid") {
      appendInactiveFootnoteDefinitionDecorations(
        block,
        ranges,
        context.resolveImagePreviewUrl
      );
      return;
    }

    if (block.footnoteDefinition) {
      return;
    }

    ranges.push(Decoration.replace({ block: true }).range(block.startOffset, block.endOffset));
    return;
  }

  ranges.push(
    Decoration.line({
      attributes: {
        class: "cm-inactive-thematic-break"
      }
    }).range(block.startOffset)
  );

  if (block.endOffset > block.startOffset) {
    ranges.push(
      Decoration.mark({
        attributes: {
          class: "cm-inactive-thematic-break-marker"
        }
      }).range(block.startOffset, block.endOffset)
    );
  }
}

function collectSelectionAffectedNodes(
  previousActiveBlockState: ActiveBlockState,
  nextActiveBlockState: ActiveBlockState
): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];

  appendUniqueNode(nodes, rootNodeOf(previousActiveBlockState));
  appendUniqueNode(nodes, rootNodeOf(nextActiveBlockState));
  // Nonempty selections can reveal prefixes in roots other than their active head.
  for (const state of [previousActiveBlockState, nextActiveBlockState]) {
    const from = Math.min(state.selection.anchor, state.selection.head);
    const to = Math.max(state.selection.anchor, state.selection.head);
    if (from === to) continue;
    for (const node of childrenOf(state.snapshot.tree.root)) {
      if (node.source.startOffset < to && node.source.endOffset > from) appendUniqueNode(nodes, node);
    }
  }
  return nodes;
}

function rootNodeOf(state: ActiveBlockState): MarkdownNode | null {
  return state.activeRootNodeId === null ? null : state.snapshot.nodeById(state.activeRootNodeId);
}

function appendUniqueNode(nodes: MarkdownNode[], node: MarkdownNode | null): void {
  if (!node || nodes.some((entry) => entry.id === node.id)) {
    return;
  }

  nodes.push(node);
}

function shouldRefreshWhitespaceOnlyLineDecorations(
  source: string,
  previousSelectionHead: number,
  nextSelectionHead: number,
  hasEditorFocus: boolean
): boolean {
  if (!hasEditorFocus) {
    return false;
  }

  return (
    isSelectionOnWhitespaceOnlySourceLine(source, previousSelectionHead) ||
    isSelectionOnWhitespaceOnlySourceLine(source, nextSelectionHead)
  );
}

function isSelectionOnWhitespaceOnlySourceLine(source: string, selectionHead: number): boolean {
  const lineStart = resolveLineStartOffset(source, selectionHead);
  let lineEnd = source.indexOf("\n", lineStart);

  if (lineEnd < 0) {
    lineEnd = source.length;
  }

  const trimmedLineEnd = trimTrailingCarriageReturn(source, lineStart, lineEnd);
  const lineText = source.slice(lineStart, trimmedLineEnd);

  return lineText.length > 0 && lineText.trim().length === 0;
}

function createBlockDecorationSpan(
  node: MarkdownNode
): { from: number; to: number } {
  return {
    from: node.source.startOffset,
    to: Math.max(node.source.endOffset, node.source.startOffset + 1)
  };
}

function rangeTouchesSpan(
  from: number,
  to: number,
  span: { from: number; to: number }
): boolean {
  if (from === to) {
    return from >= span.from && from <= span.to;
  }

  return from < span.to && to > span.from;
}

function createActiveDecorationSignature(context: BlockDecorationContext): string {
  return [
    `view-mode:${context.viewMode}`,
    `marker-mode:${context.headingMarkerPresentation?.mode ?? "editing"}:${context.activeBlockState.selection.anchor}:${context.activeBlockState.selection.head}:${context.headingMarkerPresentation?.revealed?.from ?? "none"}`,
    `active:${context.activeRootNodeId ?? "none"}`,
    `blank-line:${context.activeSelectionLineStart ?? "none"}`,
    `physical-line:${context.hasEditorFocus ? context.activeLine.number : "none"}:${context.activeLine.from}:${context.activeLine.to}:${context.activeLine.kind}`
  ].join(":");
}

function createScopedSelectionSignature(context: BlockDecorationContext): string {
  return [
    "scoped-selection",
    createActiveDecorationSignature(context),
    context.activeBlockState.tableCursor?.mode ?? "none",
    context.activeBlockState.tableCursor?.mode === "inside"
      ? `${context.activeBlockState.tableCursor.tableStartOffset}:${context.activeBlockState.tableCursor.row}:${context.activeBlockState.tableCursor.column}`
      : ""
  ].join(":");
}

function appendPhysicalLineDecorations(
  context: BlockDecorationContext,
  ranges: Range<Decoration>[]
): void {
  for (const line of context.editingDocument.lines) {
    const semanticLine = context.editingDocument.semanticLineMap.byLineNumber.get(line.number);
    const classNames = createPhysicalLineClassNames(
      line,
      semanticLine?.role ?? null,
      context.hasEditorFocus && line.number === context.activeLine.number
    );

    ranges.push(
      Decoration.line({
        attributes: {
          class: classNames.join(" ")
        }
      }).range(line.from)
    );
  }
}

function createPhysicalLineClassNames(
  line: EditingLine,
  role: SemanticLineRole | null,
  isActiveLine: boolean
): string[] {
  const classNames = [
    "cm-fm-line",
    `cm-fm-line-${line.kind}`
  ];

  if (isActiveLine) {
    classNames.push("cm-fm-line-active");
  }

  if (role === "structural-separator") {
    classNames.push("cm-fm-line-structural-separator");
  }

  if (role === "extra-blank") {
    classNames.push("cm-fm-line-extra-blank");
  }

  return classNames;
}

function appendCodeFenceDecorations(
  startOffset: number,
  endOffset: number,
  source: string,
  ranges: Range<Decoration>[],
  info: string | null = null,
  blockKind: "fenced" | "indented" = "fenced",
  concealFenceLines = true
): void {
  let contentStart: number | null = null;
  let contentEnd: number | null = null;
  const languageLabel = formatLanguageLabel(info);

  for (const line of getInactiveCodeFenceLines(startOffset, endOffset, source, blockKind)) {
    if (line.kind === "fence") {
      // A fence inside a container keeps its marker line visible so the container's rail and line
      // box stay continuous; a top-level fence folds the marker lines away instead.
      if (concealFenceLines) {
        ranges.push(
          Decoration.line({
            attributes: {
              class: "cm-inactive-code-block-fence"
            }
          }).range(line.lineStart)
        );
      }
      if (line.lineEnd > line.lineStart) {
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-code-block-fence-marker"
            }
          }).range(line.lineStart, line.lineEnd)
        );
      }
      continue;
    }

    const lineClasses = ["cm-inactive-code-block"];

    if (line.isFirstContentLine) {
      lineClasses.push("cm-inactive-code-block-start");
    }

    if (line.isLastContentLine) {
      lineClasses.push("cm-inactive-code-block-end");
    }

    const attributes: Record<string, string> = {
      class: lineClasses.join(" ")
    };
    if (line.isLastContentLine && languageLabel) {
      attributes["data-language"] = languageLabel;
    }

    ranges.push(
      Decoration.line({
        attributes
      }).range(line.lineStart)
    );

    if (line.contentStart > line.lineStart) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-code-block-indent-marker"
          }
        }).range(line.lineStart, line.contentStart)
      );
    }

    if (contentStart === null) {
      contentStart = line.contentStart;
    }
    contentEnd = line.lineEnd;
  }

  if (contentStart !== null && contentEnd !== null && contentEnd > contentStart) {
    appendCodeHighlightRanges(source, contentStart, contentEnd, info, ranges);
  }
}

function formatLanguageLabel(info: string | null): string {
  if (!info) return "";
  const token = info.trim().split(/\s+/)[0];
  if (!token) return "";
  return token.length > 16 ? token.slice(0, 16) : token;
}

function appendActiveBlockquoteSourcePrefixDecorations(
  lineStartOffset: number,
  markerEndOffset: number,
  contentStartOffset: number,
  ranges: Range<Decoration>[]
): void {
  appendSourcePrefixMark(lineStartOffset, markerEndOffset, "cm-active-blockquote-marker", ranges);
  appendSourcePrefixMark(markerEndOffset, contentStartOffset, "cm-active-blockquote-padding-anchor", ranges);
}

function appendSourcePrefixMark(from: number, to: number, className: string, ranges: Range<Decoration>[]): void {
  if (to > from) ranges.push(Decoration.mark({ attributes: { class: className } }).range(from, to));
}

type DraftBlockquoteMarker = {
  hiddenPrefixEndOffset: number;
  quoteDepth: number;
};

function resolveActiveDraftBlockquoteMarker(
  line: {
    lineStartOffset: number;
    markerEndOffset: number;
    contentStartOffset: number;
    contentEndOffset: number;
    markers: readonly BlockquoteMarker[];
  },
  selection: ActiveBlockState["selection"]
): DraftBlockquoteMarker | null {
  if (
    selection.anchor !== selection.head ||
    selection.head !== line.contentEndOffset ||
    line.markerEndOffset !== line.contentStartOffset ||
    line.contentEndOffset !== line.contentStartOffset
  ) {
    return null;
  }

  const lastMarker = line.markers.at(-1);
  if (!lastMarker || lastMarker.markerEnd !== line.markerEndOffset) {
    return null;
  }

  return {
    hiddenPrefixEndOffset: lastMarker.markerStart,
    quoteDepth: Math.max(0, line.markers.length - 1)
  };
}

function appendActiveDraftBlockquoteSourcePrefixDecorations(
  lineStartOffset: number,
  draftMarker: DraftBlockquoteMarker,
  ranges: Range<Decoration>[]
): void {
  appendSourcePrefixMark(lineStartOffset, draftMarker.hiddenPrefixEndOffset, "cm-active-blockquote-marker", ranges);
}

function isCodeFenceContentSelection(
  node: MarkdownNode,
  selectionHead: number,
  source: string
): boolean {
  if (node.data.kind !== "code-fence") {
    return false;
  }

  const line = getInactiveCodeFenceLines(node.source.startOffset, node.source.endOffset, source, node.data.fence).find(
    (entry) => selectionHead >= entry.lineStart && selectionHead <= entry.lineEnd
  );

  return line?.kind === "content";
}

function appendInactiveFootnoteDefinitionDecorations(
  block: DefinitionBlock,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: (href: string | null) => string | null
): void {
  const definition = block.footnoteDefinition;

  if (!definition || definition.status !== "valid") {
    return;
  }

  const lines = definition.lines;

  for (const [index, line] of lines.entries()) {
    const lineClasses = ["cm-inactive-footnote-definition"];

    if (index === 0) {
      lineClasses.push("cm-inactive-footnote-definition-start");
    }

    if (index === lines.length - 1) {
      lineClasses.push("cm-inactive-footnote-definition-end");
    }

    ranges.push(
      Decoration.line({
        attributes: {
          class: lineClasses.join(" ")
        }
      }).range(line.startOffset)
    );

    if (line.contentStartOffset > line.startOffset) {
      ranges.push(
        Decoration.mark({
          attributes: {
            class: "cm-inactive-footnote-definition-marker"
          }
        }).range(line.startOffset, line.contentStartOffset)
      );
    }

    ranges.push(...createInactiveInlineDecorations(line.inline, {
      resolveImagePreviewUrl
    }));
  }
}

function appendActiveListItemFirstLineDecorations(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  ranges: Range<Decoration>[]
): void {
  const lineAttributes = createListItemLineAttributes("active", item, source, ordered);

  ranges.push(
    Decoration.line({
      attributes: lineAttributes
    }).range(item.startOffset)
  );

  appendActiveListItemSourcePrefixDecorations(item, source, ranges);
}

function appendInactiveListItemFirstLineDecorations(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  ranges: Range<Decoration>[]
): void {
  const lineAttributes = createListItemLineAttributes("inactive", item, source, ordered);
  const contentStartOffset = resolveListItemContentStartOffset(item, source);

  ranges.push(
    Decoration.line({
      attributes: lineAttributes
    }).range(item.startOffset)
  );

  appendSourcePrefixMark(item.startOffset, item.markerStart, "cm-inactive-list-source-prefix", ranges);
  appendSourcePrefixMark(item.markerStart, item.markerEnd, "cm-inactive-list-marker", ranges);

  if (!item.task) {
    appendInactiveListPaddingAnchor(item.markerEnd, contentStartOffset, ranges);
    return;
  }

  appendSourcePrefixMark(item.markerEnd, item.task.markerStart, "cm-inactive-list-source-prefix", ranges);

  ranges.push(
    Decoration.replace({
      widget: new TaskMarkerWidget(item.task.checked)
    }).range(item.task.markerStart, item.task.markerEnd)
  );

  appendInactiveListPaddingAnchor(item.task.markerEnd, contentStartOffset, ranges);
}

function appendInactiveListPaddingAnchor(from: number, to: number, ranges: Range<Decoration>[]): void {
  if (to > from) ranges.push(Decoration.mark({ attributes: {
    class: "cm-inactive-list-source-prefix", "data-list-padding-anchor": ""
  } }).range(from, to));
}

class TaskMarkerWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  override eq(other: TaskMarkerWidget): boolean {
    return other.checked === this.checked;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement("span");
    const box = document.createElement("span");
    const check = document.createElement("span");

    marker.className = [
      "cm-inactive-task-marker",
      this.checked ? "cm-inactive-task-marker-checked" : "cm-inactive-task-marker-unchecked"
    ].join(" ");
    marker.dataset.taskState = this.checked ? "checked" : "unchecked";
    marker.setAttribute("aria-hidden", "true");
    box.className = "cm-inactive-task-marker-box";
    check.className = "cm-inactive-task-marker-check";
    marker.append(box, check);

    return marker;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function appendActiveListItemSourcePrefixDecorations(
  item: ListItemBlock,
  source: string,
  ranges: Range<Decoration>[]
): void {
  const contentStartOffset = resolveListItemContentStartOffset(item, source);
  const activeMarkerEnd = item.task?.markerEnd ?? item.markerEnd;

  appendSourcePrefixMark(item.startOffset, item.markerStart, "cm-active-list-source-prefix", ranges);
  appendSourcePrefixMark(item.markerStart, activeMarkerEnd, "cm-active-list-marker", ranges);
  appendSourcePrefixMark(activeMarkerEnd, contentStartOffset, "cm-active-list-padding-anchor", ranges);
}

function createListItemLineAttributes(
  mode: "active" | "inactive",
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  lineKind: "first" | "continuation" = "first",
  sourcePrefixLength: number | null = null
): Record<string, string> {
  return createListLineAttributes(mode, item, source, ordered, lineKind,
    sourcePrefixLength ?? getListItemSourcePrefixLength(item, source));
}

function appendInactiveBlankLineDecorations(
  source: string,
  blocks: readonly MarkdownNode[],
  activeSelectionLineStart: number | null,
  ranges: Range<Decoration>[]
): void {
  let cursor = 0;
  const hiddenLineStarts = new Set<number>();

  for (const block of blocks) {
    appendInactiveBlankLineDecorationsInRange(
      source,
      cursor,
      block.source.startOffset,
      cursor > 0,
      activeSelectionLineStart,
      hiddenLineStarts,
      ranges
    );
    appendLeadingBlockSeparatorDecoration(
      source,
      block,
      activeSelectionLineStart,
      hiddenLineStarts,
      ranges
    );
    cursor = Math.max(cursor, block.source.endOffset);
  }

  appendInactiveBlankLineDecorationsInRange(
    source,
    cursor,
    source.length,
    cursor > 0,
    activeSelectionLineStart,
    hiddenLineStarts,
    ranges
  );
}

function appendInactiveBlankLineDecorationsInRange(
  source: string,
  startOffset: number,
  endOffset: number,
  skipLeadingLineBreak: boolean,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  const contentStartOffset = skipLeadingLineBreak
    ? skipSingleLeadingLineBreak(source, startOffset, endOffset)
    : startOffset;
  let emptyLineRunIndex = 0;

  for (const line of createLineInfosInRange(source, contentStartOffset, endOffset)) {
    const lineEndOffset = trimTrailingCarriageReturn(source, line.startOffset, line.endOffset);
    const lineText = source.slice(line.startOffset, lineEndOffset);

    if (lineText.length > 0) {
      emptyLineRunIndex = 0;
      continue;
    }

    emptyLineRunIndex += 1;

    if (line.startOffset === activeSelectionLineStart) {
      continue;
    }

    if (emptyLineRunIndex % 2 === 0) {
      continue;
    }

    appendInactiveBlankLineDecoration(line.startOffset, activeSelectionLineStart, hiddenLineStarts, ranges);
  }
}

function appendLeadingBlockSeparatorDecoration(
  source: string,
  block: MarkdownNode,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  const startOffset = block.source.startOffset;

  if (!nodeRequiresLeadingStructuralSeparator(block) || startOffset <= 0) {
    return;
  }

  const previousLineEnd = source[startOffset - 1] === "\n" ? startOffset - 1 : startOffset;
  const previousLineStart = resolveLineStartOffset(source, previousLineEnd);
  const contentEnd = trimTrailingCarriageReturn(source, previousLineStart, previousLineEnd);

  if (source.slice(previousLineStart, contentEnd).length !== 0) {
    return;
  }

  appendInactiveBlankLineDecoration(previousLineStart, activeSelectionLineStart, hiddenLineStarts, ranges);
}

function appendInactiveBlankLineDecoration(
  lineStart: number,
  activeSelectionLineStart: number | null,
  hiddenLineStarts: Set<number>,
  ranges: Range<Decoration>[]
): void {
  if (lineStart === activeSelectionLineStart || hiddenLineStarts.has(lineStart)) {
    return;
  }

  hiddenLineStarts.add(lineStart);
  ranges.push(
    Decoration.line({
      attributes: {
        class: "cm-inactive-blank-line"
      }
    }).range(lineStart)
  );
}

function skipSingleLeadingLineBreak(source: string, startOffset: number, endOffset: number): number {
  if (startOffset >= endOffset) {
    return startOffset;
  }

  if (
    source[startOffset] === "\r" &&
    startOffset + 1 < endOffset &&
    source[startOffset + 1] === "\n"
  ) {
    return startOffset + 2;
  }

  if (source[startOffset] !== "\n") {
    return startOffset;
  }

  return startOffset + 1;
}

function getListItemSourcePrefixLength(item: ListItemBlock, source: string): number {
  const contentStartOffset = resolveListItemContentStartOffset(item, source);
  return Math.max(contentStartOffset - item.startOffset, 0);
}

function resolveListItemContentStartOffset(item: ListItemBlock, source: string): number {
  if (typeof item.contentStartOffset === "number") {
    return item.contentStartOffset;
  }

  const lineEndOffset = findLineEndOffset(source, item.startOffset, item.endOffset);
  return resolveListItemMarkerContentStartOffset(item, source, lineEndOffset);
}

function findLineEndOffset(source: string, startOffset: number, upperBound: number): number {
  const newlineOffset = source.indexOf("\n", startOffset);
  return newlineOffset === -1 ? upperBound : Math.min(newlineOffset, upperBound);
}

class EmptyHeadingCaretWidget extends WidgetType {
  eq(other: WidgetType): boolean { return other instanceof EmptyHeadingCaretWidget; }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = "\u200b";
    span.setAttribute("aria-hidden", "true");
    return span;
  }
}
const emptyHeadingCaretWidget = new EmptyHeadingCaretWidget();

function appendHeadingMarker(from: number, context: BlockDecorationContext, ranges: Range<Decoration>[]): void {
  const marker = headingMarkerAt(context.snapshot, from);
  if (marker === null) return;
  const to = marker.to;
  if (to > from && context.snapshot.lineAt(from)?.contentEndOffset === to)
    ranges.push(Decoration.widget({ widget: emptyHeadingCaretWidget, side: 1 }).range(to));
  if (to > from) ranges.push(Decoration.mark({
    attributes: { class: headingMarkerIsVisible({ from, to }, context.activeBlockState.selection,
      context.hasEditorFocus, context.headingMarkerPresentation) ? "cm-active-heading-marker" : "cm-inactive-heading-marker" }
  }).range(from, to));
}

function inlinePresentationOptions(context: BlockDecorationContext) {
  return { resolveImagePreviewUrl: context.resolveImagePreviewUrl,
    markerVisible: (from: number, to: number) => headingMarkerIsVisible({ from, to }, context.activeBlockState.selection,
      context.hasEditorFocus, context.headingMarkerPresentation) };
}

function appendActiveDecorationsForBlock(
  block: DecoratableBlock,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl: ((href: string | null) => string | null) | undefined
): void {
  if (block.type === "htmlImage") {
    ranges.push(createActiveHtmlImagePreviewDecoration(block, source, resolveImagePreviewUrl));
  }
}
