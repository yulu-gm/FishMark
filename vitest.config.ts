import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
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
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/**/*.test.ts"]
  }
});
