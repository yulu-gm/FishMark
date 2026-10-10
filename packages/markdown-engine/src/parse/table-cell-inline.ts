import type { TableCell } from "../block-map";
import type { InlineRoot } from "../inline-ast";
import { parseInlineAst } from "../parse-inline-ast";
import type { SourceText } from "../source-text";
import { projectTableCellSource } from "../table-cell-source";
import type { LeafNodeContext } from "./leaf-nodes";

// Tables decode escaped pipes before inline parsing, including pipes in code
// spans. Keep a boundary map so every resulting AST range still addresses the
// original Markdown rather than the shorter cell display text.
export function createTableCellInline(cell: TableCell, context: LeafNodeContext): InlineRoot {
  const base = cell.contentStartOffset;
  const raw = context.source.slice(base, cell.contentEndOffset);
  const { text: decoded, boundaries } = projectTableCellSource(raw);
  // A bounded source view retains absolute coordinates without allocating the
  // document prefix once per cell. Inline parsing reads only this cell window.
  const source: SourceText = {
    length: base + decoded.length,
    slice: (from = base, to = base + decoded.length) => decoded.slice(Math.max(0, from - base), Math.max(0, to - base)),
    charAt: (offset) => decoded.charAt(offset - base),
    indexOf: (text, from = base) => {
      const index = decoded.indexOf(text, Math.max(0, from - base));
      return index < 0 ? -1 : base + index;
    }
  };
  const inline = parseInlineAst(source, base, source.length, {
    instrumentation: context.instrumentation,
    referenceDefinitions: context.referenceDefinitions,
    footnoteDefinitions: context.footnoteDefinitions
  });
  return mapOffsets(inline);

  function mapOffsets<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((entry: unknown) => mapOffsets(entry)) as T;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      key.endsWith("Offset") && typeof child === "number" && child >= base && child <= source.length
        ? base + boundaries[child - base]!
        : mapOffsets(child)
    ])) as T;
  }
}
