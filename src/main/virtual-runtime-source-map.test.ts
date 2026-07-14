import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  createVirtualRuntimeSourceMapAsset,
  type VirtualRuntimeSourceMapInput
} from "../../scripts/virtual-runtime-source-map";

const execFileAsync = promisify(execFile);

describe("createVirtualRuntimeSourceMapAsset", () => {
  it.each([
    ["source maps are disabled", { sourcemap: false }],
    ["the output is not a chunk", { type: "asset" }],
    ["the chunk already has a source map", { existingMap: {} }],
    ["the chunk has no modules", { moduleIds: [] }],
    ["the chunk mixes virtual and real modules", { moduleIds: ["\0virtual:runtime", "src/real.ts"] }],
    ["the chunk contains only real modules", { moduleIds: ["src/real.ts"] }]
  ] satisfies Array<[string, Partial<VirtualRuntimeSourceMapInput>]>) (
    "does not create fallback evidence when %s",
    (_name, override) => {
      expect(createVirtualRuntimeSourceMapAsset({ ...createInput(), ...override })).toBeNull();
    }
  );

  it("creates an auditable identity map for an all-virtual chunk", () => {
    const code = "const first = true;\nconst second = true;\n";
    const asset = createVirtualRuntimeSourceMapAsset({
      ...createInput(),
      code,
      fileName: "assets/runtime-test.js",
      moduleIds: ["\0virtual:zeta", "\0virtual:alpha"]
    });

    expect(asset).not.toBeNull();
    expect(asset?.fileName).toBe("assets/runtime-test.js.map");
    expect(JSON.parse(asset?.source ?? "null")).toEqual({
      file: "runtime-test.js",
      mappings: "AAAA;AACA;AACA",
      names: [],
      sources: ["virtual-build-runtime:runtime-test.js"],
      sourcesContent: [code],
      version: 3,
      x_fishmark_virtual_module_ids: ["\0virtual:alpha", "\0virtual:zeta"]
    });
  });

  it("produces source-map evidence that the bundle analyzer marks COMPLETE", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-virtual-map-"));
    const assetsDir = path.join(root, "assets");
    const code = "const runtime = true;\n";
    const asset = createVirtualRuntimeSourceMapAsset({
      ...createInput(),
      code,
      fileName: "App-test.js"
    });

    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), code);
    await writeFile(path.join(assetsDir, "App-test.js.map"), asset?.source ?? "");

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
          sourceMapEvidence: Array<{ issues: string[]; status: string }>;
          status: string;
        };
      };

      expect(report.bundleEvidence).toMatchObject({
        sourceMapEvidence: [{ issues: [], status: "COMPLETE" }],
        status: "PASS"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("leaves a mixed chunk unhandled so the bundle analyzer rejects missing evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-mixed-map-"));
    const assetsDir = path.join(root, "assets");
    const asset = createVirtualRuntimeSourceMapAsset({
      ...createInput(),
      moduleIds: ["\0virtual:runtime", "src/real.ts"]
    });

    await mkdir(assetsDir);
    await writeFile(path.join(assetsDir, "App-test.js"), "const runtime = true;\n");

    try {
      expect(asset).toBeNull();
      const failedRun = await expectAnalyzerFailure(root);
      const report = JSON.parse(failedRun.stdout) as {
        bundleEvidence: {
          sourceMapEvidence: Array<{ issues: string[]; status: string }>;
          status: string;
        };
      };

      expect(failedRun.code).toBe(1);
      expect(report.bundleEvidence).toMatchObject({
        sourceMapEvidence: [{ issues: ["source-map-missing"], status: "INCOMPLETE" }],
        status: "FAIL"
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function createInput(): VirtualRuntimeSourceMapInput {
  return {
    code: "const runtime = true;\n",
    existingMap: null,
    fileName: "App-test.js",
    moduleIds: ["\0virtual:runtime"],
    sourcemap: true,
    type: "chunk"
  };
}

async function expectAnalyzerFailure(root: string): Promise<{ code?: number; stdout: string }> {
  try {
    await execFileAsync(process.execPath, [
      "scripts/analyze-renderer-bundle.mjs",
      "--dist",
      root,
      "--json",
      "--forbid-initial-source-group",
      "mermaid"
    ], { cwd: process.cwd() });
    throw new Error("Expected bundle analyzer command to fail.");
  } catch (error) {
    const failedRun = error as { code?: number; stdout?: string };
    if (!failedRun.stdout) {
      throw error;
    }
    return { code: failedRun.code, stdout: failedRun.stdout };
  }
}
