import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  plugins: [{
    name: "sandbox-preload-contract",
    enforce: "pre",
    resolveId(source) {
      if (source !== "electron" && !source.startsWith(".") && !isAbsolute(source) && !source.startsWith("\0")) {
        this.error(`Sandbox preload cannot import ${source}; only electron and bundled local modules are allowed.`);
      }
    },
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const entry = files[0];
      if (files.length !== 1 || entry?.type !== "chunk" || entry.fileName !== "preload.js" ||
          !entry.isEntry || entry.dynamicImports.length !== 0 ||
          entry.imports.length !== 1 || entry.imports[0] !== "electron") {
        this.error("Sandbox preload must emit one preload.js entry with only electron as a runtime import.");
      }
    }
  }],
  build: {
    target: "chrome146",
    minify: false,
    // This directory belongs only to the bundler; main's tsc never emits preload.
    outDir: "dist-electron/preload",
    emptyOutDir: true,
    lib: {
      entry: "src/preload/preload.ts",
      formats: ["cjs"],
      fileName: () => "preload.js"
    },
    rolldownOptions: {
      external: ["electron"],
      output: { codeSplitting: false }
    }
  }
});
