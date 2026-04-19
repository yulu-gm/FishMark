import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

const devServerPort = Number(process.env.YULORA_DEV_SERVER_PORT ?? "5173");
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
) as { version: string };

export default defineConfig({
  base: "./",
  define: {
    __YULORA_APP_VERSION__: JSON.stringify(packageJson.version)
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@yulora/editor-core": fileURLToPath(new URL("./packages/editor-core/src/index.ts", import.meta.url)),
      "@yulora/markdown-engine": fileURLToPath(
        new URL("./packages/markdown-engine/src/index.ts", import.meta.url)
      ),
      "@yulora/test-harness": fileURLToPath(
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
