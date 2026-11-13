/**
 * 将剪贴板中的首个 HTML 表格或 TSV 转为矩形。普通单行文本交给原生粘贴。
 */
export function parseTableClipboard(clipboardData: Pick<DataTransfer, "getData"> | null): string[][] | null {
  if (!clipboardData) {
    return null;
  }

  const html = clipboardData.getData("text/html");
  return (html && typeof DOMParser !== "undefined" ? parseHtmlTable(html) : null) ??
    parseTsv(clipboardData.getData("text/plain"));
}

function toRectangle(rows: string[][]): string[][] | null {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return width === 0 ? null : rows.map((row) =>
    Array.from({ length: width }, (_, column) => row[column] ?? "")
  );
}

function parseHtmlTable(html: string): string[][] | null {
  // 只从独立的解析文档读文本，不把任何剪贴板节点插入编辑器。
  const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
  if (!table) {
    return null;
  }

  const sourceRows = Array.from(table.rows);
  const rows: string[][] = sourceRows.map(() => []);
  let groupEnd = 0;
  for (const [rowIndex, sourceRow] of sourceRows.entries()) {
    if (rowIndex === groupEnd) {
      do {
        groupEnd++;
      } while (sourceRows[groupEnd]?.parentElement === sourceRow.parentElement);
    }

    const row = rows[rowIndex]!;
    let column = 0;
    for (const cell of sourceRow.cells) {
      // 合并区域只在左上角保留文字；空字符串也代表位置已占用。
      const width = cell.colSpan;
      for (let offset = 0; offset < width; offset++) {
        if (row[column + offset] !== undefined) {
          column += offset + 1;
          offset = -1;
        }
      }

      // rowspan="0" 延伸到当前行组末尾；其他跨度也不能越过行组。
      const end = cell.rowSpan === 0 ? groupEnd : Math.min(rowIndex + cell.rowSpan, groupEnd);
      for (let r = rowIndex; r < end; r++) {
        for (let c = column; c < column + width; c++) {
          rows[r]![c] = "";
        }
      }
      row[column] = readCellText(cell);
      column += width;
    }
  }

  return toRectangle(rows);
}

function readCellText(node: Node): string {
  switch (node.nodeName) {
    case "#text":
      return node.nodeValue ?? "";
    case "BR":
      return "\n";
    case "SCRIPT":
    case "STYLE":
    case "TEMPLATE":
      return "";
    default:
      return Array.from(node.childNodes, readCellText).join("");
  }
}

function parseTsv(text: string): string[][] | null {
  if (!/[\t\r\n]/.test(text)) {
    return null;
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;
  for (;;) {
    let field = "";
    if (text[index] === '"') {
      index++;
      // 引号内的制表符和换行属于字段；连续两个双引号表示一个字面引号。
      while (true) {
        const char = text[index++];
        if (char === undefined) {
          return null;
        }
        if (char !== '"') {
          field += char;
        } else if (text[index] === '"') {
          field += '"';
          index++;
        } else {
          break;
        }
      }
      if (index < text.length && !/[\t\r\n]/.test(text[index]!)) {
        return null;
      }
    } else {
      const start = index;
      while (index < text.length && !/[\t\r\n]/.test(text[index]!)) {
        index++;
      }
      field = text.slice(start, index);
    }

    row.push(field.replace(/\r\n?/g, "\n"));
    const separator = text[index++];
    if (separator === "\t") {
      // 即使已到字符串末尾，也要再读一个空字段。
      continue;
    }
    rows.push(row);
    row = [];
    if (separator === "\r" && text[index] === "\n") {
      index++;
    }
    if (index >= text.length) {
      break;
    }
  }

  return toRectangle(rows);
}
