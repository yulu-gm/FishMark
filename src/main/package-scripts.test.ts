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

  it("defines a dedicated dev entry for the test workbench mode", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["dev:test-workbench"]).toContain("npm:dev:electron:test-workbench");
    expect(packageJson.scripts?.["dev:test-workbench"]).toContain("npm:dev:renderer:test-workbench");
    expect(packageJson.scripts?.["dev:renderer:test-workbench"]).toContain("--port 5174");
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).toContain(
      "YULORA_START_MODE=test-workbench"
    );
    expect(packageJson.scripts?.["dev:electron:test-workbench"]).toContain(
      "VITE_DEV_SERVER_URL=http://localhost:5174"
    );
  });

  it("lets vite derive the dev port from the environment", () => {
    const viteConfigPath = path.join(process.cwd(), "vite.config.ts");
    const viteConfigSource = readFileSync(viteConfigPath, "utf8");

    expect(viteConfigSource).toContain("YULORA_DEV_SERVER_PORT");
  });

  it("does not import local shared modules from the preload source", () => {
    const preloadPath = path.join(process.cwd(), "src", "preload", "preload.ts");
    const preloadSource = readFileSync(preloadPath, "utf8");

    expect(preloadSource).not.toContain("from \"./");
    expect(preloadSource).not.toContain("from './");
    expect(preloadSource).not.toContain("from \"../");
    expect(preloadSource).not.toContain("from '../");
  });
});
