import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import {
  BUNDLE_PROVENANCE_FILE_NAME,
  BUNDLE_PROVENANCE_SCHEMA_VERSION,
  createBundleProvenanceAsset,
  createBundleProvenancePlugin,
  type BundleProvenanceChunkInput
} from "../../scripts/vite-bundle-provenance";

describe("createBundleProvenanceAsset", () => {
  it("does not emit provenance when source maps are disabled", () => {
    expect(createBundleProvenanceAsset(false, [createChunk()])).toBeNull();
  });

  it("emits deterministic, hash-bound provenance for every chunk", () => {
    const firstMap = JSON.stringify({ mappings: "AAAA", sources: ["src/first.ts"], version: 3 });
    const secondMap = JSON.stringify({ mappings: "AAAA", sources: ["src/second.ts"], version: 3 });
    const asset = createBundleProvenanceAsset(true, [
      createChunk({
        code: "const second = true;\n",
        dynamicImports: ["assets/lazy-z.js", "assets/lazy-a.js"],
        fileName: "assets/second.js",
        imports: ["assets/shared-z.js", "assets/shared-a.js"],
        isDynamicEntry: true,
        map: { toString: () => secondMap },
        moduleIds: ["src/zeta.ts", "src/alpha.ts"]
      }),
      createChunk({
        code: "const first = true;\n",
        fileName: "assets/first.js",
        isEntry: true,
        map: { toString: () => firstMap },
        moduleIds: ["src/first.ts"]
      })
    ]);

    expect(asset?.fileName).toBe(BUNDLE_PROVENANCE_FILE_NAME);
    const document = JSON.parse(asset?.source ?? "null") as {
      chunks: unknown[];
      hashAlgorithm: string;
      payloadSha256: string;
      schemaVersion: number;
    };
    const expectedChunks = [
      {
        codeSha256: sha256("const first = true;\n"),
        dynamicImports: [],
        facade: false,
        facadeModuleId: null,
        fileName: "assets/first.js",
        hasSourceMap: true,
        imports: [],
        isDynamicEntry: false,
        isEntry: true,
        mapFileName: "assets/first.js.map",
        mapSha256: sha256(firstMap),
        moduleIds: ["src/first.ts"]
      },
      {
        codeSha256: sha256("const second = true;\n"),
        dynamicImports: ["assets/lazy-a.js", "assets/lazy-z.js"],
        facade: false,
        facadeModuleId: null,
        fileName: "assets/second.js",
        hasSourceMap: true,
        imports: ["assets/shared-a.js", "assets/shared-z.js"],
        isDynamicEntry: true,
        isEntry: false,
        mapFileName: "assets/second.js.map",
        mapSha256: sha256(secondMap),
        moduleIds: ["src/alpha.ts", "src/zeta.ts"]
      }
    ];

    expect(document).toEqual({
      chunks: expectedChunks,
      hashAlgorithm: "sha256",
      payloadSha256: sha256(JSON.stringify(expectedChunks)),
      schemaVersion: BUNDLE_PROVENANCE_SCHEMA_VERSION
    });
  });

  it("attests an explicit zero-module facade without weakening ordinary chunks", () => {
    const asset = createBundleProvenanceAsset(true, [
      createChunk({
        facadeModuleId: "src/facade-entry.ts",
        fileName: "assets/facade.js",
        moduleIds: []
      })
    ]);
    const document = JSON.parse(asset?.source ?? "null") as {
      chunks: Array<{
        facade: boolean;
        facadeModuleId: string | null;
        moduleIds: string[];
      }>;
    };

    expect(document.chunks).toEqual([
      expect.objectContaining({
        facade: true,
        facadeModuleId: "src/facade-entry.ts",
        moduleIds: []
      })
    ]);

    expect(() =>
      createBundleProvenanceAsset(true, [
        createChunk({
          facadeModuleId: null,
          fileName: "assets/not-a-facade.js",
          moduleIds: []
        })
      ])
    ).toThrow(
      "Cannot emit bundle provenance without modules or an explicit facade for assets/not-a-facade.js."
    );
  });

  it("attests an all-virtual mapless chunk without inventing source-map evidence", () => {
    const asset = createBundleProvenanceAsset(true, [
      createChunk({
        fileName: "assets/runtime.js",
        hasSourceMap: false,
        map: null,
        moduleIds: ["\0virtual:runtime"]
      })
    ]);
    const document = JSON.parse(asset?.source ?? "null") as {
      chunks: Array<{
        hasSourceMap: boolean;
        mapFileName: string | null;
        mapSha256: string | null;
        moduleIds: string[];
      }>;
    };

    expect(document.chunks).toEqual([
      expect.objectContaining({
        hasSourceMap: false,
        mapFileName: null,
        mapSha256: null,
        moduleIds: ["\0virtual:runtime"]
      })
    ]);
  });

  it.each([
    [true, null, "Expected source-map evidence for assets/App-test.js."],
    [false, { toString: () => "{}" }, "Unexpected source-map evidence for mapless chunk assets/App-test.js."]
  ] as const)("rejects inconsistent hasSourceMap=%s evidence", (hasSourceMap, map, message) => {
    expect(() => createBundleProvenanceAsset(true, [createChunk({ hasSourceMap, map })]))
      .toThrow(message);
  });

  it("attests final on-disk mapless chunks and removes provenance for an ordinary build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-provenance-build-"));
    const outDir = path.join(root, "dist");
    const virtualEntryPlugin = {
      load(id: string) {
        return id === "\0fishmark:entry" ? "export const value = true;\n" : null;
      },
      name: "fishmark-test-virtual-entry",
      resolveId(source: string) {
        return source === "fishmark:entry" ? "\0fishmark:entry" : null;
      }
    };

    try {
      await build({
        configFile: false,
        logLevel: "silent",
        plugins: [virtualEntryPlugin, createBundleProvenancePlugin()],
        root,
        build: {
          emptyOutDir: true,
          outDir,
          rollupOptions: { input: "fishmark:entry" },
          sourcemap: true
        }
      });
      const provenance = JSON.parse(
        await readFile(path.join(outDir, BUNDLE_PROVENANCE_FILE_NAME), "utf8")
      ) as {
        chunks: Array<{
          codeSha256: string;
          fileName: string;
          hasSourceMap: boolean;
          mapFileName: string | null;
          mapSha256: string | null;
          moduleIds: string[];
        }>;
      };
      expect(provenance.chunks).toHaveLength(1);
      const chunk = provenance.chunks[0]!;
      expect(chunk.codeSha256).toBe(
        sha256(await readFile(path.join(outDir, ...chunk.fileName.split("/")), "utf8"))
      );
      expect(chunk).toMatchObject({ hasSourceMap: false, mapFileName: null, mapSha256: null });
      expect(chunk.moduleIds).toEqual(["\0fishmark:entry"]);

      await build({
        configFile: false,
        logLevel: "silent",
        plugins: [virtualEntryPlugin, createBundleProvenancePlugin()],
        root,
        build: {
          emptyOutDir: false,
          outDir,
          rollupOptions: { input: "fishmark:entry" },
          sourcemap: false
        }
      });
      expect(existsSync(path.join(outDir, BUNDLE_PROVENANCE_FILE_NAME))).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not claim filesystem provenance for a Vite write:false build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fishmark-provenance-memory-build-"));
    const outDir = path.join(root, "dist");
    await writeFile(path.join(root, "main.ts"), "export const value: boolean = true;\n");

    try {
      await build({
        configFile: false,
        logLevel: "silent",
        plugins: [createBundleProvenancePlugin()],
        root,
        build: {
          outDir,
          rollupOptions: { input: path.join(root, "main.ts") },
          sourcemap: true,
          write: false
        }
      });
      expect(existsSync(path.join(outDir, BUNDLE_PROVENANCE_FILE_NAME))).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function createChunk(
  override: Partial<BundleProvenanceChunkInput> = {}
): BundleProvenanceChunkInput {
  return {
    code: "const value = true;\n",
    dynamicImports: [],
    facadeModuleId: null,
    fileName: "assets/App-test.js",
    hasSourceMap: true,
    imports: [],
    isDynamicEntry: false,
    isEntry: false,
    map: { toString: () => "{}" },
    moduleIds: ["src/App.tsx"],
    ...override
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
