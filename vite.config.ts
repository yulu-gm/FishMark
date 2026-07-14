import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

const devServerPort = Number(process.env.FISHMARK_DEV_SERVER_PORT ?? "5173");
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
) as { version: string };

function virtualRuntimeSourceMapEvidence(): Plugin {
  return {
    apply: "build",
    name: "fishmark-virtual-runtime-sourcemap-evidence",
    generateBundle(outputOptions, bundle) {
      if (!outputOptions.sourcemap) {
        return;
      }

      for (const output of Object.values(bundle)) {
        if (
          output.type !== "chunk" ||
          output.map ||
          output.moduleIds.length === 0 ||
          !output.moduleIds.every((moduleId) => moduleId.startsWith("\0"))
        ) {
          continue;
        }

        const sources = [...output.moduleIds]
          .sort(compareOrdinal)
          .map((moduleId) => `virtual-build-runtime:${moduleId.slice(1)}`);
        this.emitFile({
          fileName: `${output.fileName}.map`,
          source: JSON.stringify({
            file: output.fileName.split("/").at(-1),
            mappings: "",
            names: [],
            sources,
            sourcesContent: sources.map((_source, index) => (index === 0 ? output.code : "")),
            version: 3
          }),
          type: "asset"
        });
      }
    }
  };
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export default defineConfig({
  base: "./",
  define: {
    __FISHMARK_APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [react(), virtualRuntimeSourceMapEvidence()],
  resolve: {
    alias: {
      "@fishmark/editor-core": fileURLToPath(new URL("./packages/editor-core/src/index.ts", import.meta.url)),
      "@fishmark/markdown-engine": fileURLToPath(
        new URL("./packages/markdown-engine/src/index.ts", import.meta.url)
      ),
      "@fishmark/test-harness": fileURLToPath(
        new URL("./packages/test-harness/src/index.ts", import.meta.url)
      )
    }
  },
  root: "src/renderer",
  server: {
    host: "localhost",
    port: devServerPort,
    strictPort: true
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    // Keep standard backdrop-filter declarations in built CSS so Electron/Windows
    // renders the settings drawer blur the same way as the dev server.
    cssMinify: false
  }
});
