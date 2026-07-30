import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
) as { version: string };

export default defineConfig({
  define: {
    __FISHMARK_APP_VERSION__: JSON.stringify(packageJson.version)
  },
  resolve: {
    alias: {
      "@fishmark/editor-core": fileURLToPath(new URL("./packages/editor-core/src/index.ts", import.meta.url)),
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
      )
    }
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/**/*.test.ts"]
  }
});
