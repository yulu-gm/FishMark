import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readRendererSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), "src/renderer", relativePath), "utf8").replace(/\r\n/g, "\n");

describe("renderer production bundle boundaries", () => {
  it("pins the release minifier that owns the frozen bundle budget", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { devDependencies?: Record<string, string> };
    const packageLock = JSON.parse(
      readFileSync(join(process.cwd(), "package-lock.json"), "utf8")
    ) as {
      packages?: Record<string, { version?: string; devDependencies?: Record<string, string> }>;
    };

    expect(packageJson.devDependencies?.terser).toBe("5.51.2");
    expect(packageLock.packages?.[""]?.devDependencies?.terser).toBe("5.51.2");
    expect(packageLock.packages?.["node_modules/terser"]?.version).toBe("5.51.2");
  });

  it("targets the Chromium version bundled by the pinned Electron runtime", () => {
    const source = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8").replace(/\r\n/g, "\n");

    expect(source).toContain('target: "chrome146"');
    expect(source).toContain('minify: "terser"');
    expect(source).toContain("passes: 2");
    expect(source).toContain("polyfill: false");
    expect(source).toContain('return "codemirror-view";');
    expect(source).toContain('return "codemirror-state";');
    expect(source).toContain('return "fishmark-editor-model";');
    expect(source).toContain('return "fishmark-markdown-engine";');
    expect(source).toContain('return "fishmark-workspace-application";');
    expect(source).toContain('return "fishmark-workspace-infrastructure";');
  });

  it("bundles workspace packages from source entries instead of their emitted dist facades", () => {
    const source = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8").replace(/\r\n/g, "\n");

    expect(source).toContain('"@fishmark/workspace-application": fileURLToPath(');
    expect(source).toContain('new URL("./packages/workspace-application/src/index.ts", import.meta.url)');
    expect(source).toContain('"@fishmark/workspace-infrastructure": fileURLToPath(');
    expect(source).toContain('new URL("./packages/workspace-infrastructure/src/index.ts", import.meta.url)');
  });

  it("compiles the editor automation bridge out of production mode", () => {
    const source = readRendererSource("editor/App.tsx");

    expect(source).not.toContain('import { EditorTestBridgeHost } from "./editor-test-bridge-host";');
    expect(source).toContain(
      'const canRenderEditorTestBridge = import.meta.env.DEV || import.meta.env.MODE === "test";'
    );
    expect(source).toContain('await import("./editor-test-bridge-host")');
    expect(source).toContain("LazyEditorTestBridgeHost && fishmarkTest");
  });

  it("does not force the whole CodeMirror adapter into one initial manual chunk", () => {
    const source = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8").replace(/\r\n/g, "\n");

    expect(source).not.toContain('return "fishmark-codemirror-adapter";');
  });

  it("keeps CodeMirror search outside the editor initial graph", () => {
    const editorSource = readRendererSource("code-editor.ts");
    const searchRuntimeSource = readRendererSource("search-runtime.ts");

    expect(editorSource).not.toContain('from "@codemirror/search"');
    expect(editorSource).toContain('import("./search-runtime")');
    expect(searchRuntimeSource).toContain('from "@codemirror/search"');
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
