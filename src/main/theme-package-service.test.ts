import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createThemePackageService,
  resolveBuiltinThemePackagesDir
} from "./theme-package-service";

describe("createThemePackageService", () => {
  it("resolves packaged builtin themes from the built dist payload", () => {
    const moduleDir = path.join(
      path.parse(process.cwd()).root,
      "Applications",
      "Yulora",
      "resources",
      "app.asar",
      "dist-electron",
      "main"
    );

    expect(resolveBuiltinThemePackagesDir({ isPackaged: true, moduleDir })).toBe(
      path.join(
        path.parse(process.cwd()).root,
        "Applications",
        "Yulora",
        "resources",
        "app.asar",
        "dist",
        "theme-packages"
      )
    );
  });

  it("ignores legacy css-family directories without a manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "graphite", "light"), { recursive: true });
    await mkdir(path.join(userDataDir, "themes", "graphite", "dark"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "graphite", "light", "tokens.css"), "/* light tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "light", "ui.css"), "/* light ui */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "tokens.css"), "/* dark tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "editor.css"), "/* dark editor */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "dark", "markdown.css"), "/* dark markdown */", "utf8");

    const service = createThemePackageService({ userDataDir });
    const packages = await service.listThemePackages();

    expect(packages.some((entry) => entry.id === "graphite")).toBe(false);

    await rm(root, { recursive: true, force: true });
  });

  it("skips malformed manifests and does not surface invalid packages", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-invalid-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "broken-manifest", "light"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "broken-manifest", "manifest.json"), "{", "utf8");
    await writeFile(path.join(userDataDir, "themes", "broken-manifest", "light", "ui.css"), "/* ui */");

    await mkdir(path.join(userDataDir, "themes", "rain-glass"), { recursive: true });
    await writeFile(
      path.join(userDataDir, "themes", "rain-glass", "manifest.json"),
      JSON.stringify({
        id: "rain-glass",
        contractVersion: 2,
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        tokens: { light: "./tokens.css", dark: "./tokens-dark.css" },
        styles: {
          ui: "./ui.css",
          editor: "./editor.css",
          markdown: "./markdown.css"
        }
      }),
      "utf8"
    );
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "tokens.css"), "/* tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "tokens-dark.css"), "/* tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "ui.css"), "/* ui */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "editor.css"), "/* editor */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "markdown.css"), "/* markdown */", "utf8");

    const service = createThemePackageService({ userDataDir });
    const packages = await service.listThemePackages();

    expect(packages.some((entry) => entry.id === "broken-manifest")).toBe(false);
    expect(packages.some((entry) => entry.id === "rain-glass")).toBe(true);
    expect(packages.find((entry) => entry.id === "rain-glass")).toMatchObject({
      manifest: {
        contractVersion: 2
      }
    });

    await rm(root, { recursive: true, force: true });
  });

  it("maps manifest package asset paths for a valid manifest package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-legacy-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "rain-glass"), { recursive: true });
    await writeFile(
      path.join(userDataDir, "themes", "rain-glass", "manifest.json"),
      JSON.stringify({
        id: "rain-glass",
        contractVersion: 2,
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        tokens: {
          light: "./tokens/light.css",
          dark: "./tokens/dark.css"
        },
        styles: {
          ui: "./styles/ui.css",
          editor: "./styles/editor.css",
          markdown: "./styles/markdown.css"
        }
      }),
      "utf8"
    );
    await mkdir(path.join(userDataDir, "themes", "rain-glass", "tokens"), { recursive: true });
    await mkdir(path.join(userDataDir, "themes", "rain-glass", "styles"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "tokens", "light.css"), "/* light tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "tokens", "dark.css"), "/* dark tokens */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "styles", "ui.css"), "/* ui */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "styles", "editor.css"), "/* editor */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "rain-glass", "styles", "markdown.css"), "/* markdown */", "utf8");

    const service = createThemePackageService({ userDataDir });
    const packageEntry = (await service.listThemePackages()).find((entry) => entry.id === "rain-glass");
    expect(packageEntry).toBeDefined();

    expect(packageEntry).toMatchObject({
      id: "rain-glass",
      kind: "manifest-package",
      manifest: {
        contractVersion: 2,
        supports: { light: true, dark: true },
        tokens: {
          light: expect.stringContaining(path.posix.join("themes", "rain-glass", "tokens", "light.css")),
          dark: expect.stringContaining(path.posix.join("themes", "rain-glass", "tokens", "dark.css"))
        },
        styles: {
          ui: expect.stringContaining(path.posix.join("themes", "rain-glass", "styles", "ui.css")),
          editor: expect.stringContaining(path.posix.join("themes", "rain-glass", "styles", "editor.css")),
          markdown: expect.stringContaining(path.posix.join("themes", "rain-glass", "styles", "markdown.css"))
        }
      }
    });

    await rm(root, { recursive: true, force: true });
  });

  it("keeps cached results until refreshThemePackages() is called", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-cache-"));
    const userDataDir = path.join(root, "userdata");
    await mkdir(path.join(userDataDir, "themes", "paper"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "paper", "manifest.json"), JSON.stringify({
      id: "paper",
      contractVersion: 2,
      name: "Paper",
      version: "1.0.0",
      supports: { light: true, dark: true },
      tokens: { light: "./tokens-light.css", dark: "./tokens-dark.css" },
      styles: {
        ui: "./ui.css",
        editor: "./editor.css",
        markdown: "./markdown.css"
      }
    }));
    await writeFile(path.join(userDataDir, "themes", "paper", "tokens-light.css"), "/* paper */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "paper", "tokens-dark.css"), "/* paper */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "paper", "ui.css"), "/* paper ui */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "paper", "editor.css"), "/* paper editor */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "paper", "markdown.css"), "/* paper markdown */", "utf8");

    const service = createThemePackageService({ userDataDir });
    const firstList = await service.listThemePackages();

    await mkdir(path.join(userDataDir, "themes", "graphite"), { recursive: true });
    await writeFile(path.join(userDataDir, "themes", "graphite", "manifest.json"), JSON.stringify({
      id: "graphite",
      contractVersion: 2,
      name: "Graphite",
      version: "1.0.0",
      supports: { light: true, dark: true },
      tokens: { light: "./tokens-light.css", dark: "./tokens-dark.css" },
      styles: {
        ui: "./ui.css",
        editor: "./editor.css",
        markdown: "./markdown.css"
      }
    }));
    await writeFile(path.join(userDataDir, "themes", "graphite", "tokens-light.css"), "/* graphite */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "tokens-dark.css"), "/* graphite */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "ui.css"), "/* graphite ui */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "editor.css"), "/* graphite editor */", "utf8");
    await writeFile(path.join(userDataDir, "themes", "graphite", "markdown.css"), "/* graphite markdown */", "utf8");

    const secondList = await service.listThemePackages();
    const refreshedList = await service.refreshThemePackages();

    expect(firstList.map((entry) => entry.id)).toEqual(["default", "paper"]);
    expect(secondList.map((entry) => entry.id)).toEqual(["default", "paper"]);
    expect(new Set(refreshedList.map((entry) => entry.id))).toEqual(
      new Set(["default", "paper", "graphite"])
    );

    await rm(root, { recursive: true, force: true });
  });

  it("always includes the builtin default manifest package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "yulora-theme-packages-default-"));
    const userDataDir = path.join(root, "userdata");

    const service = createThemePackageService({ userDataDir });
    const packages = await service.listThemePackages();
    const defaultPackage = packages.find((entry) => entry.id === "default");

    expect(defaultPackage).toMatchObject({
      id: "default",
      source: "builtin",
      kind: "manifest-package",
      manifest: {
        contractVersion: 2
      }
    });

    await rm(root, { recursive: true, force: true });
  });
});
