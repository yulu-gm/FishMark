import type { ListBlock, ListItemBlock, OrderedListDelimiter } from "../block-map";
import type { SourceRange } from "../model/source-range";
import { createLineInfos } from "./leaf-blocks";

// The list scope model FishMark's editing commands are built on: items nest by indentation,
// blank lines end an open item, and a run only continues while the marker kind, delimiter, and
// indentation all agree. The recursive parser owns document structure; this module owns the
// indentation scoping the legacy list view reports, including inside container prefixes.

export type ListItemGeometry = {
  readonly startOffset: number;
  readonly indent: number;
  readonly marker: string;
  readonly markerStart: number;
  readonly markerEnd: number;
  readonly task: ListItemBlock["task"];
  readonly endOffset: number;
  readonly scopes: readonly ListScope[];
};

export type ListScope =
  | {
      readonly ordered: false;
      readonly indent: number;
      readonly items: readonly ListItemGeometry[];
    }
  | {
      readonly ordered: true;
      readonly indent: number;
      readonly startOrdinal: number;
      readonly delimiter: OrderedListDelimiter;
      readonly items: readonly ListItemGeometry[];
    };

const LIST_ITEM_PATTERN = /^([ \t]*)(?:([*+-])([ \t]+)|(\d+[.)])([ \t]+))/;
const TASK_MARKER_PATTERN = /^\[( |x|X)\](?=[ \t]|$)/;

// `prefixRanges` blank container prefixes: they are skipped when reading a line's structure but
// still occupy real offsets, so every reported range stays a document offset.
export function parseListScopes(
  source: string,
  range: SourceRange,
  prefixRanges: readonly SourceRange[]
): ListScope[] | null {
  const lines = createLineInfos(source.slice(range.startOffset, range.endOffset), range.startOffset, 0);
  const rootScopes: DraftScope[] = [];
  const openItems: DraftItem[] = [];
  let forceNewRootScope = false;

  for (const line of lines) {
    const contentStart = lineContentStart(line.startOffset, line.endOffset, prefixRanges);
    const text = source.slice(contentStart, line.endOffset);
    const match = LIST_ITEM_PATTERN.exec(text);

    if (!match) {
      if (text.trim().length === 0) {
        openItems.length = 0;
        forceNewRootScope = rootScopes.length > 0;
        continue;
      }

      for (const item of openItems) {
        item.endOffset = line.endOffset;
      }
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const marker = match[2] ?? match[4] ?? "-";
    const metadata = parseListMarker(marker);

    while (openItems.length > 0 && openItems[openItems.length - 1]!.indent >= indent) {
      openItems.pop();
    }

    const markerStart = contentStart + indent;
    const markerEnd = markerStart + marker.length;
    const padding = match[3] ?? match[5] ?? "";
    const task = parseTaskMarker(text.slice(match[0].length), markerEnd + padding.length);
    const item: DraftItem = {
      startOffset: line.startOffset,
      indent,
      marker,
      markerStart,
      markerEnd,
      task,
      endOffset: line.endOffset,
      scopes: []
    };

    for (const ancestor of openItems) {
      ancestor.endOffset = line.endOffset;
    }

    const parent = openItems[openItems.length - 1];

    if (parent !== undefined) {
      appendDraftItemToNestedScope(parent, item, metadata, indent);
    } else {
      const currentRootScope = forceNewRootScope ? null : rootScopes[rootScopes.length - 1] ?? null;

      if (currentRootScope !== null && draftScopeMatches(currentRootScope, metadata, indent)) {
        currentRootScope.items.push(item);
      } else if (rootScopes.length === 0 || canStartNewRootScope(rootScopes[rootScopes.length - 1] ?? null, indent)) {
        rootScopes.push(createDraftScope(metadata, indent, item));
      } else {
        return null;
      }

      forceNewRootScope = false;
    }

    openItems.push(item);
  }

  return rootScopes.map((scope) => materializeScope(scope));
}

// Flat items ignore nesting entirely, which is the fallback when indentation scoping rejects a
// run of markers that do not agree on kind, delimiter, or indentation.
export function parseFlatListItems(
  source: string,
  range: SourceRange,
  prefixRanges: readonly SourceRange[]
): readonly ListItemGeometry[] {
  const lines = createLineInfos(source.slice(range.startOffset, range.endOffset), range.startOffset, 0);
  const items: DraftItem[] = [];

  for (const line of lines) {
    const contentStart = lineContentStart(line.startOffset, line.endOffset, prefixRanges);
    const text = source.slice(contentStart, line.endOffset);
    const match = LIST_ITEM_PATTERN.exec(text);

    if (!match) {
      const current = items[items.length - 1];

      if (current) {
        current.endOffset = line.endOffset;
      }

      continue;
    }

    const indent = match[1]?.length ?? 0;
    const marker = match[2] ?? match[4] ?? "-";
    const markerStart = contentStart + indent;
    const markerEnd = markerStart + marker.length;
    const padding = match[3] ?? match[5] ?? "";

    items.push({
      startOffset: line.startOffset,
      indent,
      marker,
      markerStart,
      markerEnd,
      task: parseTaskMarker(text.slice(match[0].length), markerEnd + padding.length),
      endOffset: line.endOffset,
      scopes: []
    });
  }

  return items.map((item) => materializeItem(item));
}

function lineContentStart(
  lineStart: number,
  lineEnd: number,
  prefixRanges: readonly SourceRange[]
): number {
  let cursor = lineStart;

  for (const prefix of prefixRanges) {
    if (prefix.startOffset === cursor && prefix.endOffset <= lineEnd) {
      cursor = prefix.endOffset;
    }
  }

  return cursor;
}

type DraftItem = {
  startOffset: number;
  indent: number;
  marker: string;
  markerStart: number;
  markerEnd: number;
  task: ListItemBlock["task"];
  endOffset: number;
  scopes: DraftScope[];
};

type DraftScope =
  | {
      ordered: false;
      indent: number;
      items: DraftItem[];
    }
  | {
      ordered: true;
      indent: number;
      startOrdinal: number;
      delimiter: OrderedListDelimiter;
      items: DraftItem[];
    };

function parseListMarker(marker: string):
  | { ordered: false }
  | { ordered: true; startOrdinal: number; delimiter: OrderedListDelimiter } {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);

  if (!orderedMatch) {
    return { ordered: false };
  }

  return {
    ordered: true,
    startOrdinal: Number.parseInt(orderedMatch[1] ?? "1", 10),
    delimiter: (orderedMatch[2] ?? ".") as OrderedListDelimiter
  };
}

function createDraftScope(
  metadata: ReturnType<typeof parseListMarker>,
  indent: number,
  firstItem: DraftItem
): DraftScope {
  if (!metadata.ordered) {
    return { ordered: false, indent, items: [firstItem] };
  }

  return {
    ordered: true,
    indent,
    startOrdinal: metadata.startOrdinal,
    delimiter: metadata.delimiter,
    items: [firstItem]
  };
}

function canStartNewRootScope(previousScope: DraftScope | null, indent: number): boolean {
  return previousScope === null ? true : previousScope.indent === indent;
}

function appendDraftItemToNestedScope(
  parent: DraftItem,
  item: DraftItem,
  metadata: ReturnType<typeof parseListMarker>,
  indent: number
): void {
  const currentScope = parent.scopes[parent.scopes.length - 1];

  if (currentScope !== undefined && draftScopeMatches(currentScope, metadata, indent)) {
    currentScope.items.push(item);
    return;
  }

  parent.scopes.push(createDraftScope(metadata, indent, item));
}

function draftScopeMatches(
  scope: DraftScope,
  metadata: ReturnType<typeof parseListMarker>,
  indent: number
): boolean {
  if (scope.indent !== indent || scope.ordered !== metadata.ordered) {
    return false;
  }

  if (!scope.ordered || !metadata.ordered) {
    return true;
  }

  return scope.delimiter === metadata.delimiter;
}

function materializeScope(scope: DraftScope): ListScope {
  const items = scope.items.map((item) => materializeItem(item));

  if (!scope.ordered) {
    return { ordered: false, indent: scope.indent, items };
  }

  return {
    ordered: true,
    indent: scope.indent,
    startOrdinal: scope.startOrdinal,
    delimiter: scope.delimiter,
    items
  };
}

function materializeItem(item: DraftItem): ListItemGeometry {
  const scopes = item.scopes.map((scope) => materializeScope(scope));
  const nestedEnd = scopes.reduce(
    (end, scope) => Math.max(end, ...scope.items.map((child) => child.endOffset)),
    item.endOffset
  );

  return {
    startOffset: item.startOffset,
    indent: item.indent,
    marker: item.marker,
    markerStart: item.markerStart,
    markerEnd: item.markerEnd,
    task: item.task,
    endOffset: nestedEnd,
    scopes
  };
}

function parseTaskMarker(remainder: string, taskStartOffset: number): ListItemBlock["task"] {
  const taskMatch = TASK_MARKER_PATTERN.exec(remainder);

  if (!taskMatch) {
    return null;
  }

  return {
    checked: taskMatch[1]?.toLowerCase() === "x",
    markerStart: taskStartOffset,
    markerEnd: taskStartOffset + taskMatch[0].length
  };
}

export type { ListBlock };
