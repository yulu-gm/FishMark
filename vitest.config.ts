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
      "workspace-domain-test-conformance": fileURLToPath(
        new URL("./packages/workspace-domain/test/text-buffer-conformance.ts", import.meta.url)
      ),
      "@fishmark/editor-core": fileURLToPath(new URL("./packages/editor-core/src/index.ts", import.meta.url)),
      "@fishmark/editor-model": fileURLToPath(new URL("./packages/editor-model/src/index.ts", import.meta.url)),
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
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/**/*.test.ts"]
  }
});
