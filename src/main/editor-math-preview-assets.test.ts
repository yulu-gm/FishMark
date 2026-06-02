import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const mathWidgetsPath = join(process.cwd(), "packages/editor-core/src/decorations/math-widgets.ts");
const katexPreviewRendererPath = join(
  process.cwd(),
  "packages/editor-core/src/decorations/katex-preview-renderer.ts"
);
const mermaidWidgetsPath = join(process.cwd(), "packages/editor-core/src/decorations/mermaid-widgets.ts");
const mermaidPreviewRendererPath = join(
  process.cwd(),
  "packages/editor-core/src/decorations/mermaid-preview-renderer.ts"
);

describe("editor preview assets", () => {
  it("loads KaTeX CSS through the same lazy editor preview module as KaTeX JS", () => {
    const mathWidgetsSource = readFileSync(mathWidgetsPath, "utf8").replace(/\r\n/g, "\n");

    expect(mathWidgetsSource).toContain('import("./katex-preview-renderer")');
    expect(existsSync(katexPreviewRendererPath)).toBe(true);

    const rendererSource = readFileSync(katexPreviewRendererPath, "utf8").replace(/\r\n/g, "\n");

    expect(rendererSource).toContain('import "katex/dist/katex.min.css";');
    expect(rendererSource).toContain('import katex from "katex";');
  });

  it("keeps Mermaid rendering in a lazy preview module with strict security", () => {
    const mermaidWidgetsSource = readFileSync(mermaidWidgetsPath, "utf8").replace(/\r\n/g, "\n");

    expect(mermaidWidgetsSource).toContain('import("./mermaid-preview-renderer")');
    expect(existsSync(mermaidPreviewRendererPath)).toBe(true);

    const rendererSource = readFileSync(mermaidPreviewRendererPath, "utf8").replace(/\r\n/g, "\n");

    expect(rendererSource).toContain('import mermaid from "mermaid";');
    expect(rendererSource).toContain('securityLevel: "strict"');
    expect(rendererSource).toContain("removeUnsafeSvgAttributes");
  });
});
