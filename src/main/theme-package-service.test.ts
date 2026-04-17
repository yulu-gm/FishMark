import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createThemePackageService } from "./theme-package-service";

describe("createThemePackageService", () => {
  it("discovers manifest-driven theme packages and legacy CSS families together", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "rain-glass", "styles"), { recursive: true });
    await writeFile(
      path.join(userDataDir, "themes", "rain-glass", "manifest.json"),
      JSON.stringify({
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      }),
      "utf8"
    );
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "styles", "ui.css"), "/* ui */");
    await mkdir(path.join(userDataDir, "themes", "graphite", "dark"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "ui.css"), "/* legacy */");

    const service = createThemePackageService({ userDataDir });
    const packages = await service.listThemePackages();

    expect(packages.map((entry) => entry.id)).toEqual(["graphite", "rain-glass"]);
    expect(packages.find((entry) => entry.id === "rain-glass")?.manifest.name).toBe("Rain Glass");
    expect(packages.find((entry) => entry.id === "graphite")?.kind).toBe("legacy-css-family");

    await rm(root, { recursive: true, force: true });
  });

  it("skips malformed manifest packages instead of treating them as legacy families", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-invalid-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "broken-manifest", "light"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "broken-manifest", "manifest.json"), "{", "utf8");
    await writeFile(path.join(userDataDir, "themes", "broken-manifest", "light", "ui.css"), "/* ui */");
    await mkdir(path.join(userDataDir, "themes", "graphite", "dark"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "ui.css"), "/* legacy */");

    const service = createThemePackageService({ userDataDir });
    const packages = await service.listThemePackages();

    expect(packages.map((entry) => entry.id)).toEqual(["graphite"]);
    expect(packages.some((entry) => entry.id === "broken-manifest")).toBe(false);

    await rm(root, { recursive: true, force: true });
  });

  it("maps legacy css files into usable manifest asset paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-legacy-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "graphite", "light"), { recursive: true });
    await mkdir(path.join(userDataDir, "themes", "graphite", "dark"), { recursive: true });

    await writeFile(path.join(userDataDir, "themes", "graphite", "light", "tokens.css"), "/* light tokens */");
    await writeFile(path.join(userDataDir, "themes", "graphite", "light", "ui.css"), "/* light ui */");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "tokens.css"), "/* dark tokens */");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "editor.css"), "/* dark editor */");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "markdown.css"), "/* dark markdown */");

    const service = createThemePackageService({ userDataDir });
    const [theme] = await service.listThemePackages();

    expect(theme).toMatchObject({
      id: "graphite",
      kind: "legacy-css-family",
      manifest: {
        supports: { light: true, dark: true },
        tokens: {
          light: path.join(userDataDir, "themes", "graphite", "light", "tokens.css"),
          dark: path.join(userDataDir, "themes", "graphite", "dark", "tokens.css")
        },
        styles: {
          ui: path.join(userDataDir, "themes", "graphite", "light", "ui.css"),
          editor: path.join(userDataDir, "themes", "graphite", "dark", "editor.css"),
          markdown: path.join(userDataDir, "themes", "graphite", "dark", "markdown.css")
        }
      }
    });

    await rm(root, { recursive: true, force: true });
  });

  it("keeps cached results until refreshThemePackages() is called", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-cache-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "paper", "light"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "paper", "light", "ui.css"), "/* paper ui */");

    const service = createThemePackageService({ userDataDir });
    const firstList = await service.listThemePackages();

    await mkdir(path.join(userDataDir, "themes", "graphite", "dark"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "ui.css"), "/* graphite ui */");

    const secondList = await service.listThemePackages();
    const refreshedList = await service.refreshThemePackages();

    expect(firstList.map((entry) => entry.id)).toEqual(["paper"]);
    expect(secondList.map((entry) => entry.id)).toEqual(["paper"]);
    expect(refreshedList.map((entry) => entry.id)).toEqual(["graphite", "paper"]);

    await rm(root, { recursive: true, force: true });
  });
});
