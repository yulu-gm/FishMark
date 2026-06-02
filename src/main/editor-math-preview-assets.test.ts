import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const mathWidgetsPath = join(process.cwd(), "packages/editor-core/src/decorations/math-widgets.ts");
const katexPreviewRendererPath = join(
  process.cwd(),
  "packages/editor-core/src/decorations/katex-preview-renderer.ts"
);

describe("editor math preview assets", () => {
  it("loads KaTeX CSS through the same lazy editor preview module as KaTeX JS", () => {
    const mathWidgetsSource = readFileSync(mathWidgetsPath, "utf8").replace(/\r\n/g, "\n");

    expect(mathWidgetsSource).toContain('import("./katex-preview-renderer")');
    expect(existsSync(katexPreviewRendererPath)).toBe(true);

    const rendererSource = readFileSync(katexPreviewRendererPath, "utf8").replace(/\r\n/g, "\n");

    expect(rendererSource).toContain('import "katex/dist/katex.min.css";');
    expect(rendererSource).toContain('import katex from "katex";');
  });
});
