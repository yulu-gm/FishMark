import { parse, postprocess, preprocess } from "micromark";
import { math } from "micromark-extension-math";
import type { Event, Token } from "micromark-util-types";

import type { MarkdownParseOptions } from "../parse-instrumentation";

// A flattened, offset-bearing view of micromark's document event stream. The recursive parser
// consumes only this view, so it never re-scans source text to discover container children.
export interface MicromarkEventView {
  readonly kind: "enter" | "exit";
  readonly type: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly token: Token;
}

export function collectMicromarkEventViews(
  source: string,
  options: MarkdownParseOptions = {}
): readonly MicromarkEventView[] {
  options.instrumentation?.onFullDocumentParse({
    kind: "full-document-tree",
    sourceLength: source.length
  });
  const events: Event[] = postprocess(
    parse({ extensions: [math({ singleDollarTextMath: true })] })
      .document()
      .write(preprocess()(source, "utf8", true))
  );
  return events.map(([kind, token]) => ({
    kind,
    type: token.type,
    startOffset: token.start.offset,
    endOffset: token.end.offset,
    startLine: token.start.line,
    endLine: token.end.line,
    token
  }));
}
