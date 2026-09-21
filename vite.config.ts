import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

import { createBundleProvenancePlugin } from "./scripts/vite-bundle-provenance";

const devServerPort = Number(process.env.FISHMARK_DEV_SERVER_PORT ?? "5173");
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
) as { version: string };

export default defineConfig({
  base: "./",
  define: {
    __FISHMARK_APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [
    react(),
    createBundleProvenancePlugin()
  ],
  resolve: {
    alias: {
      "@fishmark/markdown-presentation": fileURLToPath(
        new URL("./packages/markdown-presentation/src/index.ts", import.meta.url)
      ),
      "@fishmark/codemirror-adapter": fileURLToPath(
        new URL("./packages/codemirror-adapter/src/index.ts", import.meta.url)
      ),
      "@fishmark/editor-model": fileURLToPath(
        new URL("./packages/editor-model/src/index.ts", import.meta.url)
      ),
      "@fishmark/markdown-engine": fileURLToPath(
        new URL("./packages/markdown-engine/src/index.ts", import.meta.url)
      ),
      "@fishmark/test-harness": fileURLToPath(
        new URL("./packages/test-harness/src/index.ts", import.meta.url)
      ),
      "@fishmark/workspace-domain": fileURLToPath(
        new URL("./packages/workspace-domain/src/index.ts", import.meta.url)
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
