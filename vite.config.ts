import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const devServerPort = Number(process.env.YULORA_DEV_SERVER_PORT ?? "5173");

export default defineConfig({
  base: "./",
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
    emptyOutDir: true
  }
});
