// Vitest 的 tsconfig 不自动包含 renderer 的本地声明；引用不会产生运行时导入。
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./turndown-plugin-gfm.d.ts" />
/* eslint-enable @typescript-eslint/triple-slash-reference */

import TurndownService from "turndown";
import { tables } from "turndown-plugin-gfm";

/**
 * 仅转换 text/html。没有可转换的内容时返回 null，由调用方直接使用原始 text/plain。
 */
export function convertHtmlPasteToMarkdown(html: string): string | null {
  if (!html.trim()) return null;

  // template 的内容在惰性文档里解析，不接入页面，也不会加载剪贴板里的图片。
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content;
  for (const node of root.querySelectorAll("script, style, template, iframe, object, embed, svg, math, noscript")) {
    node.remove();
  }
  for (const node of root.querySelectorAll("a[href], img")) {
    const isImage = node.tagName === "IMG";
    const attribute = isImage ? "src" : "href";
    const url = node.getAttribute(attribute)?.trim() ?? "";
    if (isSafeDestination(url, isImage)) {
      // 保留相对路径和锚点；不要用会按当前页面地址解析的 href/src 属性。
      node.setAttribute(attribute, url.replace(/[ &<>]/gu, char => char === "&" ? "&amp;" : encodeURIComponent(char)));
      const title = node.getAttribute("title");
      if (title && /[\\\r\n]/u.test(title)) node.removeAttribute("title");
    } else if (isImage) {
      node.replaceWith(node.getAttribute("alt") ?? "");
    } else {
      node.removeAttribute(attribute);
    }
  }

  for (const br of root.querySelectorAll("pre br")) br.replaceWith("\n");

  for (const table of Array.from(root.querySelectorAll("table")).reverse()) {
    if (table.parentElement?.closest("table")) {
      table.replaceWith(table.textContent);
      continue;
    }
    const rows = expandTableCells(table);
    const [first, ...rest] = rows;
    if (!first) {
      table.remove();
      continue;
    }
    // GFM 必须有表头；没有 th 的普通表格也用第一行作表头，避免插件原样输出 HTML。
    const head = root.ownerDocument.createElement("thead");
    const body = root.ownerDocument.createElement("tbody");
    head.append(first);
    body.append(...rest);
    table.replaceChildren(head, body);
  }

  const converter = new TurndownService({
    headingStyle: "atx", codeBlockStyle: "fenced", preformattedCode: true, bulletListMarker: "-", emDelimiter: "*"
  });
  converter.use(tables);
  const escape = converter.escape.bind(converter);
  // HTML 文本节点是可见文字，转义 Markdown 标记，避免把字面文本当作新格式。
  converter.escape = text => escape(text).replace(/[<&~]/gu, "\\$&");
  converter.addRule("clipboardStrikethrough", {
    filter: ["del", "s"],
    replacement: content => content ? `~~${content}~~` : ""
  });
  converter.addRule("clipboardTaskCheckbox", {
    filter: "input",
    replacement: (_, node) => {
      const checkbox = node as HTMLInputElement;
      if (checkbox.type !== "checkbox" || !checkbox.closest("li")) return "";
      const marker = checkbox.checked ? "[x]" : "[ ]";
      return /^\s/u.test(checkbox.nextSibling?.textContent ?? "") &&
        checkbox.nextSibling?.nodeType === Node.TEXT_NODE ? marker : `${marker} `;
    }
  });
  converter.addRule("clipboardCodeBlock", {
    filter: "pre",
    replacement: (_, node) => {
      const language = node.querySelector("code")?.className.match(/(?:^|\s)language-([\w+.#-]+)(?=\s|$)/u)?.[1] ?? "";
      const code = node.textContent ?? "";
      let fenceLength = 3;
      // 缩进的反引号也可能被当成闭围栏，因此围栏要比正文里的反引号串长。
      for (const match of code.matchAll(/`{3,}/gu)) fenceLength = Math.max(fenceLength, match[0].length + 1);
      const fence = "`".repeat(fenceLength);
      return `\n\n${fence}${language}\n${code.replace(/\n$/u, "")}\n${fence}\n\n`;
    }
  });
  converter.addRule("clipboardTableBreak", {
    filter: node => node.nodeName === "BR" && node.closest("td, th") !== null,
    replacement: () => "<br>"
  });
  converter.addRule("clipboardTableCell", {
    filter: ["td", "th"],
    replacement: (content, node) => {
      const cell = node as HTMLTableCellElement;
      const text = content.trim().replace(/\n+/gu, "<br>").replace(/\|/gu, "\\|");
      return `${cell.cellIndex === 0 ? "|" : ""} ${text} |`;
    }
  });
  return converter.turndown(root).trim() || null;
}

function expandTableCells(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows = Array.from(table.rows);
  const slots: (HTMLTableCellElement | null)[][] = rows.map(() => []);
  let groupEnd = 0;
  for (const [index, row] of rows.entries()) {
    if (index === groupEnd) {
      do {
        groupEnd++;
      } while (rows[groupEnd]?.parentElement === row.parentElement);
    }

    const rowSlots = slots[index]!;
    let column = 0;
    for (const cell of row.cells) {
      const width = cell.colSpan;
      for (let offset = 0; offset < width; offset++) {
        if (rowSlots[column + offset] !== undefined) {
          column += offset + 1;
          offset = -1;
        }
      }

      // 保留左上角的原节点及行内格式；其余格子占位，后面的单元格不能左移。
      const end = cell.rowSpan === 0 ? groupEnd : Math.min(index + cell.rowSpan, groupEnd);
      for (let r = index; r < end; r++) {
        for (let c = column; c < column + width; c++) slots[r]![c] = null;
      }
      rowSlots[column] = cell;
      column += width;
    }
  }

  const width = slots.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.filter((row, index) => {
    const rowSlots = slots[index]!;
    if (rowSlots.length === 0) return false;
    row.replaceChildren(...Array.from({ length: width }, (_, column) => {
      const cell = rowSlots[column] ?? table.ownerDocument.createElement("td");
      cell.removeAttribute("rowspan");
      cell.removeAttribute("colspan");
      return cell;
    }));
    return true;
  });
}

function isSafeDestination(url: string, isImage: boolean): boolean {
  // 拒绝控制字符和反斜杠，避免 URL 解析或 Markdown 转义改变目的地。
  if (!url || Array.from(url).some(char => char.charCodeAt(0) < 32 || char === "\\" || char === "\u007f")) return false;
  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(url)?.[1]?.toLowerCase();
  return scheme === undefined || scheme === "http" || scheme === "https" || (!isImage && scheme === "mailto");
}
