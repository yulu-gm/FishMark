import { Decoration, WidgetType } from "@codemirror/view";

import type { CodeFenceBlock } from "@fishmark/markdown-engine";
import { getInactiveCodeFenceLines } from "./block-lines";

class MermaidPreviewWidget extends WidgetType {
  constructor(
    private readonly definition: string,
    private readonly sourceText: string
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof MermaidPreviewWidget &&
      other.definition === this.definition &&
      other.sourceText === this.sourceText;
  }

  override toDOM(): HTMLElement {
    const container = document.createElement("div");

    container.className = "cm-mermaid-preview cm-mermaid-preview-loading";
    container.textContent = "Rendering Mermaid diagram...";

    void import("./mermaid-preview-renderer")
      .then(({ renderMermaidPreview }) => renderMermaidPreview(this.definition, container))
      .then(() => {
        container.classList.remove("cm-mermaid-preview-loading", "cm-mermaid-preview-fallback");
      })
      .catch(() => {
        container.classList.remove("cm-mermaid-preview-loading");
        container.classList.add("cm-mermaid-preview-fallback");
        container.textContent = this.sourceText;
      });

    return container;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export function isMermaidCodeFence(block: CodeFenceBlock, source: string): boolean {
  if (block.kind !== "fenced" || !block.info || !hasClosingFence(block, source)) {
    return false;
  }

  return block.info.trim().split(/\s+/u)[0]?.toLowerCase() === "mermaid";
}

export function createInactiveMermaidPreviewDecoration(block: CodeFenceBlock, source: string): Decoration {
  return Decoration.replace({
    block: true,
    widget: new MermaidPreviewWidget(extractCodeFenceContent(block, source), source.slice(block.startOffset, block.endOffset))
  });
}

function extractCodeFenceContent(block: CodeFenceBlock, source: string): string {
  return getInactiveCodeFenceLines(block.startOffset, block.endOffset, source, block.kind)
    .filter((line) => line.kind === "content")
    .map((line) => source.slice(line.contentStart, line.lineEnd))
    .join("\n")
    .trim();
}

function hasClosingFence(block: CodeFenceBlock, source: string): boolean {
  return getInactiveCodeFenceLines(block.startOffset, block.endOffset, source, block.kind).some(
    (line) => line.kind === "fence" && line.lineStart > block.startOffset
  );
}
