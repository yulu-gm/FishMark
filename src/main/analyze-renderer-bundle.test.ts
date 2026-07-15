import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  BUNDLE_PROVENANCE_FILE_NAME,
  createBundleProvenanceAsset,
  type BundleProvenanceChunkInput
} from "../../scripts/vite-bundle-provenance";

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
    await writeCompleteSourceMap(assetsDir, "settings-view-test.js");
    await writeBundleProvenance(root);

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

  it("keeps the public bundle baseline policy only in the architecture manifest", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const perfBundle = packageJson.scripts["perf:bundle"];

    expect(perfBundle).toContain(
      "--contract fixtures/architecture/editor-foundation-guard.json"
    );
    expect(perfBundle).not.toMatch(
      /--max-|--require-lazy-chunk|--forbid-initial-source-group/u
    );
    expect(perfBundle).not.toMatch(/300000|90000|260000|1430000/u);
  });

  it("loads all 23 canonical checks from one contract and emits stable contract identity", async () => {
    const root = await createContractBundle();
    const args = [
      "scripts/analyze-renderer-bundle.mjs",
      "--dist",
      root,
      "--json",
      "--contract",
      "fixtures/architecture/editor-foundation-guard.json"
    ];

    try {
      const firstRun = await execFileAsync(process.execPath, args, { cwd: process.cwd() });
      const secondRun = await execFileAsync(process.execPath, args, { cwd: process.cwd() });
      const report = JSON.parse(firstRun.stdout) as {
        bundleEvidence: { appliedCheckIds: string[]; checks: unknown[]; status: string };
        contract: {
          architectureSchemaVersion: number;
          bundlePolicySchemaVersion: number;
          path: string;
          sha256: string;
        };
      };

      expect(secondRun.stdout).toBe(firstRun.stdout);
      expect(report.bundleEvidence.status).toBe("PASS");
      expect(report.bundleEvidence.appliedCheckIds).toHaveLength(23);
      expect(report.bundleEvidence.checks).toHaveLength(23);
      expect(report.contract).toEqual({
        architectureSchemaVersion: 1,
        bundlePolicySchemaVersion: 1,
        path: "fixtures/architecture/editor-foundation-guard.json",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      "missing bundle policy",
      (contract: Record<string, unknown>) => {
        delete contract.bundlePolicy;
      }
    ],
    [
      "empty bundle policy",
      (contract: Record<string, unknown>) => {
        (contract.bundlePolicy as Record<string, unknown>).checks = [];
      }
    ],
    [
      "unknown check kind",
      (contract: Record<string, unknown>) => {
        const checks = (contract.bundlePolicy as { checks: Array<Record<string, unknown>> }).checks;
        checks[0]!.kind = "allow";
      }
    ],
    [
      "duplicate check",
      (contract: Record<string, unknown>) => {
        const checks = (contract.bundlePolicy as { checks: Array<Record<string, unknown>> }).checks;
        checks.push({ ...checks[0] });
      }
    ],
    [
      "invalid maximum limit",
      (contract: Record<string, unknown>) => {
        const checks = (contract.bundlePolicy as { checks: Array<Record<string, unknown>> }).checks;
        const maximum = checks.find((check) => check.kind === "maximum");
        maximum!.limit = 0;
      }
    ],
    [
      "unexpected check field",
      (contract: Record<string, unknown>) => {
        const checks = (contract.bundlePolicy as { checks: Array<Record<string, unknown>> }).checks;
        checks[0]!.override = true;
      }
    ]
  ])("fails closed for a contract with %s", async (_name, mutate) => {
    const root = await createContractBundle();
    const contract = await readCanonicalContract();
    const contractPath = path.join(root, "contract.json");
    mutate(contract);
    await writeFile(contractPath, JSON.stringify(contract));

    try {
      const failedRun = await expectCommandFailure([
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--contract",
        contractPath
      ]);

      expect(failedRun.code).toBe(1);
      expect(failedRun.stderr).toContain("Invalid bundle contract:");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects contract mode mixed with ad-hoc policy flags", async () => {
    const root = await createContractBundle();

    try {
      const failedRun = await expectCommandFailure([
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--contract",
        "fixtures/architecture/editor-foundation-guard.json",
        "--max-total-gzip-bytes",
        "2000000"
      ]);

      expect(failedRun.code).toBe(1);
      expect(failedRun.stderr).toContain("cannot be combined");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("exits non-zero when a contract-owned check fails", async () => {
    const root = await createContractBundle();
    const contract = await readCanonicalContract();
    const checks = (contract.bundlePolicy as { checks: Array<Record<string, unknown>> }).checks;
    const maximum = checks.find((check) => check.id === "bundle.max-total-gzip-bytes");
    maximum!.limit = 1;
    const contractPath = path.join(root, "contract.json");
    await writeFile(contractPath, JSON.stringify(contract));

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--contract",
        contractPath
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          checks: Array<{ actual: unknown; id: string; limit: unknown; status: string }>;
          status: string;
        };
      };

      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence.status).toBe("FAIL");
      expect(
        report.bundleEvidence.checks.find(
          (check) => check.id === "bundle.max-total-gzip-bytes"
        )
      ).toMatchObject({ actual: expect.any(Number), limit: 1, status: "FAIL" });
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
    await writeCompleteSourceMap(assetsDir, "index-test.js");
    await writeBundleProvenance(root);
    await rm(path.join(assetsDir, "index-test.js.map"));

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

  it("fails closed when source-group evidence has no versioned bundle provenance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-missing-provenance-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "console.log('editor');");
    await writeCompleteSourceMap(assetsDir, "App-test.js");

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          provenanceEvidence: { issues: string[]; status: string };
          status: string;
        };
      };
      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence.status).toBe("FAIL");
      expect(report.bundleEvidence.provenanceEvidence).toEqual({
        file: "fishmark-bundle-provenance.json",
        issues: ["bundle-provenance-missing"],
        status: "INCOMPLETE"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    ["safe", ["../../src/renderer/App.tsx"], "PASS", []],
    [
      "forbidden",
      ["../../node_modules/mermaid/dist/mermaid.js"],
      "FAIL",
      ["App-test.js"]
    ]
  ] as const)(
    "keeps a %s mapless chunk authoritative through provenance moduleIds",
    async (_name, moduleIds, expectedStatus, expectedMatches) => {
      const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-mapless-"));
      const assetsDir = path.join(root, "assets");
      await mkdir(assetsDir);
      await writeFile(path.join(assetsDir, "App-test.js"), "const value = true;");
      await writeBundleProvenance(root, { "App-test.js": [...moduleIds] });

      try {
        const command = [
          "scripts/analyze-renderer-bundle.mjs",
          "--dist",
          root,
          "--json",
          "--forbid-initial-source-group",
          "mermaid"
        ];
        const result = expectedStatus === "PASS"
          ? await execFileAsync(process.execPath, command, { cwd: process.cwd() })
          : await expectCommandFailure(command);
        const report = JSON.parse(result.stdout) as {
          bundleEvidence: {
            checks: Array<{ actual: { evidenceStatus: string; matchingChunks: string[] } }>;
            provenanceEvidence: { status: string };
            sourceMapEvidence: Array<{ issues: string[]; map: string | null; status: string }>;
            status: string;
          };
        };

        expect(report.bundleEvidence).toMatchObject({
          provenanceEvidence: { status: "COMPLETE" },
          sourceMapEvidence: [{ issues: [], map: null, status: "NOT_EMITTED" }],
          status: expectedStatus
        });
        expect(report.bundleEvidence.checks[0]?.actual).toMatchObject({
          evidenceStatus: "COMPLETE",
          matchingChunks: expectedMatches
        });
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    }
  );

  it("supports mapped, real-mapless, and virtual-mapless chunks in one initial closure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-mixed-map-state-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(
      path.join(assetsDir, "App-test.js"),
      'import "./real-runtime.js"; import "./virtual-runtime.js";'
    );
    await writeFile(path.join(assetsDir, "real-runtime.js"), "export const real = true;");
    await writeFile(path.join(assetsDir, "virtual-runtime.js"), "export const virtual = true;");
    await writeCompleteSourceMap(assetsDir, "App-test.js");
    await writeBundleProvenance(root, {
      "App-test.js": ["../../src/renderer/App.tsx"],
      "real-runtime.js": ["../../node_modules/example-runtime/index.js"],
      "virtual-runtime.js": ["\0virtual:runtime"]
    });

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ], { cwd: process.cwd() });
      const report = JSON.parse(stdout) as {
        bundleEvidence: {
          provenanceEvidence: { status: string };
          sourceMapEvidence: Array<{ chunk: string; status: string }>;
          status: string;
        };
      };
      expect(report.bundleEvidence).toMatchObject({
        provenanceEvidence: { status: "COMPLETE" },
        status: "PASS"
      });
      expect(report.bundleEvidence.sourceMapEvidence).toEqual([
        expect.objectContaining({ chunk: "App-test.js", status: "COMPLETE" }),
        expect.objectContaining({ chunk: "real-runtime.js", status: "NOT_EMITTED" }),
        expect.objectContaining({ chunk: "virtual-runtime.js", status: "NOT_EMITTED" })
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails when a provenance-attested mapless chunk gains an unexpected map", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-mapless-mismatch-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "const value = true;");
    await writeBundleProvenance(root);
    await writeCompleteSourceMap(assetsDir, "App-test.js");

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: { provenanceEvidence: { issues: string[]; status: string } };
      };
      expect(report.bundleEvidence.provenanceEvidence).toMatchObject({
        issues: expect.arrayContaining([
          "bundle-provenance-mapless-disk-mismatch:assets/App-test.js"
        ]),
        status: "INCOMPLETE"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      "mapless fields are non-null",
      (record: Record<string, unknown>) => {
        record.mapFileName = "assets/App-test.js.map";
        record.mapSha256 = "0".repeat(64);
      },
      "bundle-provenance-mapless-fields-invalid:assets/App-test.js"
    ],
    [
      "mapped fields are null",
      (record: Record<string, unknown>) => {
        record.hasSourceMap = true;
      },
      "bundle-provenance-map-file-name-invalid:assets/App-test.js"
    ],
    [
      "an unknown chunk field is present",
      (record: Record<string, unknown>) => {
        record.compatibility = true;
      },
      "bundle-provenance-chunk-fields-invalid:assets/App-test.js:compatibility"
    ]
  ])("fails closed when %s", async (_name, mutate, expectedIssue) => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-provenance-shape-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "const value = true;");
    await writeBundleProvenance(root);
    await rewriteBundleProvenance(root, mutate);

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: { provenanceEvidence: { issues: string[]; status: string } };
      };
      expect(report.bundleEvidence.provenanceEvidence).toMatchObject({
        issues: expect.arrayContaining([expectedIssue]),
        status: "INCOMPLETE"
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
      "missing names",
      JSON.stringify({
        mappings: "AAAA",
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-names-missing"]
    ],
    [
      "non-array names",
      JSON.stringify({
        mappings: "AAAA",
        names: {},
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-names-invalid"]
    ],
    [
      "non-string name",
      JSON.stringify({
        mappings: "AAAA",
        names: [1],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-name-invalid:0"]
    ],
    [
      "empty name",
      JSON.stringify({
        mappings: "AAAA",
        names: [""],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-name-invalid:0"]
    ],
    [
      "out-of-range name reference",
      JSON.stringify({
        mappings: "AAAAC",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-name-reference-invalid"]
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
      "non-array ignoreList",
      JSON.stringify({
        ignoreList: {},
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-ignore-list-invalid"]
    ],
    [
      "duplicate ignoreList entries",
      JSON.stringify({
        ignoreList: [0, 0],
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-ignore-list-entry-invalid:1"]
    ],
    [
      "out-of-range x_google_ignoreList entry",
      JSON.stringify({
        mappings: "AAAA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3,
        x_google_ignoreList: [1]
      }),
      ["source-map-google-ignore-list-reference-invalid:0"]
    ],
    [
      "mapping that references a generated line outside the chunk",
      JSON.stringify({
        mappings: "AAAA;AACA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: ["export const app = true;"],
        version: 3
      }),
      ["source-map-generated-line-reference-invalid:2"]
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
    await writeBundleProvenance(root);

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

  it.each([
    ["generated code", "App-test.js", "bundle-provenance-code-hash-mismatch:assets/App-test.js"],
    ["source map", "App-test.js.map", "bundle-provenance-map-hash-mismatch:assets/App-test.js"]
  ])("fails closed when provenance-bound %s is changed", async (_name, target, expectedIssue) => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-hash-tamper-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "const value = true;");
    await writeCompleteSourceMap(assetsDir, "App-test.js");
    await writeBundleProvenance(root);
    await writeFile(path.join(assetsDir, target), `${await readFile(path.join(assetsDir, target), "utf8")} `);

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: { provenanceEvidence: { issues: string[]; status: string } };
      };
      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence.provenanceEvidence).toMatchObject({
        issues: expect.arrayContaining([expectedIssue]),
        status: "INCOMPLETE"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each(["moduleIds", "imports"] as const)(
    "fails closed when the provenance %s payload is changed",
    async (field) => {
      const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-payload-tamper-"));
      const assetsDir = path.join(root, "assets");
      await mkdir(assetsDir);
      await writeFile(path.join(assetsDir, "App-test.js"), 'import "./shared-test.js";');
      await writeFile(path.join(assetsDir, "shared-test.js"), "export const shared = true;");
      await writeCompleteSourceMap(assetsDir, "App-test.js");
      await writeCompleteSourceMap(assetsDir, "shared-test.js");
      await writeBundleProvenance(root);
      const provenancePath = path.join(root, BUNDLE_PROVENANCE_FILE_NAME);
      const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
        chunks: Array<Record<string, unknown>>;
      };
      const appRecord = provenance.chunks.find(
        (record) => record.fileName === "assets/App-test.js"
      )!;
      (appRecord[field] as string[]).push(field === "moduleIds" ? "src/tampered.ts" : "assets/tampered.js");
      await writeFile(provenancePath, JSON.stringify(provenance));

      try {
        const failedRun = await expectAnalyzerFailure(root, [
          "--json",
          "--forbid-initial-source-group",
          "mermaid"
        ]);
        const report = JSON.parse(failedRun.stdout) as {
          bundleEvidence: { provenanceEvidence: { issues: string[]; status: string } };
        };
        expect(failedRun.code).toBe(1);
        expect(report.bundleEvidence.provenanceEvidence).toMatchObject({
          issues: expect.arrayContaining(["bundle-provenance-payload-hash-mismatch"]),
          status: "INCOMPLETE"
        });
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    }
  );

  it("uses provenance moduleIds as the forbidden source-group authority", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-module-authority-"));
    const assetsDir = path.join(root, "assets");
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "const value = true;");
    await writeCompleteSourceMap(assetsDir, "App-test.js", [
      ["../../src/renderer/App.tsx", "export const app = true;"]
    ]);
    await writeBundleProvenance(root, {
      "App-test.js": ["../../node_modules/mermaid/dist/mermaid.js"]
    });

    try {
      const failedRun = await expectAnalyzerFailure(root, [
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ]);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          checks: Array<{ actual: { matchingChunks: string[] }; id: string }>;
          sourceGroupAuthority: string;
          sourceMapEvidence: Array<{ issues: string[]; status: string }>;
        };
      };
      expect(report.bundleEvidence.sourceGroupAuthority).toBe("bundle-provenance-module-ids");
      expect(report.bundleEvidence.sourceMapEvidence[0]).toMatchObject({ issues: [], status: "COMPLETE" });
      expect(
        report.bundleEvidence.checks.find(
          (check) => check.id === "bundle.forbidden-initial-source-group:mermaid"
        )?.actual.matchingChunks
      ).toEqual(["App-test.js"]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("accepts structurally valid mappings when code and map are provenance-bound", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-line-map-"));
    const assetsDir = path.join(root, "assets");
    const generatedSource = "const first = 1;\n\n  const second = 2;";
    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), generatedSource);
    await writeFile(
      path.join(assetsDir, "App-test.js.map"),
      JSON.stringify({
        mappings: "AAAA;;EACA",
        names: [],
        sources: ["../../src/renderer/App.tsx"],
        sourcesContent: [generatedSource],
        version: 3
      })
    );
    await writeBundleProvenance(root);

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        "scripts/analyze-renderer-bundle.mjs",
        "--dist",
        root,
        "--json",
        "--forbid-initial-source-group",
        "mermaid"
      ], { cwd: process.cwd() });
      const report = JSON.parse(stdout) as {
        bundleEvidence: { sourceMapEvidence: Array<{ issues: string[]; status: string }> };
      };
      expect(report.bundleEvidence.sourceMapEvidence[0]).toEqual(
        expect.objectContaining({ issues: [], status: "COMPLETE" })
      );
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
    await writeCompleteSourceMap(assetsDir, "export-html-test.js");
    await writeBundleProvenance(root);

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

async function createContractBundle(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "fishmark-bundle-contract-"));
  const assetsDir = path.join(root, "assets");
  await mkdir(assetsDir);
  await writeFile(
    path.join(root, "index.html"),
    '<script type="module" src="./assets/index-test.js"></script>'
  );
  await writeFile(path.join(assetsDir, "App-test.js"), "console.log('editor');");
  await writeFile(path.join(assetsDir, "index-test.js"), "console.log('entry');");
  for (const lazyChunk of [
    "export-html-test.js",
    "katex-test.js",
    "mermaid-test.js",
    "theme-surface-runtime-test.js"
  ]) {
    await writeFile(path.join(assetsDir, lazyChunk), "console.log('lazy');");
    await writeCompleteSourceMap(assetsDir, lazyChunk);
  }
  await writeCompleteSourceMap(assetsDir, "App-test.js");
  await writeCompleteSourceMap(assetsDir, "index-test.js");
  await writeBundleProvenance(root);
  return root;
}

async function readCanonicalContract(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile("fixtures/architecture/editor-foundation-guard.json", "utf8")
  ) as Record<string, unknown>;
}

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

async function writeBundleProvenance(
  root: string,
  moduleIdsByChunk: Record<string, string[]> = {}
): Promise<void> {
  const assetsDir = path.join(root, "assets");
  const chunkNames = (await readdir(assetsDir))
    .filter((fileName) => fileName.endsWith(".js"))
    .sort(compareOrdinal);
  const chunks: BundleProvenanceChunkInput[] = [];

  for (const chunkName of chunkNames) {
    const code = await readFile(path.join(assetsDir, chunkName), "utf8");
    const mapPath = path.join(assetsDir, `${chunkName}.map`);
    const hasSourceMap = existsSync(mapPath);
    const mapSource = hasSourceMap ? await readFile(mapPath, "utf8") : null;
    const staticImports = readFixtureStaticImports(code).map((dependency) => `assets/${dependency}`);
    const dynamicImports = readFixtureDynamicImports(code).map(
      (dependency) => `assets/${dependency}`
    );
    chunks.push({
      code,
      dynamicImports,
      fileName: `assets/${chunkName}`,
      hasSourceMap,
      imports: staticImports,
      isDynamicEntry: false,
      isEntry: chunkName.startsWith("App-"),
      map: mapSource === null ? null : { toString: () => mapSource },
      moduleIds: moduleIdsByChunk[chunkName] ?? readFixtureModuleIds(mapSource)
    });
  }

  const asset = createBundleProvenanceAsset(true, chunks);
  await writeFile(path.join(root, BUNDLE_PROVENANCE_FILE_NAME), asset?.source ?? "");
}

async function rewriteBundleProvenance(
  root: string,
  mutate: (record: Record<string, unknown>) => void
): Promise<void> {
  const provenancePath = path.join(root, BUNDLE_PROVENANCE_FILE_NAME);
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
    chunks: Array<Record<string, unknown>>;
    payloadSha256: string;
  };
  mutate(provenance.chunks[0]!);
  provenance.payloadSha256 = createHash("sha256")
    .update(JSON.stringify(provenance.chunks))
    .digest("hex");
  await writeFile(provenancePath, JSON.stringify(provenance));
}

function readFixtureStaticImports(code: string): string[] {
  const imports = new Set<string>();
  for (const pattern of [
    /\b(?:import|export)(?!\s*\()[^;]*?\bfrom\s*["']\.\/([^"']+\.js)["']/gu,
    /\bimport\s*["']\.\/([^"']+\.js)["']/gu
  ]) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
  }
  return [...imports].sort(compareOrdinal);
}

function readFixtureDynamicImports(code: string): string[] {
  return [...code.matchAll(/\bimport\s*\(\s*["'\x60]\.\/([^"'\x60]+\.js)["'\x60]\s*\)/gu)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort(compareOrdinal);
}

function readFixtureModuleIds(mapSource: string | null): string[] {
  if (mapSource === null) {
    return ["../../src/renderer/fixture.ts"];
  }
  try {
    const sourceMap = JSON.parse(mapSource) as { sources?: unknown };
    if (Array.isArray(sourceMap.sources)) {
      const moduleIds = sourceMap.sources.filter(
        (source): source is string => typeof source === "string" && source.length > 0
      );
      if (moduleIds.length > 0) {
        return [...new Set(moduleIds)].sort(compareOrdinal);
      }
    }
  } catch {
    // Invalid source-map fixtures still need valid provenance so the map validator owns the failure.
  }
  return ["../../src/renderer/fixture.ts"];
}

async function expectCommandFailure(
  args: string[]
): Promise<{ code?: number; stderr: string; stdout: string }> {
  try {
    await execFileAsync(process.execPath, args, { cwd: process.cwd() });
    throw new Error("Expected command to fail.");
  } catch (error) {
    const failedRun = error as { code?: number; stderr?: string; stdout?: string };
    if (failedRun.code === undefined) {
      throw error;
    }
    return {
      code: failedRun.code,
      stderr: failedRun.stderr ?? "",
      stdout: failedRun.stdout ?? ""
    };
  }
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
