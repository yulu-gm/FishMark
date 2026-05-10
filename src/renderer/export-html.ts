import {
  collectReferenceDefinitions,
  computeTableColumnLayout,
  formatTableColumnWidthPercent,
  parseInlineAst,
  parseMarkdownDocument,
  resolveIndentedCodeContentStartOffset,
  tableBlockToCanonicalModel,
  type BlockquoteBlock,
  type CodeFenceBlock,
  type HeadingBlock,
  type HtmlImageBlock,
  type InlineNode,
  type InlineRoot,
  type ListBlock,
  type ListItemBlock,
  type MarkdownBlock,
  type ParagraphBlock,
  type TableBlock,
  type TableCell,
  type ThematicBreakBlock
} from "@fishmark/markdown-engine";

export type FishmarkExportRootAttributes = {
  className?: string | null;
  colorScheme?: string | null;
  style?: string | null;
  theme?: string | null;
  themeMode?: string | null;
};

export type CreateFishmarkExportHtmlInput = {
  cssText?: string;
  markdown: string;
  rootAttributes?: FishmarkExportRootAttributes;
  title: string;
};

type SourceLine = {
  endOffset: number;
  startOffset: number;
  text: string;
};
type ReferenceDefinitions = ReturnType<typeof collectReferenceDefinitions>;

const EXPORT_ROOT_CLASS_NAME = "fishmark-html-export-root";

const EXPORT_RUNTIME_CSS = `
.fishmark-html-export-root {
  height: auto;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}

.fishmark-html-export {
  height: auto;
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--fishmark-editor-bg, var(--fishmark-workspace-bg, #fffefb));
  color: var(--fishmark-editor-fg, var(--fishmark-text-primary, #171a1f));
}

.fishmark-html-export .fishmark-export-page {
  min-height: 100vh;
}

.fishmark-html-export .document-editor {
  width: 100%;
  min-height: 100vh;
  margin: 0 auto;
  border-radius: 0;
  overflow: visible;
}

.fishmark-html-export .document-editor .cm-editor,
.fishmark-html-export .document-editor .cm-scroller,
.fishmark-html-export .document-editor .cm-content {
  min-height: 100vh;
  height: auto;
}

.fishmark-html-export .document-editor .cm-scroller {
  overflow: visible;
}

.fishmark-html-export .document-editor .cm-content {
  box-sizing: border-box;
  outline: none;
  white-space: pre-wrap;
}

.fishmark-html-export .document-editor .cm-line {
  display: block;
}

.fishmark-html-export .document-editor .cm-line.cm-inactive-blank-line {
  height: 0;
  min-height: 0;
  line-height: 0;
  overflow: hidden;
}

.fishmark-html-export .cm-table-widget-input {
  caret-color: transparent;
}
`.trim();

export function createFishmarkExportHtml(input: CreateFishmarkExportHtmlInput): string {
  const rootAttributes = input.rootAttributes ?? {};
  const htmlAttributes = createHtmlAttributes(rootAttributes);
  const cssText = sanitizeStyleText([input.cssText?.trim(), EXPORT_RUNTIME_CSS].filter(Boolean).join("\n\n"));
  const contentHtml = renderMarkdownContent(input.markdown);

  return [
    "<!doctype html>",
    `<html${htmlAttributes}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    '<meta name="generator" content="FishMark">',
    `<style>${cssText}</style>`,
    "</head>",
    '<body class="fishmark-html-export">',
    '<main class="fishmark-export-page">',
    '<article class="document-editor" aria-label="Exported Markdown document">',
    '<div class="cm-editor">',
    '<div class="cm-scroller">',
    `<div class="cm-content" contenteditable="false" spellcheck="false">${contentHtml}</div>`,
    "</div>",
    "</div>",
    "</article>",
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}

export function collectReadableStyleSheetText(targetDocument: Document = document): string {
  const rules: string[] = [];

  for (const sheet of Array.from(targetDocument.styleSheets)) {
    try {
      rules.push(...Array.from(sheet.cssRules).map((rule) => rule.cssText));
    } catch {
      const ownerNode = sheet.ownerNode;
      if (ownerNode instanceof HTMLStyleElement && ownerNode.textContent) {
        rules.push(ownerNode.textContent);
      }
    }
  }

  return rules.join("\n");
}

export function collectRootExportAttributes(targetDocument: Document = document): FishmarkExportRootAttributes {
  const root = targetDocument.documentElement;
  return {
    className: root.getAttribute("class"),
    colorScheme: root.style.colorScheme || null,
    style: root.getAttribute("style"),
    theme: root.getAttribute("data-fishmark-theme"),
    themeMode: root.getAttribute("data-fishmark-theme-mode")
  };
}

function renderMarkdownContent(markdown: string): string {
  const documentModel = parseMarkdownDocument(markdown);
  const referenceDefinitions = collectReferenceDefinitions(markdown);
  const chunks: string[] = [];
  let cursor = 0;

  for (const block of documentModel.blocks) {
    if (block.startOffset > cursor) {
      chunks.push(renderPlainLines(markdown, cursor, block.startOffset));
    }

    chunks.push(renderBlock(block, markdown, referenceDefinitions));
    cursor = Math.max(cursor, block.endOffset);
  }

  if (cursor < markdown.length) {
    chunks.push(renderPlainLines(markdown, cursor, markdown.length));
  }

  if (chunks.length === 0) {
    return renderLine("", "<br>");
  }

  return chunks.filter(Boolean).join("");
}

function renderBlock(block: MarkdownBlock, source: string, referenceDefinitions: ReferenceDefinitions): string {
  switch (block.type) {
    case "heading":
      return renderHeadingBlock(block, source);
    case "paragraph":
      return renderParagraphBlock(block, source, referenceDefinitions);
    case "list":
      return renderListBlock(block, source, referenceDefinitions);
    case "blockquote":
      return renderBlockquoteBlock(block, source);
    case "codeFence":
      return renderCodeFenceBlock(block, source);
    case "definition":
      return renderDefinitionBlock();
    case "thematicBreak":
      return renderThematicBreakBlock(block, source);
    case "htmlImage":
      return renderHtmlImageBlock(block);
    case "table":
      return renderTableBlock(block);
  }
}

function renderHeadingBlock(block: HeadingBlock, source: string): string {
  const line = createSourceLines(source, block.startOffset, block.endOffset)[0];
  if (!line) {
    return "";
  }

  const contentStartOffset = block.inline?.startOffset ?? block.markerEnd ?? block.startOffset;
  const markerEnd = Math.min(block.markerEnd ?? contentStartOffset, line.endOffset);
  const contentEndOffset = Math.min(block.inline?.endOffset ?? line.endOffset, line.endOffset);
  const inlineHtml = block.inline
    ? renderInlineRoot(block.inline, source)
    : renderDecoratedPlainText(source.slice(contentStartOffset, contentEndOffset));
  const trailingHtml = renderDecoratedPlainText(source.slice(contentEndOffset, line.endOffset));

  return renderLine(
    `cm-inactive-heading cm-inactive-heading-depth-${block.depth}`,
    [
      renderSpan("cm-inactive-heading-marker", source.slice(block.startOffset, markerEnd)),
      inlineHtml,
      trailingHtml
    ].join("")
  );
}

function renderParagraphBlock(
  block: ParagraphBlock,
  source: string,
  referenceDefinitions: ReferenceDefinitions
): string {
  return createSourceLines(source, block.startOffset, block.endOffset)
    .map((line) =>
      renderLine(
        "cm-inactive-paragraph cm-inactive-paragraph-leading",
        renderInlineRange(source, line.startOffset, line.endOffset, referenceDefinitions) || "<br>"
      )
    )
    .join("");
}

function renderListBlock(
  block: ListBlock,
  source: string,
  referenceDefinitions: ReferenceDefinitions
): string {
  return block.items.map((item) => renderListItem(item, source, block.ordered, referenceDefinitions)).join("");
}

function renderListItem(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  referenceDefinitions: ReferenceDefinitions
): string {
  const contentUpperBound = item.children[0]?.startOffset ?? item.endOffset;
  const lines = createSourceLines(source, item.startOffset, contentUpperBound);
  const chunks = lines.map((line) =>
    line.startOffset === item.startOffset
      ? renderListItemFirstLine(item, source, line, ordered, referenceDefinitions)
      : renderListItemContinuationLine(item, source, line, ordered, referenceDefinitions)
  );

  for (const child of item.children) {
    chunks.push(renderListBlock(child, source, referenceDefinitions));
  }

  return chunks.filter(Boolean).join("");
}

function renderListItemFirstLine(
  item: ListItemBlock,
  source: string,
  line: SourceLine,
  ordered: boolean,
  referenceDefinitions: ReferenceDefinitions
): string {
  const contentStartOffset = resolveListItemContentStartOffset(item, source, line.endOffset);
  const lineAttributes = createListItemLineAttributes(item, source, ordered, "first");
  const taskHtml = item.task ? renderTaskMarker(item.task.checked) : "";
  const taskStartOffset = item.task?.markerStart ?? contentStartOffset;
  const taskEndOffset = item.task?.markerEnd ?? contentStartOffset;
  const inlineStart = Math.min(contentStartOffset, line.endOffset);
  const innerHtml = [
    renderSpan("cm-inactive-list-source-prefix", source.slice(item.startOffset, item.markerStart)),
    renderSpan("cm-inactive-list-marker", source.slice(item.markerStart, item.markerEnd)),
    renderSpan("cm-inactive-list-source-prefix", source.slice(item.markerEnd, taskStartOffset)),
    taskHtml,
    renderSpan("cm-inactive-list-source-prefix", source.slice(taskEndOffset, inlineStart)),
    renderInlineRange(source, inlineStart, line.endOffset, referenceDefinitions)
  ].join("");

  return renderLine(lineAttributes.className, innerHtml || "<br>", { style: lineAttributes.style });
}

function renderListItemContinuationLine(
  item: ListItemBlock,
  source: string,
  line: SourceLine,
  ordered: boolean,
  referenceDefinitions: ReferenceDefinitions
): string {
  if (isExplicitThematicBreakLine(line.text)) {
    return renderLine(
      "cm-inactive-thematic-break",
      renderSpan("cm-inactive-thematic-break-marker", line.text)
    );
  }

  const contentStartOffset = consumeHorizontalSpace(source, line.startOffset, line.endOffset);
  const lineAttributes = createListItemLineAttributes(
    item,
    source,
    ordered,
    "continuation",
    Math.max(contentStartOffset - line.startOffset, 0)
  );
  const innerHtml = [
    renderSpan("cm-inactive-list-source-prefix", source.slice(line.startOffset, contentStartOffset)),
    renderInlineRange(source, contentStartOffset, line.endOffset, referenceDefinitions)
  ].join("");

  return renderLine(lineAttributes.className, innerHtml || "<br>", { style: lineAttributes.style });
}

function renderBlockquoteBlock(block: BlockquoteBlock, source: string): string {
  const renderableLines = (block.lines ?? []).filter((line) => line.contentStartOffset > line.markerEnd);
  const lastIndex = renderableLines.length - 1;

  return renderableLines
    .map((line, index) => {
      const lineClasses = [
        "cm-inactive-blockquote",
        createInactiveBlockquoteDepthClass(line.quoteDepth)
      ];
      if (index === 0) {
        lineClasses.push("cm-inactive-blockquote-start");
      }
      if (index === lastIndex) {
        lineClasses.push("cm-inactive-blockquote-end");
      }

      const innerHtml = [
        renderSpan("cm-inactive-blockquote-marker", source.slice(line.startOffset, line.contentStartOffset)),
        renderInlineRoot(line.inline, source)
      ].join("");

      return renderLine(lineClasses.join(" "), innerHtml || "<br>");
    })
    .join("");
}

function createInactiveBlockquoteDepthClass(depth: number): string {
  return `cm-inactive-blockquote-depth-${Math.max(1, Math.min(depth, 4))}`;
}

function renderCodeFenceBlock(block: CodeFenceBlock, source: string): string {
  const lines = createSourceLines(source, block.startOffset, block.endOffset);
  if (lines.length === 0) {
    return "";
  }

  if (block.kind === "indented") {
    return renderIndentedCodeBlock(lines, source);
  }

  const fenceLineIndexes = new Set<number>([0]);
  const lastLine = lines[lines.length - 1];
  if (lines.length > 1 && lastLine && isCodeFenceLine(lastLine.text)) {
    fenceLineIndexes.add(lines.length - 1);
  }

  const contentLineIndexes = lines
    .map((_, index) => index)
    .filter((index) => !fenceLineIndexes.has(index));
  const lastContentLineIndex = contentLineIndexes[contentLineIndexes.length - 1] ?? null;
  const languageLabel = formatLanguageLabel(block.info);

  return lines
    .map((line, index) => {
      if (fenceLineIndexes.has(index)) {
        return renderLine(
          "cm-inactive-code-block-fence",
          renderSpan("cm-inactive-code-block-fence-marker", line.text)
        );
      }

      const lineClasses = ["cm-inactive-code-block"];
      if (index === contentLineIndexes[0]) {
        lineClasses.push("cm-inactive-code-block-start");
      }
      if (index === lastContentLineIndex) {
        lineClasses.push("cm-inactive-code-block-end");
      }

      return renderLine(
        lineClasses.join(" "),
        escapeHtml(line.text) || "<br>",
        index === lastContentLineIndex && languageLabel ? { "data-language": languageLabel } : {}
      );
    })
    .join("");
}

function renderIndentedCodeBlock(lines: SourceLine[], source: string): string {
  const lastIndex = lines.length - 1;

  return lines
    .map((line, index) => {
      const lineClasses = ["cm-inactive-code-block"];
      if (index === 0) {
        lineClasses.push("cm-inactive-code-block-start");
      }
      if (index === lastIndex) {
        lineClasses.push("cm-inactive-code-block-end");
      }

      const contentStartOffset = resolveIndentedCodeContentStartOffset(source, line.startOffset, line.endOffset);
      const markerHtml = renderSpan(
        "cm-inactive-code-block-indent-marker",
        source.slice(line.startOffset, contentStartOffset)
      );
      const codeHtml = escapeHtml(source.slice(contentStartOffset, line.endOffset));

      return renderLine(lineClasses.join(" "), markerHtml + (codeHtml || "<br>"));
    })
    .join("");
}

function renderThematicBreakBlock(block: ThematicBreakBlock, source: string): string {
  const marker = source.slice(block.startOffset, block.endOffset);
  return renderLine(
    "cm-inactive-thematic-break",
    renderSpan("cm-inactive-thematic-break-marker", marker)
  );
}

function renderHtmlImageBlock(block: HtmlImageBlock): string {
  return renderImagePreview({
    align: block.align,
    alt: block.alt,
    height: block.height,
    href: block.src,
    mode: "inactive",
    width: block.width,
    zoom: block.zoom
  });
}

function renderDefinitionBlock(): string {
  return "";
}

function renderTableBlock(block: TableBlock): string {
  const headerRows = block.hasHeader
    ? `<thead>${renderTableRow(block.header, true)}</thead>`
    : "";
  const bodyRows = [
    ...(block.hasHeader ? [] : [renderTableRow(block.header, false)]),
    ...block.rows.map((row) => renderTableRow(row, false))
  ].join("");

  return [
    `<div class="cm-table-widget" data-table-columns="${block.columnCount}" data-table-start-offset="${block.startOffset}">`,
    '<table class="cm-table-widget-table">',
    renderTableColumnGroup(block),
    headerRows,
    `<tbody>${bodyRows}</tbody>`,
    "</table>",
    "</div>"
  ].join("");
}

function renderTableColumnGroup(block: TableBlock): string {
  const columns = computeTableColumnLayout(tableBlockToCanonicalModel(block)).map((column) => {
    const width = formatTableColumnWidthPercent(column.widthPercent);

    return [
      `<col class="cm-table-widget-column" data-column-index="${column.columnIndex}"`,
      ` style="width: ${width}">`
    ].join("");
  });

  return `<colgroup class="cm-table-widget-column-group">${columns.join("")}</colgroup>`;
}

function renderTableRow(cells: readonly TableCell[], isHeader: boolean): string {
  const rowClass = isHeader ? "cm-table-widget-row cm-table-widget-row-header" : "cm-table-widget-row";
  return `<tr class="${rowClass}">${cells.map((cell) => renderTableCell(cell, isHeader)).join("")}</tr>`;
}

function renderTableCell(cell: TableCell, isHeader: boolean): string {
  const cellTag = isHeader ? "th" : "td";
  const cellHtml = renderInlineRange(cell.text, 0, cell.text.length) || "<br>";

  return [
    `<${cellTag} class="cm-table-widget-cell" data-active="false">`,
    '<div class="cm-table-widget-input" contenteditable="false" spellcheck="false" tabindex="0"',
    ` role="textbox" data-table-cell="${cell.rowIndex}:${cell.columnIndex}"`,
    ` data-table-cell-preview="${cell.rowIndex}:${cell.columnIndex}">`,
    cellHtml,
    "</div>",
    `</${cellTag}>`
  ].join("");
}

function renderPlainLines(source: string, startOffset: number, endOffset: number): string {
  const contentStartOffset = skipSingleLeadingLineBreak(source, startOffset, endOffset);
  let hasRenderedStructuralBlankLine = false;

  return createSourceLines(source, contentStartOffset, endOffset)
    .map((line) => {
      const isBlankLine = line.text.trim().length === 0;
      const className = isBlankLine && !hasRenderedStructuralBlankLine ? "cm-inactive-blank-line" : "";

      if (isBlankLine) {
        hasRenderedStructuralBlankLine = true;
      }

      return renderLine(className, renderDecoratedPlainText(line.text) || "<br>");
    })
    .join("");
}

function skipSingleLeadingLineBreak(source: string, startOffset: number, endOffset: number): number {
  if (startOffset >= endOffset) {
    return startOffset;
  }

  const firstCharacter = source[startOffset];

  if (firstCharacter === "\r" && source[startOffset + 1] === "\n") {
    return Math.min(startOffset + 2, endOffset);
  }

  if (firstCharacter === "\n") {
    return Math.min(startOffset + 1, endOffset);
  }

  return startOffset;
}

function renderInlineRange(
  source: string,
  startOffset: number,
  endOffset: number,
  referenceDefinitions: ReferenceDefinitions = new Map()
): string {
  if (endOffset <= startOffset) {
    return "";
  }

  return renderInlineRoot(parseInlineAst(source, startOffset, endOffset, { referenceDefinitions }), source);
}

function renderInlineRoot(root: InlineRoot, source: string): string {
  return root.children.map((node) => renderInlineNode(node, source)).join("");
}

function renderInlineNode(node: InlineNode, source: string): string {
  if (shouldRenderNodeAsPlainText(node)) {
    return renderDecoratedPlainText(source.slice(node.startOffset, node.endOffset));
  }

  switch (node.type) {
    case "text":
      return renderDecoratedPlainText(node.value);
    case "hardBreak":
      return "<br>";
    case "codeSpan":
      return [
        renderInlineMarker(source.slice(node.openMarker.startOffset, node.openMarker.endOffset)),
        renderSpan("cm-inactive-inline-code", node.text),
        renderInlineMarker(source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset))
      ].join("");
    case "strong":
    case "emphasis":
    case "strikethrough":
      return [
        renderInlineMarker(source.slice(node.openMarker.startOffset, node.openMarker.endOffset)),
        renderSpan(resolveInlineContainerClass(node.type), renderInlineChildren(node.children, source), {
          escapeContent: false
        }),
        renderInlineMarker(source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset))
      ].join("");
    case "link":
      return [
        renderInlineMarker(source.slice(node.openMarker.startOffset, node.openMarker.endOffset)),
        renderInlineChildren(node.children, source),
        renderInlineMarker(source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset)),
        renderDecoratedPlainText(source.slice(node.closeMarker.endOffset, node.endOffset))
      ].join("");
    case "image":
      return renderImagePreview({
        align: "center",
        alt: readInlineText(node.children),
        href: node.href,
        mode: "inactive"
      });
  }
}

function renderInlineChildren(children: readonly InlineNode[], source: string): string {
  return children.map((child) => renderInlineNode(child, source)).join("");
}

function renderImagePreview(input: {
  align?: "left" | "center" | "right" | null;
  alt: string;
  height?: string | null;
  href: string | null;
  mode: "inactive";
  width?: string | null;
  zoom?: string | null;
}): string {
  const align = input.align ?? "center";
  const imageStyle = createImageStyle(input);
  const imageContent = input.href
    ? `<img class="cm-markdown-image-preview-image" src="${escapeAttribute(input.href)}" alt="${escapeAttribute(input.alt || "Markdown image")}"${imageStyle ? ` style="${escapeAttribute(imageStyle)}"` : ""}>`
    : `<span class="cm-markdown-image-preview-fallback">${escapeHtml(input.alt || "Image preview unavailable")}</span>`;

  return [
    '<span class="cm-markdown-image-preview"',
    ` data-image-preview-mode="${input.mode}" data-image-align="${align}">`,
    imageContent,
    "</span>"
  ].join("");
}

function createImageStyle(input: {
  height?: string | null;
  width?: string | null;
  zoom?: string | null;
}): string {
  const declarations: string[] = [];

  if (input.width) {
    declarations.push(`width: ${normalizeCssLength(input.width)};`);
  }

  if (input.height) {
    declarations.push(`height: ${normalizeCssLength(input.height)};`);
  }

  if (input.zoom) {
    declarations.push(`zoom: ${input.zoom};`);
  }

  return declarations.join(" ");
}

function renderTaskMarker(checked: boolean): string {
  const state = checked ? "checked" : "unchecked";
  return [
    `<span class="cm-inactive-task-marker cm-inactive-task-marker-${state}" data-task-state="${state}" aria-hidden="true">`,
    '<span class="cm-inactive-task-marker-box"></span>',
    '<span class="cm-inactive-task-marker-check"></span>',
    "</span>"
  ].join("");
}

function createListItemLineAttributes(
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  lineKind: "first" | "continuation",
  sourcePrefixLength: number | null = null
): { className: string; style: string } {
  const mode = "inactive";
  const classNames = [
    lineKind === "continuation" ? `cm-${mode}-list-continuation` : `cm-${mode}-list`,
    ordered ? `cm-${mode}-list-ordered` : `cm-${mode}-list-unordered`,
    `cm-${mode}-list-depth-${Math.floor(item.indent / 2)}`
  ];

  if (item.task) {
    classNames.push(
      `cm-${mode}-list-task`,
      item.task.checked ? `cm-${mode}-list-task-checked` : `cm-${mode}-list-task-unchecked`
    );
  }

  return {
    className: classNames.join(" "),
    style: `--fishmark-list-source-prefix-offset: ${sourcePrefixLength ?? getListItemSourcePrefixLength(item, source)}ch;`
  };
}

function getListItemSourcePrefixLength(item: ListItemBlock, source: string): number {
  const lineEndOffset = findLineEndOffset(source, item.startOffset, item.endOffset);
  const contentStartOffset = resolveListItemContentStartOffset(item, source, lineEndOffset);
  return Math.max(contentStartOffset - item.startOffset, 0);
}

function resolveListItemContentStartOffset(
  item: ListItemBlock,
  source: string,
  lineEndOffset: number
): number {
  if (typeof item.contentStartOffset === "number") {
    return Math.min(item.contentStartOffset, lineEndOffset);
  }

  let cursor = consumeHorizontalSpace(source, item.markerEnd, lineEndOffset);

  if (item.task && item.task.markerStart === cursor) {
    cursor = consumeHorizontalSpace(source, item.task.markerEnd, lineEndOffset);
  }

  return Math.min(cursor, lineEndOffset);
}

function shouldRenderNodeAsPlainText(node: InlineNode): boolean {
  switch (node.type) {
    case "text":
      return false;
    case "hardBreak":
      return false;
    case "codeSpan":
      return node.text.length === 0 || node.openMarker.endOffset >= node.closeMarker.startOffset;
    case "strong":
    case "emphasis":
    case "strikethrough":
      return node.children.length === 0 || node.openMarker.endOffset >= node.closeMarker.startOffset;
    case "link":
    case "image":
      return false;
  }
}

function resolveInlineContainerClass(type: "strong" | "emphasis" | "strikethrough"): string {
  switch (type) {
    case "strong":
      return "cm-inactive-inline-strong";
    case "emphasis":
      return "cm-inactive-inline-emphasis";
    case "strikethrough":
      return "cm-inactive-inline-strikethrough";
  }
}

function renderDecoratedPlainText(text: string): string {
  if (text.length === 0) {
    return "";
  }

  const matches = Array.from(text.matchAll(/[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]+/gu));

  if (matches.length === 0) {
    return escapeHtml(text);
  }

  const chunks: string[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (typeof match.index !== "number") {
      continue;
    }

    if (match.index > cursor) {
      chunks.push(escapeHtml(text.slice(cursor, match.index)));
    }

    chunks.push(renderSpan("cm-fishmark-cjk-font", match[0]));
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    chunks.push(escapeHtml(text.slice(cursor)));
  }

  return chunks.join("");
}

function renderLine(
  className: string,
  innerHtml: string,
  attributes: Record<string, string | undefined> = {}
): string {
  const lineClass = className ? `cm-line ${className}` : "cm-line";
  return `<div${renderAttributes({ ...attributes, class: lineClass })}>${innerHtml}</div>`;
}

function renderSpan(
  className: string,
  content: string,
  options: { escapeContent?: boolean } = {}
): string {
  if (content.length === 0) {
    return "";
  }

  const escapedContent = options.escapeContent === false ? content : escapeHtml(content);
  return `<span class="${className}">${escapedContent}</span>`;
}

function renderInlineMarker(text: string): string {
  return renderSpan("cm-inactive-inline-marker", text);
}

function renderAttributes(attributes: Record<string, string | null | undefined>): string {
  const renderedAttributes = Object.entries(attributes)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`);

  return renderedAttributes.length > 0 ? ` ${renderedAttributes.join(" ")}` : "";
}

function createHtmlAttributes(rootAttributes: FishmarkExportRootAttributes): string {
  const rootStyle = createRootStyle(rootAttributes);
  return renderAttributes({
    class: createExportRootClassName(rootAttributes.className),
    "data-fishmark-theme": rootAttributes.theme,
    "data-fishmark-theme-mode": rootAttributes.themeMode,
    lang: "en",
    style: rootStyle
  });
}

function createExportRootClassName(className: string | null | undefined): string {
  const classNames = new Set((className ?? "").split(/\s+/).filter(Boolean));
  classNames.add(EXPORT_ROOT_CLASS_NAME);

  return Array.from(classNames).join(" ");
}

function createRootStyle(rootAttributes: FishmarkExportRootAttributes): string | null {
  const declarations: string[] = [];

  if (rootAttributes.style) {
    declarations.push(rootAttributes.style.trim());
  }

  if (rootAttributes.colorScheme) {
    declarations.push(`color-scheme: ${rootAttributes.colorScheme};`);
  }

  return declarations.length > 0 ? declarations.join(" ") : null;
}

function createSourceLines(source: string, startOffset: number, endOffset: number): SourceLine[] {
  if (endOffset <= startOffset) {
    return [];
  }

  const lines: SourceLine[] = [];
  let cursor = startOffset;

  while (cursor < endOffset) {
    const nextNewlineOffset = source.indexOf("\n", cursor);
    const rawEndOffset =
      nextNewlineOffset === -1 || nextNewlineOffset >= endOffset ? endOffset : nextNewlineOffset;
    const lineEndOffset = trimTrailingCarriageReturn(source, cursor, rawEndOffset);

    lines.push({
      startOffset: cursor,
      endOffset: lineEndOffset,
      text: source.slice(cursor, lineEndOffset)
    });

    if (nextNewlineOffset === -1 || nextNewlineOffset >= endOffset) {
      break;
    }

    cursor = nextNewlineOffset + 1;
  }

  return lines;
}

function consumeHorizontalSpace(source: string, startOffset: number, endOffset: number): number {
  let cursor = startOffset;

  while (cursor < endOffset) {
    const character = source[cursor];
    if (character !== " " && character !== "\t") {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function findLineEndOffset(source: string, startOffset: number, upperBound: number): number {
  const newlineOffset = source.indexOf("\n", startOffset);
  const rawEndOffset = newlineOffset === -1 ? upperBound : Math.min(newlineOffset, upperBound);
  return trimTrailingCarriageReturn(source, startOffset, rawEndOffset);
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  return endOffset > startOffset && source[endOffset - 1] === "\r" ? endOffset - 1 : endOffset;
}

function formatLanguageLabel(info: string | null): string {
  if (!info) {
    return "";
  }

  const token = info.trim().split(/\s+/)[0];
  if (!token) {
    return "";
  }

  return token.length > 16 ? token.slice(0, 16) : token;
}

function isCodeFenceLine(text: string): boolean {
  return /^[ \t]{0,3}(`{3,}|~{3,})/.test(text);
}

function isExplicitThematicBreakLine(text: string): boolean {
  return /^\s{0,3}(?:\+(?:[ \t]*\+){2,}|-(?:[ \t]*-){2,})[ \t]*$/u.test(text);
}

function readInlineText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => readInlineNodeText(node)).join("").trim();
}

function readInlineNodeText(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "hardBreak":
      return "\n";
    case "codeSpan":
      return node.text;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.map((child) => readInlineNodeText(child)).join("");
  }
}

function normalizeCssLength(value: string): string {
  return /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
}

function sanitizeStyleText(cssText: string): string {
  return cssText.replace(/<\/style/gi, "<\\/style");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
