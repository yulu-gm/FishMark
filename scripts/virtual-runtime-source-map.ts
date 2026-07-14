import type { Plugin } from "vite";

export interface VirtualRuntimeSourceMapInput {
  code: string;
  existingMap: unknown;
  fileName: string;
  moduleIds: readonly string[];
  sourcemap: unknown;
  type: string;
}

export interface VirtualRuntimeSourceMapAsset {
  fileName: string;
  source: string;
}

export function createVirtualRuntimeSourceMapEvidencePlugin(): Plugin {
  return {
    apply: "build",
    name: "fishmark-virtual-runtime-sourcemap-evidence",
    generateBundle(outputOptions, bundle) {
      if (!outputOptions.sourcemap) {
        return;
      }

      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") {
          continue;
        }

        const asset = createVirtualRuntimeSourceMapAsset({
          code: output.code,
          existingMap: output.map,
          fileName: output.fileName,
          moduleIds: output.moduleIds,
          sourcemap: outputOptions.sourcemap,
          type: output.type
        });
        if (!asset) {
          continue;
        }

        this.emitFile({
          fileName: asset.fileName,
          source: asset.source,
          type: "asset"
        });
      }
    }
  };
}

export function createVirtualRuntimeSourceMapAsset(
  input: VirtualRuntimeSourceMapInput
): VirtualRuntimeSourceMapAsset | null {
  if (
    !input.sourcemap ||
    input.type !== "chunk" ||
    (input.existingMap !== null && input.existingMap !== undefined) ||
    input.moduleIds.length === 0 ||
    !input.moduleIds.every((moduleId) => moduleId.startsWith("\0"))
  ) {
    return null;
  }

  const virtualModuleIds = [...input.moduleIds].sort(compareOrdinal);
  const outputName = input.fileName.split(/[\\/]/u).at(-1) ?? input.fileName;

  return {
    fileName: `${input.fileName}.map`,
    source: JSON.stringify({
      file: outputName,
      mappings: createLineIdentityMappings(input.code),
      names: [],
      sources: [`virtual-build-runtime:${outputName}`],
      sourcesContent: [input.code],
      version: 3,
      x_fishmark_virtual_module_ids: virtualModuleIds
    })
  };
}

function createLineIdentityMappings(code: string): string {
  if (code.length === 0) {
    return "";
  }

  const lineBreakCount = code.match(/\r\n|[\n\r\u2028\u2029]/gu)?.length ?? 0;
  return ["AAAA", ...Array.from({ length: lineBreakCount }, () => "AACA")].join(";");
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
