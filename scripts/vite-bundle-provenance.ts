import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

export const BUNDLE_PROVENANCE_FILE_NAME = "fishmark-bundle-provenance.json";
export const BUNDLE_PROVENANCE_SCHEMA_VERSION = 1;

export interface BundleProvenanceChunkInput {
  code: string;
  dynamicImports: readonly string[];
  fileName: string;
  hasSourceMap: boolean;
  imports: readonly string[];
  isDynamicEntry: boolean;
  isEntry: boolean;
  map: { toString(): string } | null;
  moduleIds: readonly string[];
}

export interface BundleProvenanceAsset {
  fileName: string;
  source: string;
}

interface BundleProvenanceChunk {
  codeSha256: string;
  dynamicImports: string[];
  fileName: string;
  hasSourceMap: boolean;
  imports: string[];
  isDynamicEntry: boolean;
  isEntry: boolean;
  mapFileName: string | null;
  mapSha256: string | null;
  moduleIds: string[];
}

export function createBundleProvenancePlugin(): Plugin {
  let graph: Array<Omit<BundleProvenanceChunkInput, "code" | "map">> | null = null;
  let sourcemapEnabled = false;

  return {
    apply: "build",
    name: "fishmark-bundle-provenance",
    generateBundle(outputOptions, bundle) {
      sourcemapEnabled = Boolean(outputOptions.sourcemap);
      graph = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((output) => ({
          dynamicImports: output.dynamicImports,
          fileName: output.fileName,
          hasSourceMap: output.map !== null,
          imports: output.imports,
          isDynamicEntry: output.isDynamicEntry,
          isEntry: output.isEntry,
          moduleIds: output.moduleIds
        }));
    },
    writeBundle(outputOptions) {
      if (!outputOptions.dir) {
        throw new Error("Bundle provenance requires directory output.");
      }
      const outputDirectory = path.resolve(outputOptions.dir);
      const provenancePath = path.join(outputDirectory, BUNDLE_PROVENANCE_FILE_NAME);
      if (!sourcemapEnabled) {
        rmSync(provenancePath, { force: true });
        return;
      }
      if (!graph) {
        throw new Error("Bundle provenance graph was not captured before writeBundle.");
      }

      const chunks = graph.map((chunk): BundleProvenanceChunkInput => {
        const code = readFileSync(path.join(outputDirectory, ...chunk.fileName.split("/")), "utf8");
        const mapPath = path.join(outputDirectory, ...`${chunk.fileName}.map`.split("/"));
        const hasFinalSourceMap = existsSync(mapPath);
        if (chunk.hasSourceMap && !hasFinalSourceMap) {
          throw new Error(
            `Expected final source-map evidence for ${chunk.fileName}, but the map is missing.`
          );
        }
        if (!chunk.hasSourceMap && hasFinalSourceMap) {
          throw new Error(
            `Unexpected final source-map evidence for mapless chunk ${chunk.fileName}.`
          );
        }
        const mapSource = hasFinalSourceMap ? readFileSync(mapPath, "utf8") : null;
        return {
          ...chunk,
          code,
          map: mapSource === null ? null : { toString: () => mapSource }
        };
      });
      const asset = createBundleProvenanceAsset(true, chunks);
      if (!asset) {
        throw new Error("Bundle provenance asset was not created for a sourcemap build.");
      }
      writeAtomically(provenancePath, asset.source);
    }
  };
}

function writeAtomically(filePath: string, source: string): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, source);
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function createBundleProvenanceAsset(
  sourcemap: unknown,
  chunks: readonly BundleProvenanceChunkInput[]
): BundleProvenanceAsset | null {
  if (!sourcemap) {
    return null;
  }

  const records = [...chunks]
    .sort((left, right) => compareOrdinal(left.fileName, right.fileName))
    .map(createChunkRecord);
  const document = {
    chunks: records,
    hashAlgorithm: "sha256",
    payloadSha256: sha256(JSON.stringify(records)),
    schemaVersion: BUNDLE_PROVENANCE_SCHEMA_VERSION
  };

  return {
    fileName: BUNDLE_PROVENANCE_FILE_NAME,
    source: JSON.stringify(document)
  };
}

function createChunkRecord(chunk: BundleProvenanceChunkInput): BundleProvenanceChunk {
  if (chunk.moduleIds.length === 0) {
    throw new Error(`Cannot emit bundle provenance without modules for ${chunk.fileName}.`);
  }

  const mapSource = readSourceMapSource(chunk);
  return {
    codeSha256: sha256(chunk.code),
    dynamicImports: sortUnique(chunk.dynamicImports),
    fileName: chunk.fileName,
    hasSourceMap: chunk.hasSourceMap,
    imports: sortUnique(chunk.imports),
    isDynamicEntry: chunk.isDynamicEntry,
    isEntry: chunk.isEntry,
    mapFileName: mapSource === null ? null : `${chunk.fileName}.map`,
    mapSha256: mapSource === null ? null : sha256(mapSource),
    moduleIds: sortUnique(chunk.moduleIds)
  };
}

function readSourceMapSource(chunk: BundleProvenanceChunkInput): string | null {
  if (chunk.hasSourceMap && chunk.map === null) {
    throw new Error(`Expected source-map evidence for ${chunk.fileName}.`);
  }
  if (!chunk.hasSourceMap && chunk.map !== null) {
    throw new Error(`Unexpected source-map evidence for mapless chunk ${chunk.fileName}.`);
  }
  return chunk.map?.toString() ?? null;
}

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareOrdinal);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
