import type { TableAlignment } from "./block-map";
import { createCanonicalTableModel, type CanonicalTableModel } from "./table-model";

export function formatTableMarkdown(model: {
  hasHeader?: boolean;
  rowSeparator?: "compact" | "loose";
  alignments: readonly TableAlignment[];
  header: readonly string[];
  rows: readonly (readonly string[])[];
}): string {
  const canonicalModel = createCanonicalTableModel(model);
  const widths = computeColumnWidths(canonicalModel);

  if (!canonicalModel.hasHeader) {
    return [canonicalModel.header, ...canonicalModel.rows]
      .map((row) => formatRow(row, widths, canonicalModel.alignments))
      .join(canonicalModel.rowSeparator === "loose" ? "\n\n" : "\n");
  }

  return [
    formatRow(canonicalModel.header, widths, canonicalModel.alignments),
    formatDelimiter(canonicalModel.alignments, widths),
    ...canonicalModel.rows.map((row) => formatRow(row, widths, canonicalModel.alignments))
  ].join("\n");
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

function formatRow(
  cells: readonly string[],
  widths: readonly number[],
  alignments: readonly TableAlignment[]
): string {
  const padded = cells.map((cell, index) => {
    const width = widths[index] ?? cell.length;
    const alignment = alignments[index] ?? "left";

    if (alignment === "right") {
      return cell.padStart(width, " ");
    }

    if (alignment === "center") {
      const totalPadding = Math.max(width - cell.length, 0);
      const leftPadding = Math.floor(totalPadding / 2);
      const rightPadding = totalPadding - leftPadding;
      return `${" ".repeat(leftPadding)}${cell}${" ".repeat(rightPadding)}`;
    }

    return cell.padEnd(width, " ");
  });

  return `| ${padded.join(" | ")} |`;
}

function formatDelimiter(
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
