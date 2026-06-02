import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("scripts/analyze-renderer-bundle.mjs", () => {
  it("reports renderer chunk totals, roles, and sourcemap source groups as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-report-"));
    const assetsDir = path.join(root, "assets");

    await mkdir(assetsDir);
    await writeFile(
      path.join(root, "index.html"),
      '<script type="module" src="./assets/index-test.js"></script>'
    );
    await writeFile(path.join(assetsDir, "App-test.js"), 'import "./shared-test.js"; console.log("editor");');
    await writeFile(path.join(assetsDir, "index-test.js"), 'import "./react-runtime-test.js"; console.log("react entry");');
    await writeFile(path.join(assetsDir, "react-runtime-test.js"), "console.log('react runtime');");
    await writeFile(path.join(assetsDir, "shared-test.js"), "console.log('shared');");
    await writeFile(path.join(assetsDir, "settings-view-test.js"), "console.log('settings');");
    await writeFile(
      path.join(assetsDir, "App-test.js.map"),
      JSON.stringify({
        version: 3,
        sources: [
          "../../node_modules/@codemirror/view/dist/index.js",
          "../../node_modules/micromark-extension-math/node_modules/katex/dist/katex.mjs",
          "../../packages/editor-core/src/extensions/markdown.ts",
          "../../src/renderer/editor/App.tsx"
        ],
        sourcesContent: [
          "export const view = 'x'.repeat(100);",
          "export const katex = 'x';",
          "export const extension = 'x';",
          "export const app = 'x';"
        ],
        names: [],
        mappings: ""
      })
    );

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--json"
      ], {
        cwd: process.cwd()
      });
      const report = JSON.parse(stdout) as {
        budget: null;
        chunks: Array<{ name: string; role: string; bytes: number; isInitial: boolean }>;
        editorChunk: { name: string; role: string } | null;
        htmlInitialChunks: Array<{ name: string }>;
        initialChunks: Array<{ name: string }>;
        lazyChunks: Array<{ name: string }>;
        topSourceGroups: Array<{ group: string; bytes: number }>;
        totalInitialGzipBytes: number;
        totalJsBytes: number;
      };

      expect(report.totalJsBytes).toBeGreaterThan(0);
      expect(report.totalInitialGzipBytes).toBeGreaterThan(0);
      expect(report.editorChunk?.name).toBe("App-test.js");
      expect(report.htmlInitialChunks.map((chunk) => chunk.name)).toEqual(["index-test.js"]);
      expect(report.initialChunks.map((chunk) => chunk.name).sort()).toEqual([
        "App-test.js",
        "index-test.js",
        "react-runtime-test.js",
        "shared-test.js"
      ].sort());
      expect(report.chunks.find((chunk) => chunk.name === "index-test.js")?.role).toBe("react-entry");
      expect(report.chunks.find((chunk) => chunk.name === "shared-test.js")?.isInitial).toBe(true);
      expect(report.chunks.find((chunk) => chunk.name === "settings-view-test.js")?.isInitial).toBe(false);
      expect(report.lazyChunks.map((chunk) => chunk.name)).toContain("settings-view-test.js");
      expect(report.lazyChunks.map((chunk) => chunk.name)).not.toContain("shared-test.js");
      expect(report.topSourceGroups[0]?.group).toBe("@codemirror/view");
      expect(report.topSourceGroups.map((group) => group.group)).toContain("katex");
      expect(report.budget).toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("prints PASS/FAIL bundle budget checks and exits non-zero on failure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-budget-"));
    const assetsDir = path.join(root, "assets");

    await mkdir(assetsDir);
    await writeFile(
      path.join(root, "index.html"),
      '<script type="module" src="./assets/index-test.js"></script>'
    );
    await writeFile(path.join(assetsDir, "App-test.js"), "console.log('editor');");
    await writeFile(path.join(assetsDir, "index-test.js"), "console.log('react entry');");
    await writeFile(path.join(assetsDir, "export-html-test.js"), "console.log('export html');");
    await writeFile(
      path.join(assetsDir, "App-test.js.map"),
      JSON.stringify({
        version: 3,
        sources: [
          "../../src/renderer/editor/App.tsx"
        ],
        sourcesContent: [
          "export const app = 'x';"
        ],
        names: [],
        mappings: ""
      })
    );

    try {
      const passResult = await execFileAsync(process.execPath, [
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--max-initial-chunk-bytes",
        "1000",
        "--max-initial-gzip-bytes",
        "2000",
        "--max-total-gzip-bytes",
        "3000",
        "--require-lazy-chunk",
        "export-html",
        "--forbid-initial-source-group",
        "@lezer/javascript"
      ], {
        cwd: process.cwd()
      });

      expect(passResult.stdout).toContain("bundleBudget=PASS");
      expect(passResult.stdout).toContain("requiredLazyChunk:export-html");
      expect(passResult.stdout).toContain("forbiddenInitialSourceGroup:@lezer/javascript");

      try {
        await execFileAsync(process.execPath, [
          "scripts/analyze-renderer-bundle.mjs",
          "--dist",
          root,
          "--max-initial-chunk-bytes",
          "1"
        ], {
          cwd: process.cwd()
        });
        throw new Error("Expected bundle budget command to fail.");
      } catch (error) {
        const failedRun = error as { code?: number; stdout?: string };

        expect(failedRun.code).toBe(1);
        expect(failedRun.stdout).toContain("bundleBudget=FAIL");
        expect(failedRun.stdout).toContain("maxInitialChunkBytes");
      }

      await writeFile(path.join(assetsDir, "App-test.js"), 'import "./export-html-test.js";');

      try {
        await execFileAsync(process.execPath, [
          "scripts/analyze-renderer-bundle.mjs",
          "--dist",
          root,
          "--require-lazy-chunk",
          "export-html"
        ], {
          cwd: process.cwd()
        });
        throw new Error("Expected required lazy chunk command to fail.");
      } catch (error) {
        const failedRun = error as { code?: number; stdout?: string };

        expect(failedRun.code).toBe(1);
        expect(failedRun.stdout).toContain("requiredLazyChunk:export-html");
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
