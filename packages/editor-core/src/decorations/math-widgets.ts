import { Decoration, WidgetType } from "@codemirror/view";

import type { BlockMathBlock, InlineMath } from "@fishmark/markdown-engine";

type MathPreviewMode = "inline" | "block";

class MathPreviewWidget extends WidgetType {
  constructor(
    private readonly value: string,
    private readonly mode: MathPreviewMode,
    private readonly sourceText: string
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof MathPreviewWidget &&
      other.value === this.value &&
      other.mode === this.mode &&
      other.sourceText === this.sourceText;
  }

  override toDOM(): HTMLElement {
    const container = document.createElement(this.mode === "block" ? "div" : "span");
    container.className = this.mode === "block" ? "cm-math-preview cm-math-preview-block" : "cm-math-preview cm-math-preview-inline";
    container.textContent = this.sourceText;

    void import("./katex-preview-renderer")
      .then(({ renderKatexPreview }) => {
        renderKatexPreview(this.value, container, this.mode === "block");
      })
      .catch(() => {
        container.classList.add("cm-math-preview-fallback");
        container.textContent = this.sourceText;
      });

    return container;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export function createInactiveInlineMathPreviewDecoration(node: InlineMath): Decoration {
  return Decoration.replace({
    widget: new MathPreviewWidget(node.value, "inline", `$${node.value}$`)
  });
}

export function createInactiveBlockMathPreviewDecoration(block: BlockMathBlock): Decoration {
  return Decoration.replace({
    block: true,
    widget: new MathPreviewWidget(block.value, "block", `$$\n${block.value}\n$$`)
  });
}
