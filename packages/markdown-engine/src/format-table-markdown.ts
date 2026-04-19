import type { TableAlignment } from "./block-map";
import { createCanonicalTableModel, type CanonicalTableModel } from "./table-model";

export type TableCellOffset = {
  contentStartOffset: number;
  contentEndOffset: number;
};

export type FormattedTableWithOffsets = {
  text: string;
  cells: {
    header: TableCellOffset[];
    rows: TableCellOffset[][];
  };
};

type TableModelInput = {
  hasHeader?: boolean;
  rowSeparator?: "compact" | "loose";
  alignments: readonly TableAlignment[];
  header: readonly string[];
  rows: readonly (readonly string[])[];
};

export function formatTableMarkdown(model: TableModelInput): string {
  return formatTableMarkdownWithOffsets(model).text;
}

/**
 * Serialise a canonical table model to markdown and emit per-cell content offsets in a single
 * pass. Offsets are relative to the start of the returned `text` and point at the first
 * non-padding character of each cell — callers can add an absolute base offset to resolve a
 * document anchor without re-parsing the generated markdown.
 */
export function formatTableMarkdownWithOffsets(model: TableModelInput): FormattedTableWithOffsets {
  const canonicalModel = createCanonicalTableModel(model);
  const widths = computeColumnWidths(canonicalModel);

  const pieces: string[] = [];
  const headerCells: TableCellOffset[] = [];
  const rowCells: TableCellOffset[][] = [];

  let cursor = 0;

  const appendRow = (cells: readonly string[], collector: TableCellOffset[]): void => {
    const rendered = renderRowWithOffsets(cells, widths, canonicalModel.alignments, cursor);
    pieces.push(rendered.text);
    collector.push(...rendered.cells);
    cursor += rendered.text.length;
  };

  const appendSeparator = (separator: string): void => {
    pieces.push(separator);
    cursor += separator.length;
  };

  appendRow(canonicalModel.header, headerCells);

  if (canonicalModel.hasHeader) {
    appendSeparator("\n");
    const delimiter = renderDelimiter(canonicalModel.alignments, widths);
    pieces.push(delimiter);
    cursor += delimiter.length;
  }

  const bodySeparator = canonicalModel.hasHeader || canonicalModel.rowSeparator !== "loose" ? "\n" : "\n\n";

  for (const row of canonicalModel.rows) {
    appendSeparator(bodySeparator);
    const rowOffsets: TableCellOffset[] = [];
    appendRow(row, rowOffsets);
    rowCells.push(rowOffsets);
  }

  return {
    text: pieces.join(""),
    cells: { header: headerCells, rows: rowCells }
  };
}

function computeColumnWidths(model: CanonicalTableModel): number[] {
  const widths = model.header.map((cell) => cell.length);

  for (const row of model.rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }

  return widths.map((width) => Math.max(width, 1));
}

function renderRowWithOffsets(
  cells: readonly string[],
  widths: readonly number[],
  alignments: readonly TableAlignment[],
  baseOffset: number
): { text: string; cells: TableCellOffset[] } {
  const offsets: TableCellOffset[] = [];
  let text = "| ";
  let cursor = baseOffset + text.length;

  cells.forEach((cell, index) => {
    const width = widths[index] ?? cell.length;
    const alignment = alignments[index] ?? "left";
    const padded = padCell(cell, width, alignment);

    const contentStart = cursor + padded.contentStartWithinCell;
    const contentEnd = contentStart + cell.length;
    offsets.push({ contentStartOffset: contentStart, contentEndOffset: contentEnd });

    text += padded.text;
    cursor += padded.text.length;

    if (index < cells.length - 1) {
      text += " | ";
      cursor += 3;
    }
  });

  text += " |";
  return { text, cells: offsets };
}

function padCell(
  cell: string,
  width: number,
  alignment: TableAlignment
): { text: string; contentStartWithinCell: number } {
  if (alignment === "right") {
    return {
      text: cell.padStart(width, " "),
      contentStartWithinCell: Math.max(width - cell.length, 0)
    };
  }

  if (alignment === "center") {
    const totalPadding = Math.max(width - cell.length, 0);
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;
    return {
      text: `${" ".repeat(leftPadding)}${cell}${" ".repeat(rightPadding)}`,
      contentStartWithinCell: leftPadding
    };
  }

  return {
    text: cell.padEnd(width, " "),
    contentStartWithinCell: 0
  };
}

function renderDelimiter(
  alignments: readonly TableAlignment[],
  widths: readonly number[]
): string {
  const cells = alignments.map((alignment, index) => {
    const width = Math.max(widths[index] ?? 1, 3);

    if (alignment === "none") {
      return "-".repeat(width);
    }

    if (alignment === "left") {
      return `:${"-".repeat(Math.max(width - 1, 3))}`;
    }

    if (alignment === "right") {
      return `${"-".repeat(Math.max(width - 1, 3))}:`;
    }

    if (alignment === "center") {
      return `:${"-".repeat(Math.max(width - 2, 3))}:`;
    }

    return "-".repeat(width);
  });

  return `| ${cells.join(" | ")} |`;
}
