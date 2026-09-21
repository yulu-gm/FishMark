import { Decoration } from "@codemirror/view";
import { type Range } from "@codemirror/state";
import { classHighlighter, highlightTree } from "@lezer/highlight";

import {
  CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT,
  createCodeHighlightCacheKey,
  readCodeHighlightCache,
  recordCodeHighlightParserRun,
  recordCodeHighlightSkippedLongBlock,
  writeCodeHighlightCache,
  type CachedCodeHighlightRange
} from "./code-highlight-cache";
import {
  requestCodeHighlightParser,
  resolveCodeHighlightLanguageKey
} from "./code-highlight-language-loader";

// Code fence highlighting stays synchronous. Parser packages are requested on
// first use, then the editor refreshes decorations once the chunk is ready.

export function appendCodeHighlightRanges(
  source: string,
  codeStartOffset: number,
  codeEndOffset: number,
  info: string | null,
  ranges: Range<Decoration>[]
): void {
  if (codeEndOffset <= codeStartOffset) {
    return;
  }
  const languageKey = resolveCodeHighlightLanguageKey(info);
  if (!languageKey) {
    return;
  }
  const code = source.slice(codeStartOffset, codeEndOffset);

  if (code.length > CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT) {
    recordCodeHighlightSkippedLongBlock();
    return;
  }

  const parser = requestCodeHighlightParser(languageKey);
  if (!parser) {
    return;
  }

  const cacheKey = createCodeHighlightCacheKey(languageKey, code);
  const cachedRanges = readCodeHighlightCache(cacheKey);

  if (cachedRanges) {
    appendCachedRanges(codeStartOffset, cachedRanges, ranges);
    return;
  }

  let tree;
  try {
    recordCodeHighlightParserRun();
    tree = parser.parse(code);
  } catch {
    return;
  }
  const relativeRanges: CachedCodeHighlightRange[] = [];

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (to <= from || !classes) {
      return;
    }
    relativeRanges.push({ from, to, className: classes });
  });

  writeCodeHighlightCache(cacheKey, relativeRanges);
  appendCachedRanges(codeStartOffset, relativeRanges, ranges);
}

function appendCachedRanges(
  codeStartOffset: number,
  cachedRanges: readonly CachedCodeHighlightRange[],
  ranges: Range<Decoration>[]
): void {
  for (const range of cachedRanges) {
    ranges.push(
      Decoration.mark({ class: range.className }).range(
        codeStartOffset + range.from,
        codeStartOffset + range.to
      )
    );
  }
}
