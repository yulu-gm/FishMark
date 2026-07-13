import type { EditorView } from "@codemirror/view";

import {
  findBlockPathAt,
  createPhysicalEditingDocument,
  getMarkdownEditorViewMode
} from "@fishmark/editor-core";
import {
  parseMarkdownDocument,
  type BlockquoteMarker,
  type ListBlock,
  type ListItemBlock,
  type MarkdownBlock,
  type MarkdownDocument
} from "@fishmark/markdown-engine";

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

const canonicalBlockType: Readonly<
  Partial<Record<MarkdownBlock["type"], EditorBehaviorContainer>>
> = {
  paragraph: "Paragraph",
  list: "List",
  blockquote: "Blockquote",
  codeFence: "CodeFence",
  blockMath: "BlockMath"
};

export function observeSemanticPath(
  source: string,
  selectionOffset: number
): ObservedSemanticPath {
  const document = parseMarkdownDocument(source);
  const raw = findBlockPathAt(document, selectionOffset).map(({ block }) => block.type);
  const canonical = raw.flatMap((type) => {
    const mapped = canonicalBlockType[type];
    return mapped ? [mapped] : [];
  });
  return { raw, canonical: ["Document", ...canonical] };
}

export function observePhysicalLineSemantics(
  source: string
): readonly ObservedPhysicalLineSemantic[] {
  const document = parseMarkdownDocument(source);
  const physical = createPhysicalEditingDocument(source, document);

  return physical.lines.map((line) => {
    const probeOffset = line.to > line.from ? line.from : line.from;
    const path = findBlockPathAt(document, probeOffset);
    const quote = quoteLineContext(path.map(({ block }) => block), line.number);
    const list = deepestListContext(document, probeOffset, line.number);
    const quoteContentOffset = quote?.contentStartOffset ?? line.from;
    const contentOffset =
      list?.item.startLine === line.number && list.item.contentStartOffset !== undefined
        ? list.item.contentStartOffset
        : list || quote
          ? consumeHorizontalSpace(source, quoteContentOffset, line.to)
          : line.from;
    const markerOffset =
      list?.item.startLine === line.number
        ? list.item.markerStart
        : quote?.markers.at(-1)?.markerStart ?? null;
    const role = observeLineRole(
      source,
      line,
      path.map(({ block }) => block),
      physical.semanticLineMap.byLineNumber.get(line.number)?.role ?? null,
      contentOffset
    );

    return {
      line: line.number,
      from: line.from,
      to: line.to,
      sourceText: line.text,
      role,
      semanticDepth: (quote?.markers.length ?? 0) + (list?.depth ?? 0),
      contentColumn: Math.max(0, Math.min(line.text.length, contentOffset - line.from)),
      markerColumn:
        markerOffset === null
          ? null
          : Math.max(0, Math.min(line.text.length - 1, markerOffset - line.from))
    };
  });
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

type QuoteLineContext = {
  readonly contentStartOffset: number;
  readonly markers: readonly BlockquoteMarker[];
};

function quoteLineContext(
  path: readonly MarkdownBlock[],
  lineNumber: number
): QuoteLineContext | null {
  let deepest: QuoteLineContext | null = null;
  for (const block of path) {
    if (block.type !== "blockquote") {
      continue;
    }
    const line = block.lines?.find((candidate) => candidate.lineNumber === lineNumber);
    if (!line) {
      continue;
    }
    if (!deepest || line.markers.length >= deepest.markers.length) {
      deepest = {
        contentStartOffset: line.contentStartOffset,
        markers: line.markers
      };
    }
  }
  return deepest;
}

type ListContext = {
  readonly depth: number;
  readonly item: ListItemBlock;
};

function deepestListContext(
  document: MarkdownDocument,
  offset: number,
  lineNumber: number
): ListContext | null {
  let deepest: ListContext | null = null;

  const visitBlocks = (blocks: readonly MarkdownBlock[], parentDepth: number): void => {
    for (const block of blocks) {
      if (lineNumber < block.startLine || lineNumber > block.endLine) {
        continue;
      }
      if (block.type === "blockquote") {
        visitBlocks(block.innerBlocks ?? [], parentDepth);
        continue;
      }
      if (block.type !== "list") {
        continue;
      }
      visitList(block, parentDepth + 1);
    }
  };

  const visitList = (list: ListBlock, depth: number): void => {
    const item = list.items.find(
      (candidate) =>
        lineNumber >= candidate.startLine &&
        lineNumber <= candidate.endLine &&
        offset >= candidate.startOffset &&
        offset <= candidate.endOffset
    );
    if (!item) {
      return;
    }
    deepest = { depth, item };
    for (const child of item.children) {
      if (lineNumber >= child.startLine && lineNumber <= child.endLine) {
        visitList(child, depth + 1);
      }
    }
  };

  visitBlocks(document.blocks, 0);
  return deepest;
}

function consumeHorizontalSpace(
  source: string,
  from: number,
  to: number
): number {
  let cursor = from;
  while (cursor < to && (source[cursor] === " " || source[cursor] === "\t")) {
    cursor += 1;
  }
  return cursor;
}

function observeLineRole(
  source: string,
  line: {
    readonly number: number;
    readonly from: number;
    readonly to: number;
    readonly text: string;
    readonly isDocumentEnd: boolean;
  },
  path: readonly MarkdownBlock[],
  physicalRole: string | null,
  contentOffset: number
): VisiblePhysicalLineRole {
  const deepest = path.at(-1);
  if (deepest?.type === "codeFence") {
    if (deepest.kind === "indented") {
      return "code-fence-content";
    }
    if (physicalRole === "code-fence-boundary") {
      return "code-fence-delimiter";
    }
    if (physicalRole === "code-fence-content") {
      return "code-fence-content";
    }
    return line.number === deepest.startLine ||
      isNestedCodeFenceClosingLine(source, line, deepest, path, contentOffset)
      ? "code-fence-delimiter"
      : "code-fence-content";
  }
  if (deepest?.type === "blockMath") {
    return line.number === deepest.startLine || (deepest.closed && line.number === deepest.endLine)
      ? "block-math-delimiter"
      : "block-math-content";
  }
  if (/^[ \t]+$/u.test(line.text)) {
    return "whitespace-only";
  }
  if (line.text.length === 0) {
    return line.isDocumentEnd ? "empty-editing-line" : "structural-separator";
  }
  const lineContentOffset = Math.max(line.from, Math.min(line.to, contentOffset));
  if (source.slice(lineContentOffset, line.to).trim() === "") {
    return "structural-separator";
  }
  if (physicalRole === "structural-separator") {
    return "structural-separator";
  }
  return "content";
}

function isNestedCodeFenceClosingLine(
  source: string,
  line: { readonly number: number; readonly to: number },
  block: Extract<MarkdownBlock, { readonly type: "codeFence" }>,
  path: readonly MarkdownBlock[],
  contentOffset: number
): boolean {
  if (line.number !== block.endLine) {
    return false;
  }

  const openingLine = readSourceLine(source, block.startLine);
  if (!openingLine) {
    return false;
  }
  const openingQuote = quoteLineContext(path, block.startLine);
  const openingContentOffset = openingQuote?.contentStartOffset ?? openingLine.from;
  const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(
    source.slice(openingContentOffset, openingLine.to)
  )?.[1];
  if (!opening) {
    return false;
  }

  const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(
    source.slice(contentOffset, line.to)
  )?.[1];
  return closing !== undefined && closing[0] === opening[0] && closing.length >= opening.length;
}

function readSourceLine(
  source: string,
  targetLine: number
): { readonly from: number; readonly to: number } | null {
  let line = 1;
  let from = 0;
  for (let offset = 0; offset <= source.length; offset += 1) {
    if (offset !== source.length && source[offset] !== "\n") {
      continue;
    }
    if (line === targetLine) {
      const to = offset > from && source[offset - 1] === "\r" ? offset - 1 : offset;
      return { from, to };
    }
    line += 1;
    from = offset + 1;
  }
  return null;
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
  const semanticPath = observeSemanticPath(source, selection.head);
  const lines = observePhysicalLineSemantics(source);
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
