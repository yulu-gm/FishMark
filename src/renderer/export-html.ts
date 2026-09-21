import { parseFullDocumentTree } from "@fishmark/markdown-engine";
import {
  buildRenderPlan,
  renderFishmarkMarkdownContent
} from "@fishmark/markdown-presentation";

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

const EXPORT_ROOT_CLASS_NAME = "fishmark-html-export-root";

const KATEX_EXPORT_CSS = `
.katex {
  font: normal 1.15em KaTeX_Main, "Times New Roman", serif;
  line-height: 1.2;
  text-indent: 0;
  text-rendering: auto;
}

.katex-display {
  display: block;
  margin: 0.65rem 0;
  text-align: center;
}
`.trim();

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
  const cssText = sanitizeStyleText(
    [input.cssText?.trim(), KATEX_EXPORT_CSS, EXPORT_RUNTIME_CSS].filter(Boolean).join("\n\n")
  );
  const tree = parseFullDocumentTree(input.markdown);
  const renderPlan = buildRenderPlan(tree, { revision: 0 });
  const contentHtml = renderFishmarkMarkdownContent(renderPlan);

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
  if (rootAttributes.style) declarations.push(rootAttributes.style.trim());
  if (rootAttributes.colorScheme) declarations.push(`color-scheme: ${rootAttributes.colorScheme};`);
  return declarations.length > 0 ? declarations.join(" ") : null;
}

function renderAttributes(attributes: Record<string, string | null | undefined>): string {
  const renderedAttributes = Object.entries(attributes)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`);
  return renderedAttributes.length > 0 ? ` ${renderedAttributes.join(" ")}` : "";
}

function sanitizeStyleText(cssText: string): string {
  return cssText.replace(/<\/style/gi, "<\\/style");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
