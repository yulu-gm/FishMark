import { parse, postprocess, preprocess } from "micromark";
import { math } from "micromark-extension-math";
import type { Event, Token, Extension } from "micromark-util-types";

import type { MarkdownParseOptions } from "../parse-instrumentation";

// 结构和定义扫描不消费行内样式；保留 flow、definition、转义及实体处理。
// 行内 AST 仍由 parseInlineAst 独立解析，避免在前置扫描中重复建立这些事件。
export const structuralScanExtension: Extension = {
  disable: { null: ["attention", "autolink", "codeText", "htmlText", "labelStartImage", "labelStartLink", "labelEnd", "mathText"] }
};

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
  options: MarkdownParseOptions = {},
  blockOnly = false
): readonly MicromarkEventView[] {
  options.instrumentation?.onFullDocumentParse({
    kind: "full-document-tree",
    sourceLength: source.length
  });
  const events: Event[] = postprocess(
    parse({ extensions: [math({ singleDollarTextMath: true }), ...(blockOnly ? [structuralScanExtension] : [])] })
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
