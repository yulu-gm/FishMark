import "katex/dist/katex.min.css";

import katex from "katex";

export function renderKatexPreview(value: string, container: HTMLElement, displayMode: boolean): void {
  katex.render(value, container, {
    displayMode,
    throwOnError: false
  });
}
