import { type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import type { HtmlImageBlock, InlineImage, InlineNode, InlineRoot } from "@fishmark/markdown-engine";

type ImagePreviewMode = "active" | "inactive";
type ImagePreviewResolver = ((href: string | null) => string | null) | undefined;
type ImageAlignment = "left" | "center" | "right";
type ImagePresentation = {
  width?: string | null;
  height?: string | null;
  zoom?: string | null;
  align?: ImageAlignment | null;
};

class MarkdownImagePreviewWidget extends WidgetType {
  readonly alt: string;
  readonly href: string | null;
  readonly resolvedUrl: string | null;
  readonly mode: ImagePreviewMode;
  readonly presentation: ImagePresentation;
  readonly sourceOffset: number;

  constructor(input: {
    alt: string;
    href: string | null;
    resolvedUrl: string | null;
    mode: ImagePreviewMode;
    presentation?: ImagePresentation;
    sourceOffset: number;
  }) {
    super();
    this.alt = input.alt;
    this.href = input.href;
    this.resolvedUrl = input.resolvedUrl;
    this.mode = input.mode;
    this.presentation = input.presentation ?? {};
    this.sourceOffset = input.sourceOffset;
  }

  override eq(other: MarkdownImagePreviewWidget): boolean {
    return (
      this.alt === other.alt &&
      this.href === other.href &&
      this.resolvedUrl === other.resolvedUrl &&
      this.mode === other.mode &&
      this.presentation.width === other.presentation.width &&
      this.presentation.height === other.presentation.height &&
      this.presentation.zoom === other.presentation.zoom &&
      this.presentation.align === other.presentation.align &&
      this.sourceOffset === other.sourceOffset
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement(this.mode === "active" ? "div" : "span");
    container.className = "cm-markdown-image-preview";
    container.dataset.imagePreviewMode = this.mode;
    container.dataset.imageAlign = this.presentation.align ?? "center";
    container.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selection = {
        anchor: this.sourceOffset,
        head: this.sourceOffset
      };
      const canMeasureClientRects =
        typeof globalThis.Range !== "undefined" &&
        typeof globalThis.Range.prototype.getClientRects === "function";

      view.dispatch(
        canMeasureClientRects
          ? {
              selection,
              effects: EditorView.scrollIntoView(this.sourceOffset, {
                y: "center",
                yMargin: 24
              })
            }
          : { selection }
      );
      view.focus();
      view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    if (this.resolvedUrl) {
      const image = document.createElement("img");
      image.className = "cm-markdown-image-preview-image";
      image.setAttribute("src", this.resolvedUrl);
      image.setAttribute("alt", this.alt || "Markdown image");
      applyImagePresentation(image, this.presentation);
      container.appendChild(image);
      return container;
    }

    const fallback = document.createElement("span");
    fallback.className = "cm-markdown-image-preview-fallback";
    fallback.textContent = this.href ?? this.alt ?? "Image preview unavailable";
    container.appendChild(fallback);
    return container;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export function createInactiveImagePreviewDecoration(
  node: InlineImage,
  resolveImagePreviewUrl?: ImagePreviewResolver
): Range<Decoration> {
  return Decoration.replace({
    widget: new MarkdownImagePreviewWidget({
      alt: readInlineText(node.children),
      href: node.href,
      resolvedUrl: resolveImagePreviewUrl?.(node.href) ?? null,
      mode: "inactive",
      sourceOffset: node.startOffset
    })
  }).range(node.startOffset, node.endOffset);
}

export function createInactiveHtmlImagePreviewDecoration(
  block: HtmlImageBlock,
  resolveImagePreviewUrl?: ImagePreviewResolver
): Range<Decoration> {
  return Decoration.replace({
    block: true,
    widget: new MarkdownImagePreviewWidget({
      alt: block.alt,
      href: block.src,
      resolvedUrl: resolveImagePreviewUrl?.(block.src) ?? null,
      mode: "inactive",
      presentation: {
        width: block.width,
        height: block.height,
        zoom: block.zoom,
        align: block.align
      },
      sourceOffset: block.startOffset
    })
  }).range(block.startOffset, block.endOffset);
}

export function createActiveInlineImageDecorations(
  inline: InlineRoot | undefined,
  source: string,
  resolveImagePreviewUrl?: ImagePreviewResolver
): Range<Decoration>[] {
  if (!inline) {
    return [];
  }

  const ranges: Range<Decoration>[] = [];
  appendActiveInlineImageDecorations(inline, source, ranges, resolveImagePreviewUrl);
  return ranges;
}

export function createActiveHtmlImagePreviewDecoration(
  block: HtmlImageBlock,
  source: string,
  resolveImagePreviewUrl?: ImagePreviewResolver
): Range<Decoration> {
  return Decoration.widget({
    block: true,
    side: 1,
    widget: new MarkdownImagePreviewWidget({
      alt: block.alt,
      href: block.src,
      resolvedUrl: resolveImagePreviewUrl?.(block.src) ?? null,
      mode: "active",
      presentation: {
        width: block.width,
        height: block.height,
        zoom: block.zoom,
        align: block.align
      },
      sourceOffset: block.startOffset
    })
  }).range(findLineEnd(source, block.endOffset));
}

function appendActiveInlineImageDecorations(
  node: InlineRoot | InlineNode,
  source: string,
  ranges: Range<Decoration>[],
  resolveImagePreviewUrl?: ImagePreviewResolver
): void {
  switch (node.type) {
    case "root":
      for (const child of node.children) {
        appendActiveInlineImageDecorations(child, source, ranges, resolveImagePreviewUrl);
      }
      return;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
      for (const child of node.children) {
        appendActiveInlineImageDecorations(child, source, ranges, resolveImagePreviewUrl);
      }
      return;
    case "image":
      ranges.push(
        Decoration.widget({
          block: true,
          side: 1,
          widget: new MarkdownImagePreviewWidget({
            alt: readInlineText(node.children),
            href: node.href,
            resolvedUrl: resolveImagePreviewUrl?.(node.href) ?? null,
            mode: "active",
            sourceOffset: node.startOffset
          })
        }).range(findLineEnd(source, node.endOffset))
      );
      return;
    case "text":
    case "hardBreak":
    case "codeSpan":
      return;
  }
}

function readInlineText(nodes: InlineNode[]): string {
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

function findLineEnd(source: string, offset: number): number {
  let currentOffset = offset;

  while (currentOffset < source.length) {
    const character = source[currentOffset];

    if (character === "\n" || character === "\r") {
      break;
    }

    currentOffset += 1;
  }

  return currentOffset;
}

function applyImagePresentation(image: HTMLImageElement, presentation: ImagePresentation): void {
  if (presentation.width) {
    image.style.width = normalizeCssLength(presentation.width);
  }

  if (presentation.height) {
    image.style.height = normalizeCssLength(presentation.height);
  }

  if (presentation.zoom) {
    image.style.zoom = presentation.zoom;
  }
}

function normalizeCssLength(value: string): string {
  return /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
}
