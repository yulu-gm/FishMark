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
        mappings: "AAAA"
      })
    );
    await writeCompleteSourceMap(assetsDir, "index-test.js", [["../../src/entry.ts", ""]]);

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
        schemaVersion: number;
        budget: null;
        bundleEvidence: {
          evidenceScope: string;
          sourceGraphAuthority: string;
        };
        chunks: Array<{ name: string; role: string; bytes: number; isInitial: boolean }>;
        editorChunk: { name: string; role: string } | null;
        htmlInitialChunks: Array<{ name: string }>;
        initialChunks: Array<{ name: string }>;
        lazyChunks: Array<{ name: string }>;
        topSourceGroups: Array<{ group: string; bytes: number }>;
        totalInitialGzipBytes: number;
        totalJsBytes: number;
      };

      expect(report.schemaVersion).toBe(1);
      expect(report.bundleEvidence).toMatchObject({
        evidenceScope: "emitted-renderer-output",
        sourceGraphAuthority: "editor-foundation-architecture-guard"
      });
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

  it("emits stable, ordinally sorted bundle architecture evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-evidence-"));
    const assetsDir = path.join(root, "assets");

    await mkdir(assetsDir);
    await writeFile(
      path.join(root, "index.html"),
      '<script type="module" src="./assets/index-test.js"></script>'
    );
    await writeFile(
      path.join(assetsDir, "App-test.js"),
      'import "./z-shared.js"; import "./A-shared.js"; console.log("editor");'
    );
    await writeFile(path.join(assetsDir, "index-test.js"), "console.log('react entry');");
    await writeFile(path.join(assetsDir, "z-shared.js"), "console.log('z');");
    await writeFile(path.join(assetsDir, "A-shared.js"), "console.log('A');");
    await writeFile(path.join(assetsDir, "settings-view-test.js"), "console.log('settings');");
    await writeCompleteSourceMap(assetsDir, "App-test.js", [
      ["../../src/renderer/z-last.ts", "export const z = true;"],
      ["../../node_modules/@codemirror/view/dist/index.js", "export const view = true;"],
      ["../../src/renderer/A-first.ts", "export const A = true;"]
    ]);
    await writeCompleteSourceMap(assetsDir, "index-test.js");
    await writeCompleteSourceMap(assetsDir, "z-shared.js");
    await writeCompleteSourceMap(assetsDir, "A-shared.js");

    const args = [
      "scripts/analyze-renderer-bundle.mjs",
      "--dist",
      root,
      "--json",
      "--require-lazy-chunk",
      "settings-view",
      "--require-lazy-chunk",
      "settings-view",
      "--forbid-initial-source-group",
      "mermaid",
      "--forbid-initial-source-group",
      "mermaid",
      "--forbid-initial-source-group",
      "@lezer/javascript"
    ];

    try {
      const firstRun = await execFileAsync(process.execPath, args, { cwd: process.cwd() });
      const secondRun = await execFileAsync(process.execPath, args, { cwd: process.cwd() });
      const report = JSON.parse(firstRun.stdout) as {
        bundleEvidence: {
          appliedCheckIds: string[];
          checks: Array<{
            actual: unknown;
            id: string;
            limit: unknown;
            status: "PASS" | "FAIL";
          }>;
          initialSourceGroups: Array<{ group: string }>;
          initialStaticImportClosure: {
            chunks: Array<{ name: string; staticImports: string[] }>;
            roots: string[];
          };
          lazyRequirements: Array<{ checkId: string; matchingChunks: string[]; status: string }>;
          status: string;
        };
        chunks: Array<{ bytes: number; name: string }>;
      };

      expect(secondRun.stdout).toBe(firstRun.stdout);
      expect(report.bundleEvidence.status).toBe("PASS");
      expect(report.bundleEvidence.initialStaticImportClosure.roots).toEqual([
        "App-test.js",
        "index-test.js"
      ]);
      expect(report.bundleEvidence.initialStaticImportClosure.chunks.map((chunk) => chunk.name)).toEqual([
        "A-shared.js",
        "App-test.js",
        "index-test.js",
        "z-shared.js"
      ]);
      expect(
        report.bundleEvidence.initialStaticImportClosure.chunks.find(
          (chunk) => chunk.name === "App-test.js"
        )?.staticImports
      ).toEqual(["A-shared.js", "z-shared.js"]);
      expect(report.bundleEvidence.initialSourceGroups.map((group) => group.group)).toEqual([
        "@codemirror/view",
        "src/renderer"
      ]);
      expect(report.bundleEvidence.lazyRequirements).toEqual([
        {
          checkId: "bundle.required-lazy-chunk:settings-view",
          matchingChunks: ["settings-view-test.js"],
          pattern: "settings-view",
          status: "PASS"
        }
      ]);
      expect(report.bundleEvidence.appliedCheckIds).toEqual([
        "bundle.forbidden-initial-source-group:@lezer/javascript",
        "bundle.forbidden-initial-source-group:mermaid",
        "bundle.required-lazy-chunk:settings-view"
      ]);
      expect(report.bundleEvidence.checks.map((check) => check.id)).toEqual(
        report.bundleEvidence.appliedCheckIds
      );
      expect(report.bundleEvidence.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actual: expect.anything(), limit: expect.anything(), status: "PASS" })
        ])
      );
      expect(report.chunks.map((chunk) => chunk.name)).toEqual(
        [...report.chunks]
          .sort((left, right) => right.bytes - left.bytes || compareOrdinal(left.name, right.name))
          .map((chunk) => chunk.name)
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails a forbidden initial source-group rule when any initial chunk lacks map evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-missing-map-"));
    const assetsDir = path.join(root, "assets");

    await mkdir(assetsDir);
    await writeFile(
      path.join(root, "index.html"),
      '<script type="module" src="./assets/index-test.js"></script>'
    );
    await writeFile(path.join(assetsDir, "App-test.js"), "console.log('editor');");
    await writeFile(path.join(assetsDir, "index-test.js"), "console.log('react entry');");
    await writeCompleteSourceMap(assetsDir, "App-test.js");

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          checks: Array<{
            actual: { evidenceStatus: string; missingEvidenceChunks: string[] };
            id: string;
            status: string;
          }>;
          sourceMapEvidence: Array<{ chunk: string; issues: string[]; status: string }>;
          status: string;
        };
      };

      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence.status).toBe("FAIL");
      expect(report.bundleEvidence.sourceMapEvidence).toEqual([
        {
          chunk: "App-test.js",
          map: "App-test.js.map",
          issues: [],
          status: "COMPLETE"
        },
        {
          chunk: "index-test.js",
          map: "index-test.js.map",
          issues: ["source-map-missing"],
          status: "INCOMPLETE"
        }
      ]);
      expect(
        report.bundleEvidence.checks.find(
          (check) => check.id === "bundle.forbidden-initial-source-group:mermaid"
        )
      ).toMatchObject({
        actual: {
          evidenceStatus: "INCOMPLETE",
          matchingChunks: [],
          missingEvidenceChunks: ["index-test.js"]
        },
        status: "FAIL"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    ["invalid JSON", "{", ["source-map-json-invalid"]],
    [
      "missing version",
      JSON.stringify({
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"]
      }),
      ["source-map-version-missing"]
    ],
    [
      "wrong version",
      JSON.stringify({
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 2
      }),
      ["source-map-version-invalid"]
    ],
    [
      "missing mappings",
      JSON.stringify({
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-mappings-missing"]
    ],
    [
      "non-string mappings",
      JSON.stringify({
        mappings: [],
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-mappings-invalid"]
    ],
    [
      "empty mappings for a non-empty chunk",
      JSON.stringify({
        mappings: "",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-mappings-empty"]
    ],
    [
      "malformed mappings",
      JSON.stringify({
        mappings: "!",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-mappings-malformed"]
    ],
    [
      "mappings without a source reference",
      JSON.stringify({
        mappings: "A",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-mappings-unmapped"]
    ],
    [
      "out-of-range source reference",
      JSON.stringify({
        mappings: "ACAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-source-reference-invalid"]
    ],
    [
      "missing sourcesContent",
      JSON.stringify({ mappings: "AAAA", names: [], sources: ["../../src/renderer/App.tsx"], version: 3 }),
      ["source-map-sources-content-missing"]
    ],
    [
      "missing corresponding source content",
      JSON.stringify({
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx", "../../src/renderer/extra.ts"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-content-missing:1", "source-map-source-count-mismatch"]
    ]
  ])("fails source-group rules for %s evidence", async (_name, mapSource, expectedIssues) => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-invalid-map-"));
    const assetsDir = path.join(root, "assets");

    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "console.log('editor');");
    await writeFile(path.join(assetsDir, "App-test.js.map"), mapSource);

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          sourceMapEvidence: Array<{ issues: string[]; status: string }>;
          status: string;
        };
      };

      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence.status).toBe("FAIL");
      expect(report.bundleEvidence.sourceMapEvidence[0]).toMatchObject({
        issues: expectedIssues,
        status: "INCOMPLETE"
      });
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
        mappings: "AAAA"
      })
    );
    await writeCompleteSourceMap(assetsDir, "index-test.js", [["../../src/entry.ts", ""]]);

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

async function writeCompleteSourceMap(
  assetsDir: string,
  chunkName: string,
  sources: Array<[string, string]> = [["../../src/renderer/fixture.ts", "export const fixture = true;"]]
): Promise<void> {
  await writeFile(
    path.join(assetsDir, `${chunkName}.map`),
    JSON.stringify({
      mappings: "AAAA",
      names: [],
      sources: sources.map(([source]) => source),
      sourcesContent: sources.map(([, content]) => content),
      version: 3
    })
  );
}

async function expectAnalyzerFailure(
  root: string,
  args: string[]
): Promise<{ code?: number; stdout: string }> {
  try {
    await execFileAsync(
      process.execPath,
      ["scripts/analyze-renderer-bundle.mjs", "--dist", root, ...args],
      { cwd: process.cwd() }
    );
    throw new Error("Expected bundle analyzer command to fail.");
  } catch (error) {
    const failedRun = error as { code?: number; stdout?: string };
    if (!failedRun.stdout) {
      throw error;
    }
    return { code: failedRun.code, stdout: failedRun.stdout };
  }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
