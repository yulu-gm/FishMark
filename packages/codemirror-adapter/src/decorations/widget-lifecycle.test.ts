// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseInlineAst, parseMarkdownDocument, type CodeFenceBlock, type InlineImage, type InlineMath } from "@fishmark/markdown-engine";

import { createInactiveImagePreviewDecoration } from "./image-widgets";
import { createInactiveInlineMathPreviewDecoration } from "./math-widgets";
import { createInactiveMermaidPreviewDecoration } from "./mermaid-widgets";
import {
  completeMountedWidget,
  isWidgetMounted,
  requestMountedWidgetMeasurement,
  type WidgetMeasurementTarget
} from "./widget-lifecycle";

const renderers = vi.hoisted(() => ({
  renderKatexPreview: vi.fn(),
  renderMermaidPreview: vi.fn()
}));

vi.mock("./katex-preview-renderer", () => ({
  renderKatexPreview: renderers.renderKatexPreview
}));
vi.mock("./mermaid-preview-renderer", () => ({
  renderMermaidPreview: renderers.renderMermaidPreview
}));

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

type FakeView = {
  readonly view: WidgetMeasurementTarget & { readonly dom: HTMLDivElement };
  readonly requestMeasure: ReturnType<typeof vi.fn>;
};

// Widgets create their own container in toDOM, so tests mount that exact element after creation.
const createFakeView = (): FakeView => {
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  const requestMeasure = vi.fn();

  return { view: { dom, requestMeasure }, requestMeasure };
};

const widgetDom = (decoration: { spec: { widget: unknown } }, view: WidgetMeasurementTarget): HTMLElement => {
  const widget = decoration.spec.widget as { toDOM: (view: unknown) => HTMLElement };

  return widget.toDOM(view);
};

const parseInlineNode = <T extends "inlineMath" | "image">(source: string, type: T): Extract<InlineMath | InlineImage, { type: T }> => {
  const node = parseInlineAst(source, 0, source.length).children[0];

  if (node?.type !== type) {
    throw new Error(`Expected ${type} in ${source}`);
  }

  return node as Extract<InlineMath | InlineImage, { type: T }>;
};

const parseMermaidFence = (source: string): CodeFenceBlock => {
  const block = parseMarkdownDocument(source).blocks[0];

  if (block?.type !== "codeFence") {
    throw new Error("Expected a code fence block");
  }

  return block;
};

describe("widget async lifecycle", () => {
  it("treats only a container inside the view DOM as mounted", () => {
    const { view, requestMeasure } = createFakeView();

    expect(isWidgetMounted(view, document.createElement("span"))).toBe(false);
    requestMountedWidgetMeasurement(view, document.createElement("span"));
    expect(requestMeasure).not.toHaveBeenCalled();
  });

  it("measures a mounted container and skips a discarded one", () => {
    const { view, requestMeasure } = createFakeView();
    const mounted = document.createElement("span");
    view.dom.appendChild(mounted);
    const discarded = document.createElement("span");
    view.dom.appendChild(discarded);
    view.dom.removeChild(discarded);

    requestMountedWidgetMeasurement(view, mounted);
    requestMountedWidgetMeasurement(view, discarded);

    expect(requestMeasure).toHaveBeenCalledTimes(1);
  });

  it("does not fill a container the view already dropped", () => {
    const { view } = createFakeView();
    const fill = vi.fn();

    completeMountedWidget(view, document.createElement("span"), fill);

    expect(fill).not.toHaveBeenCalled();
  });

  it("renders math into the mounted preview and requests measurement", async () => {
    const decoration = createInactiveInlineMathPreviewDecoration(parseInlineNode("$x^2$", "inlineMath"));
    const { view, requestMeasure } = createFakeView();

    const dom = widgetDom(decoration, view);
    view.dom.appendChild(dom);
    await vi.dynamicImportSettled();

    expect(dom.classList.contains("cm-math-preview-inline")).toBe(true);
    expect(renderers.renderKatexPreview).toHaveBeenCalledTimes(1);
    expect(requestMeasure).toHaveBeenCalledTimes(1);
  });

  it("discards math rendering for a preview the view already replaced", async () => {
    const decoration = createInactiveInlineMathPreviewDecoration(parseInlineNode("$x^2$", "inlineMath"));
    const { view, requestMeasure } = createFakeView();

    widgetDom(decoration, view);
    await vi.dynamicImportSettled();

    expect(renderers.renderKatexPreview).not.toHaveBeenCalled();
    expect(requestMeasure).not.toHaveBeenCalled();
  });

  it("measures a mermaid preview after a successful render", async () => {
    renderers.renderMermaidPreview.mockResolvedValue(undefined);
    const source = "```mermaid\ngraph TD;\n```";
    const decoration = createInactiveMermaidPreviewDecoration(parseMermaidFence(source), source);
    const { view, requestMeasure } = createFakeView();

    const dom = widgetDom(decoration, view);
    view.dom.appendChild(dom);
    await vi.waitFor(() => { expect(dom.classList.contains("cm-mermaid-preview-loading")).toBe(false); });

    expect(requestMeasure).toHaveBeenCalledTimes(1);
  });

  it("measures a mermaid preview that falls back to its source text", async () => {
    renderers.renderMermaidPreview.mockRejectedValue(new Error("render failed"));
    const source = "```mermaid\ngraph TD;\n```";
    const decoration = createInactiveMermaidPreviewDecoration(parseMermaidFence(source), source);
    const { view, requestMeasure } = createFakeView();

    const dom = widgetDom(decoration, view);
    view.dom.appendChild(dom);
    await vi.waitFor(() => { expect(dom.classList.contains("cm-mermaid-preview-fallback")).toBe(true); });

    expect(dom.textContent).toBe(source);
    expect(requestMeasure).toHaveBeenCalledTimes(1);
  });

  it("measures an image preview once the image decodes", () => {
    const decoration = createInactiveImagePreviewDecoration(parseInlineNode("![alt](hero.png)", "image"), () => "blob:hero");
    const { view, requestMeasure } = createFakeView();

    const dom = widgetDom(decoration.value, view);
    view.dom.appendChild(dom);
    dom.querySelector("img")?.dispatchEvent(new Event("load"));

    expect(requestMeasure).toHaveBeenCalledTimes(1);
  });
});
