import type { BlockquoteMarker } from "./block-map";

export interface BlockquoteLinePrefix {
  markers: readonly BlockquoteMarker[];
  markerEnd: number;
  sourcePrefixEndOffset: number;
  contentStartOffset: number;
}

type ParsedBlockquoteMarker = {
  marker: BlockquoteMarker;
  sourcePrefixEndOffset: number;
};

export function parseBlockquoteLinePrefix(
  source: string,
  lineStartOffset: number,
  lineEndOffset: number
): BlockquoteLinePrefix {
  const markers: ParsedBlockquoteMarker[] = [];
  let cursor = lineStartOffset;
  let column = 0;
  let markerEnd = lineStartOffset;
  let sourcePrefixEndOffset = lineStartOffset;

  while (cursor < lineEndOffset) {
    const marker = findNextMarker(source, cursor, column, lineEndOffset);

    if (marker === null) {
      break;
    }

    markerEnd = marker.offset + 1;

    const nextColumn = marker.column + 1;
    const prefixEnd = consumeOptionalMarkerPadding(source, markerEnd, nextColumn, lineEndOffset);
    const padding = source[markerEnd];

    markers.push({
      marker: { markerStart: marker.offset, markerEnd },
      sourcePrefixEndOffset: prefixEnd.offset
    });

    cursor = padding === " " ? prefixEnd.offset : markerEnd;
    column = padding === " " ? prefixEnd.column : nextColumn;
    sourcePrefixEndOffset = prefixEnd.offset;
  }

  if (markers.length === 0) {
    return {
      markers: [],
      markerEnd: lineStartOffset,
      sourcePrefixEndOffset: lineStartOffset,
      contentStartOffset: lineStartOffset
    };
  }

  const committedMarkers = trimTrailingUncommittedNestedMarkers(markers);
  const lastCommittedMarker = committedMarkers.at(-1);

  if (lastCommittedMarker) {
    markerEnd = lastCommittedMarker.marker.markerEnd;
    sourcePrefixEndOffset = lastCommittedMarker.sourcePrefixEndOffset;
  }

  return {
    markers: committedMarkers.map((entry) => entry.marker),
    markerEnd,
    sourcePrefixEndOffset,
    contentStartOffset: sourcePrefixEndOffset
  };
}

function trimTrailingUncommittedNestedMarkers(
  markers: readonly ParsedBlockquoteMarker[]
): readonly ParsedBlockquoteMarker[] {
  const lastMarkerWithPaddingIndex = findLastIndex(
    markers,
    (entry) => entry.sourcePrefixEndOffset > entry.marker.markerEnd
  );

  if (lastMarkerWithPaddingIndex < 0 || lastMarkerWithPaddingIndex === markers.length - 1) {
    return markers;
  }

  return markers.slice(0, lastMarkerWithPaddingIndex + 1);
}

function findLastIndex<TValue>(
  values: readonly TValue[],
  predicate: (value: TValue) => boolean
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index]!)) {
      return index;
    }
  }

  return -1;
}

type MarkerCursor = {
  offset: number;
  column: number;
};

function findNextMarker(
  source: string,
  offset: number,
  column: number,
  lineEndOffset: number
): MarkerCursor | null {
  let cursor = offset;
  let cursorColumn = column;

  while (cursor < lineEndOffset) {
    const character = source[cursor];

    if (character === ">") {
      return {
        offset: cursor,
        column: cursorColumn
      };
    }

    if (character !== " " && character !== "\t") {
      return null;
    }

    const nextColumn = advanceColumn(cursorColumn, character);
    if (nextColumn - column > 3) {
      return null;
    }

    cursor += 1;
    cursorColumn = nextColumn;
  }

  return null;
}

function consumeOptionalMarkerPadding(
  source: string,
  offset: number,
  column: number,
  lineEndOffset: number
): MarkerCursor {
  if (offset >= lineEndOffset || (source[offset] !== " " && source[offset] !== "\t")) {
    return {
      offset,
      column
    };
  }

  return {
    offset: offset + 1,
    column: advanceColumn(column, source[offset]!)
  };
}

function advanceColumn(column: number, character: string): number {
  if (character === "\t") {
    return column + (4 - (column % 4));
  }

  return column + 1;
}
