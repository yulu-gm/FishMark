import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("waits for the shared Electron build output before launching the app in dev", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:electron"]).toContain(
      "dist-electron/shared/open-markdown-file.js"
    );
    expect(packageJson.scripts?.["dev:electron"]).toContain(
      "dist-electron/shared/save-markdown-file.js"
    );
  });

  it("does not import local shared modules from the preload source", () => {
    const preloadPath = path.join(process.cwd(), "src", "preload", "preload.ts");
    const preloadSource = readFileSync(preloadPath, "utf8");

    expect(preloadSource).not.toContain('../shared/open-markdown-file');
    expect(preloadSource).not.toContain("\"../shared/open-markdown-file\"");
  });
});
