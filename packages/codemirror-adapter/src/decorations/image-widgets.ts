import { Transaction, type Range } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { resizeImageSource } from "./image-resize";
import { closeImageResizeMenu, showImageResizeMenu } from "./image-resize-menu";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { requestMountedWidgetMeasurement } from "./widget-lifecycle";
import { createEditorOffsetRevealEffect } from "../viewport-reveal";

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
  readonly sourceEnd: number;
  readonly kind: "markdown" | "html";
  readonly title: string | null;

  constructor(input: {
    alt: string;
    href: string | null;
    resolvedUrl: string | null;
    mode: ImagePreviewMode;
    presentation?: ImagePresentation;
    sourceOffset: number;
    sourceEnd: number;
    kind: "markdown" | "html";
    title: string | null;
  }) {
    super();
    this.alt = input.alt;
    this.href = input.href;
    this.resolvedUrl = input.resolvedUrl;
    this.mode = input.mode;
    this.presentation = input.presentation ?? {};
    this.sourceOffset = input.sourceOffset;
    this.sourceEnd = input.sourceEnd;
    this.kind = input.kind;
    this.title = input.title;
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
      this.sourceOffset === other.sourceOffset && this.sourceEnd === other.sourceEnd &&
      this.kind === other.kind && this.title === other.title
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement(this.mode === "active" ? "div" : "span");
    container.className = "cm-markdown-image-preview";
    container.dataset.imagePreviewMode = this.mode;
    container.dataset.imageAlign = this.presentation.align ?? "center";
    if (this.mode === "inactive") {
      const line = view.state.doc.lineAt(this.sourceOffset);
      if (this.sourceEnd <= line.to && (view.state.doc.sliceString(line.from, this.sourceOffset).trim() ||
          view.state.doc.sliceString(this.sourceEnd, line.to).trim())) container.dataset.imageInline = "true";
    }
    container.addEventListener("mousedown", (event) => {
      if ((event as MouseEvent).button !== 0) return;
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
              effects: createEditorOffsetRevealEffect(this.sourceOffset, "preserve")
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
      if (this.title !== null) image.setAttribute("title", this.title);
      applyImagePresentation(image, this.presentation);
      // A decoded image changes the widget's height, so CodeMirror has to re-measure it. The guard
      // skips the request when the preview was already replaced or scrolled away.
      image.addEventListener("load", () => requestMountedWidgetMeasurement(view, container), { once: true });
      image.addEventListener("error", () => requestMountedWidgetMeasurement(view, container), { once: true });
      const frame = document.createElement("span");
      frame.className = "cm-markdown-image-resize-frame";
      frame.appendChild(image);
      const candidate = (width: number, source: string) => resizeImageSource({ source, from: this.sourceOffset, to: this.sourceEnd,
        kind: this.kind, href: this.href, alt: this.alt, title: this.title, width });
      const commit = (width: number, source: string) => {
        const replacement = candidate(width, source);
        if (replacement === null || view.state.readOnly || view.state.doc.toString() !== source) return;
        // Separate transactions keep boundaries even if selection normalization rewrites the edit.
        view.dispatch({ annotations: isolateHistory.of("full") });
        view.dispatch({ changes: { from: this.sourceOffset, to: this.sourceEnd, insert: replacement },
          annotations: Transaction.userEvent.of("input.image.resize") });
        view.dispatch({ annotations: isolateHistory.of("full") });
      };
      image.addEventListener("contextmenu", event => {
        // Do not let unsupported images trigger the editor's paste-on-context-menu handler.
        event.preventDefault(); event.stopPropagation();
        const source = view.state.doc.toString();
        if (view.state.readOnly || !image.naturalWidth || candidate(100, source) === null) return;
        showImageResizeMenu(container, event.clientX, event.clientY, scale => commit(image.naturalWidth * scale, source));
      });
      if (candidate(100, view.state.doc.toString()) !== null) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "cm-markdown-image-resize-handle";
        handle.setAttribute("aria-label", "Resize image");
        handle.addEventListener("keydown", event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          if (view.state.readOnly || !image.naturalWidth) return;
          event.preventDefault(); event.stopPropagation();
          const current = image.getBoundingClientRect().width;
          const next = Math.max(24, Math.min(container.getBoundingClientRect().width,
            current + (event.key === "ArrowRight" ? 10 : -10)));
          if (Math.abs(next - current) >= 1) commit(next, view.state.doc.toString());
        });
        handle.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
        handle.addEventListener("pointerdown", event => {
          if (event.button !== 0 || view.state.readOnly || !image.naturalWidth) return;
          event.preventDefault(); event.stopPropagation();
          const source = view.state.doc.toString();
          if (candidate(100, source) === null) return;
          const startX = event.clientX;
          const startWidth = image.getBoundingClientRect().width;
          const maxWidth = container.getBoundingClientRect().width;
          const originalStyle = image.getAttribute("style");
          let width = startWidth;
          const cleanup = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", keydown);
            if (originalStyle === null) image.removeAttribute("style"); else image.setAttribute("style", originalStyle);
            requestMountedWidgetMeasurement(view, container);
          };
          const move = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return;
            width = Math.max(24, Math.min(maxWidth, startWidth + (e.clientX - startX) * 2));
            image.style.width = `${width}px`;
            image.style.height = "auto";
            image.style.zoom = "1";
            requestMountedWidgetMeasurement(view, container);
          };
          const cancel = (e: PointerEvent) => { if (e.pointerId === event.pointerId) cleanup(); };
          const keydown = (e: KeyboardEvent) => { if (e.key === "Escape") cleanup(); };
          const finish = (e: PointerEvent) => {
            if (e.pointerId !== event.pointerId) return;
            cleanup();
            if (Math.abs(width - startWidth) >= 1) commit(width, source);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", finish);
          window.addEventListener("pointercancel", cancel);
          window.addEventListener("keydown", keydown);
        });
        frame.appendChild(handle);
      }
      container.appendChild(frame);
      return container;
    }

    const fallback = document.createElement("span");
    fallback.className = "cm-markdown-image-preview-fallback";
    fallback.textContent = this.href ?? this.alt ?? "Image preview unavailable";
    container.appendChild(fallback);
    return container;
  }

  override destroy(dom: HTMLElement): void {
    closeImageResizeMenu(dom);
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
      alt: node.html?.alt ?? readInlineText(node.children),
      href: node.href,
      resolvedUrl: resolveImagePreviewUrl?.(node.href) ?? null,
      mode: "inactive",
      presentation: node.html,
      sourceOffset: node.startOffset, sourceEnd: node.endOffset, kind: node.html ? "html" : "markdown", title: node.title
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
      sourceOffset: block.startOffset, sourceEnd: block.endOffset, kind: "html", title: block.title
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
      sourceOffset: block.startOffset, sourceEnd: block.endOffset, kind: "html", title: block.title
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
            alt: node.html?.alt ?? readInlineText(node.children),
            href: node.href,
            resolvedUrl: resolveImagePreviewUrl?.(node.href) ?? null,
            mode: "active",
            presentation: node.html,
            sourceOffset: node.startOffset, sourceEnd: node.endOffset, kind: node.html ? "html" : "markdown", title: node.title
          })
        }).range(findLineEnd(source, node.endOffset))
      );
      return;
    case "text":
    case "hardBreak":
    case "codeSpan":
    case "inlineMath":
    case "footnoteReference":
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
    case "inlineMath":
      return node.value;
    case "footnoteReference":
      return node.label;
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
