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
      "@fishmark/workspace-application": fileURLToPath(
        new URL("./packages/workspace-application/src/index.ts", import.meta.url)
      ),
      "@fishmark/workspace-domain": fileURLToPath(
        new URL("./packages/workspace-domain/src/index.ts", import.meta.url)
      ),
      "@fishmark/workspace-infrastructure": fileURLToPath(
        new URL("./packages/workspace-infrastructure/src/index.ts", import.meta.url)
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
    // FishMark's renderer only runs inside Electron 41.x (Chromium 146).
    // Avoid Vite's broad-browser transpilation so shipped JS matches the
    // actual desktop runtime contract instead of carrying unused fallbacks.
    target: "chrome146",
    minify: "terser",
    terserOptions: {
      // M5's remaining bundle debt is compression, not compatibility.
      // Two passes trade a little build time for a smaller deterministic
      // production artifact while preserving the Electron 41 runtime target.
      ecma: 2022,
      module: true,
      compress: {
        passes: 5,
        // All renderer chunks are strict ES modules targeting Chromium 146.
        // These transforms preserve that runtime contract while allowing Terser
        // to shorten legacy function/arguments patterns emitted by dependencies.
        arguments: true,
        unsafe_arrows: true,
        unsafe_undefined: true,
        pure_getters: true,
        // Production renderer diagnostics keep console.error, while routine
        // debug/info/warn output is stripped from both FishMark and bundled
        // optional libraries. This reduces shipped JS without changing any
        // runtime feature or bundle budget.
        drop_console: true
      }
    },
    modulePreload: {
      // Chromium 146 implements modulepreload natively; the Vite compatibility
      // polyfill would be dead code in every supported FishMark renderer.
      polyfill: false
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules[\\/]katex[\\/]/u.test(id)) {
            return "katex";
          }
          if (/node_modules[\\/]@codemirror[\\/]view[\\/]/u.test(id)) {
            return "codemirror-view";
          }
          if (/node_modules[\\/]@codemirror[\\/]state[\\/]/u.test(id)) {
            return "codemirror-state";
          }
          if (/[\\/]packages[\\/]editor-model[\\/]src[\\/]/u.test(id)) {
            return "fishmark-editor-model";
          }
          if (/[\\/]packages[\\/]markdown-engine[\\/]src[\\/]/u.test(id)) {
            return "fishmark-markdown-engine";
          }
          if (/[\\/]packages[\\/]workspace-application[\\/]src[\\/]/u.test(id)) {
            return "fishmark-workspace-application";
          }
          if (/[\\/]packages[\\/]workspace-infrastructure[\\/]src[\\/]/u.test(id)) {
            return "fishmark-workspace-infrastructure";
          }
          return undefined;
        }
      }
    },
    outDir: "../../dist",
    emptyOutDir: true,
    // Keep standard backdrop-filter declarations in built CSS so Electron/Windows
    // renders the settings drawer blur the same way as the dev server.
    cssMinify: false
  }
});
