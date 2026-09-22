import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readRendererSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), "src/renderer", relativePath), "utf8").replace(/\r\n/g, "\n");

describe("renderer production bundle boundaries", () => {
  it("compiles the editor automation bridge out of production mode", () => {
    const source = readRendererSource("editor/App.tsx");

    expect(source).not.toContain('import { EditorTestBridgeHost } from "./editor-test-bridge-host";');
    expect(source).toContain(
      'const canRenderEditorTestBridge = import.meta.env.DEV || import.meta.env.MODE === "test";'
    );
    expect(source).toContain('await import("./editor-test-bridge-host")');
    expect(source).toContain("LazyEditorTestBridgeHost && fishmarkTest");
  });

  it("keeps optional titlebar and shader surface hosts outside the editor initial graph", () => {
    const source = readRendererSource("editor/WorkspaceShell.tsx");

    expect(source).not.toContain(
      'import { ThemeSurfaceHost, type ThemeSurfaceHostDescriptor } from "./ThemeSurfaceHost";'
    );
    expect(source).not.toContain('import { TitlebarHost } from "./TitlebarHost";');
    expect(source).toContain('await import("./ThemeSurfaceHost")');
    expect(source).toContain('await import("./TitlebarHost")');
  });
});
