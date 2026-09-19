import type { EditorView } from "@codemirror/view";

import { getMarkdownEditorViewMode } from "@fishmark/editor-core";
import { readEditorStructureCache } from "@fishmark/codemirror-adapter";
import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot, type PhysicalLine } from "@fishmark/editor-model";
import { childrenOf, createDocumentStructureCache, type MarkdownNode } from "@fishmark/markdown-engine";

import type { EditorBehaviorCheckpointObservation } from "../../fixtures/editor-behavior/runner-protocol";
import type { EditorBehaviorLineDomMapping } from "../../fixtures/editor-behavior/runner-protocol";
import type {
  EditorBehaviorContainer,
  VisiblePhysicalLineRole
} from "../../fixtures/editor-behavior/model";

export type ObservedSemanticPath = {
  readonly raw: readonly string[];
  readonly canonical: readonly EditorBehaviorContainer[];
};

export type ObservedPhysicalLineSemantic = {
  readonly line: number;
  readonly from: number;
  readonly to: number;
  readonly sourceText: string;
  readonly role: VisiblePhysicalLineRole;
  readonly semanticDepth: number;
  readonly contentColumn: number;
  readonly markerColumn: number | null;
};

const canonicalBlockType: Readonly<Partial<Record<MarkdownNode["kind"], EditorBehaviorContainer>>> = {
  paragraph: "Paragraph", list: "List", "list-item": "ListItem", blockquote: "Blockquote",
  "code-fence": "CodeFence", "block-math": "BlockMath"
};

// Live observations use the exact document snapshot owned by the current EditorState.
// Source-only callers may build an independent snapshot for parser unit tests.
function snapshotFor(source: string, snapshot?: EditorDerivedSnapshot): EditorDerivedSnapshot {
  if (snapshot !== undefined) {
    if (snapshot.source !== source) throw new Error("Observer snapshot does not match the current source.");
    return snapshot;
  }
  return createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
}

function nodeChain(snapshot: EditorDerivedSnapshot, node: MarkdownNode | null): readonly MarkdownNode[] {
  if (node === null) return [];
  const result: MarkdownNode[] = [];
  let current: MarkdownNode = snapshot.tree.root;
  for (const index of node.path) {
    const child: MarkdownNode | undefined = childrenOf(current)[index];
    if (child === undefined) break;
    result.push(child);
    current = child;
  }
  return result;
}

export function observeSemanticPath(source: string, selectionOffset: number, cached?: EditorDerivedSnapshot): ObservedSemanticPath {
  const snapshot = snapshotFor(source, cached);
  const line = snapshot.lineAt(selectionOffset);
  const node = snapshot.nodeAt(selectionOffset) ?? (line?.nodeId ? snapshot.nodeById(line.nodeId) : null);
  const chain = nodeChain(snapshot, node);
  return { raw: chain.map((entry) => entry.kind), canonical: ["Document", ...chain.flatMap((entry) => {
    const mapped = canonicalBlockType[entry.kind];
    return mapped === undefined ? [] : [mapped];
  })] };
}

export function observePhysicalLineSemantics(source: string, cached?: EditorDerivedSnapshot): readonly ObservedPhysicalLineSemantic[] {
  const snapshot = snapshotFor(source, cached);
  return snapshot.document.lines.map((line) => {
    const chain = nodeChain(snapshot, line.nodeId === null ? null : snapshot.nodeById(line.nodeId));
    const marker = line.segments.findLast((segment) => segment.kind === "list-marker" || segment.kind === "quote-marker");
    return {
      line: line.lineNumber, from: line.range.startOffset, to: line.contentEndOffset,
      sourceText: source.slice(line.range.startOffset, line.contentEndOffset),
      role: observeCanonicalRole(source, line, chain),
      semanticDepth: chain.filter((node) => node.kind === "blockquote" || node.kind === "list-item").length,
      contentColumn: Math.max(0, line.contentStartOffset - line.range.startOffset),
      markerColumn: marker === undefined ? null : marker.range.startOffset - line.range.startOffset
    };
  });
}

function observeCanonicalRole(source: string, line: PhysicalLine, chain: readonly MarkdownNode[]): VisiblePhysicalLineRole {
  const fence = chain.findLast((node) => node.kind === "code-fence" || node.kind === "block-math");
  if (fence !== undefined) {
    const boundary = line.role === "fence-open" || line.role === "fence-close";
    if (fence.data.kind === "code-fence") return fence.data.fence === "indented" || !boundary ? "code-fence-content" : "code-fence-delimiter";
    return boundary ? "block-math-delimiter" : "block-math-content";
  }
  const owner = chain.at(-1);
  // An empty list item is still an editable, visible item (CommonMark §5.2),
  // even though it has no paragraph child. Only its own marker line qualifies;
  // blank continuation lines and empty nested quotes remain separators.
  if (owner?.kind === "list-item" && line.segments.some((segment) =>
    segment.kind === "list-marker" && owner.markers.some((marker) => marker.kind === "list-marker" &&
      marker.range.startOffset === segment.range.startOffset))) return "content";
  const text = source.slice(line.range.startOffset, line.contentEndOffset);
  if (/^[ \t]+$/u.test(text)) return "whitespace-only";
  if (text.length === 0) return line.range.startOffset === source.length ? "empty-editing-line" : "structural-separator";
  return source.slice(line.contentStartOffset, line.contentEndOffset).trim().length === 0 ? "structural-separator" : "content";
}

export function observeLineDomMapping(
  line: number,
  element: HTMLElement | null
): {
  readonly visibility: "visible" | "collapsed";
  readonly mapping: EditorBehaviorLineDomMapping;
} {
  const kind = lineDomKind(element);
  if (!element) {
    return {
      visibility: "collapsed",
      mapping: {
        line,
        kind,
        display: null,
        visibility: null,
        opacity: null,
        rect: { width: null, height: null }
      }
    };
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const width = Number.isFinite(rect.width) ? rect.width : null;
  const height = Number.isFinite(rect.height) ? rect.height : null;
  const visible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    Number.parseFloat(style.opacity || "1") > 0 &&
    (height ?? 0) > 0;

  return {
    visibility: visible ? "visible" : "collapsed",
    mapping: {
      line,
      kind,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      rect: { width, height }
    }
  };
}

function lineDomKind(element: HTMLElement | null): EditorBehaviorLineDomMapping["kind"] {
  if (!element) {
    return "missing";
  }
  if (element.matches(".cm-table-widget")) {
    return "table-widget";
  }
  if (element.matches(".cm-math-preview-block")) {
    return "math-widget";
  }
  if (element.matches(".cm-mermaid-preview, .cm-mermaid-preview-block")) {
    return "mermaid-widget";
  }
  return "source-line";
}

export function observeEditorBehaviorCheckpoint(
  view: EditorView,
  identity: Pick<
    EditorBehaviorCheckpointObservation,
    "runId" | "manifestHash" | "contractHash" | "caseId" | "checkpoint" | "commandPlan" | "trace"
  >
): EditorBehaviorCheckpointObservation {
  const source = view.state.doc.toString();
  const selection = {
    anchor: view.state.selection.main.anchor,
    head: view.state.selection.main.head
  };
  const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(view.state));
  const semanticPath = observeSemanticPath(source, selection.head, snapshot);
  const lines = observePhysicalLineSemantics(source, snapshot);
  const dom = lines.map((line) =>
    observeLineDomMapping(line.line, resolveLineDomElement(view, line.from))
  );
  return {
    ...identity,
    source,
    selection,
    semanticPath: semanticPath.canonical,
    rawSemanticPath: semanticPath.raw,
    visibleLineRoles: lines.map(({ role }) => role),
    physicalGeometry: lines.map(
      ({ line, sourceText, semanticDepth, contentColumn, markerColumn }, index) => ({
        line,
        sourceText,
        geometry: {
          semanticDepth,
          contentColumn,
          markerColumn,
          visibility: dom[index]!.visibility
        }
      })
    ),
    lineDomMappings: dom.map(({ mapping }) => mapping),
    viewMode: getMarkdownEditorViewMode(view.state)
  };
}

function resolveLineDomElement(view: EditorView, offset: number): HTMLElement | null {
  let point: ReturnType<EditorView["domAtPos"]>;
  try {
    point = view.domAtPos(offset);
  } catch {
    return null;
  }

  const candidates: Node[] = [point.node];
  if (point.node instanceof Element) {
    const child = point.node.childNodes.item(point.offset);
    const previous = point.offset > 0 ? point.node.childNodes.item(point.offset - 1) : null;
    if (child) {
      candidates.push(child);
    }
    if (previous) {
      candidates.push(previous);
    }
  }

  const selector = [
    ".cm-line",
    ".cm-table-widget",
    ".cm-math-preview-block",
    ".cm-mermaid-preview",
    ".cm-mermaid-preview-block"
  ].join(", ");
  for (const candidate of candidates) {
    const element = candidate instanceof Element ? candidate : candidate.parentElement;
    const mapped = element?.closest<HTMLElement>(selector) ??
      element?.querySelector<HTMLElement>(selector) ?? null;
    if (mapped) {
      return mapped;
    }
  }
  return null;
}
