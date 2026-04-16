import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createThemeService } from "./theme-service";

type ThemeSource = "builtin" | "community";

function getAvailableParts(
  theme: {
    source: ThemeSource;
    directoryName: string;
    availableParts: {
      tokens: boolean;
      ui: boolean;
      editor: boolean;
      markdown: boolean;
    };
  }
) {
  return theme.availableParts;
}

function createThemeDir(
  basePath: string,
  themeName: string,
  files: string[] = []
): Promise<void> {
  return mkdir(path.join(basePath, themeName), { recursive: true }).then(async () => {
    await Promise.all(
      files.map((fileName) =>
        writeFile(path.join(basePath, themeName, fileName), "/* theme asset */", "utf8")
      )
    );
  });
}

describe("createThemeService", () => {
  it("discovers builtin and community themes with partial parts", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-"));
    const builtinThemesDir = path.join(rootDirectory, "src", "renderer", "styles", "themes");
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(builtinThemesDir, { recursive: true });
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });

    await createThemeDir(path.join(builtinThemesDir), "default-light", [
      "tokens.css",
      "ui.css"
    ]);
    await createThemeDir(path.join(builtinThemesDir), "empty-theme");
    await createThemeDir(path.join(userDataDir, "themes"), "graphite-dark", [
      "ui.css",
      "editor.css",
      "markdown.css"
    ]);
    await createThemeDir(path.join(userDataDir, "themes"), "no-css");

    const service = createThemeService({ builtinThemesDir, userDataDir });
    const themes = await service.listThemes();

    expect(themes).toEqual([
      {
        id: "default-light",
        source: "builtin",
        name: "Default Light",
        directoryName: "default-light",
        availableParts: {
          tokens: true,
          ui: true,
          editor: false,
          markdown: false
        },
        partUrls: {
          tokens: expect.stringContaining("/default-light/tokens.css"),
          ui: expect.stringContaining("/default-light/ui.css")
        }
      },
      {
        id: "graphite-dark",
        source: "community",
        name: "Graphite Dark",
        directoryName: "graphite-dark",
        availableParts: {
          tokens: false,
          ui: true,
          editor: true,
          markdown: true
        },
        partUrls: {
          ui: expect.stringContaining("/graphite-dark/ui.css"),
          editor: expect.stringContaining("/graphite-dark/editor.css"),
          markdown: expect.stringContaining("/graphite-dark/markdown.css")
        }
      }
    ]);

    const noCssTheme = themes.some((theme) => theme.directoryName === "empty-theme");
    expect(noCssTheme).toBe(false);
    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("returns cached themes until refreshThemes() is called", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-refresh-"));
    const builtinThemesDir = path.join(rootDirectory, "src", "renderer", "styles", "themes");
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });

    await createThemeDir(builtinThemesDir, "default-light", ["tokens.css"]);
    const service = createThemeService({ builtinThemesDir, userDataDir });

    const firstList = await service.listThemes();
    await createThemeDir(path.join(userDataDir, "themes"), "no-ui", ["editor.css"]);

    const secondList = await service.listThemes();
    const refreshedList = await service.refreshThemes();

    expect(firstList).toHaveLength(1);
    expect(secondList).toHaveLength(1);
    expect(secondList[0]).toMatchObject({ directoryName: "default-light" });
    expect(refreshedList).toHaveLength(2);
    expect(refreshedList.map((theme) => theme.directoryName)).toContain("no-ui");

    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("keeps file-part metadata per theme directory", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-parts-"));
    const builtinThemesDir = path.join(rootDirectory, "src", "renderer", "styles", "themes");
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });
    await createThemeDir(builtinThemesDir, "default-dark", [
      "tokens.css",
      "editor.css",
      "markdown.css"
    ]);

    const service = createThemeService({ builtinThemesDir, userDataDir });
    const [theme] = await service.listThemes();
    expect(theme).toBeDefined();
    const resolvedTheme = theme!;
    const themeParts = getAvailableParts(resolvedTheme);

    expect(themeParts).toEqual({
      tokens: true,
      ui: false,
      editor: true,
      markdown: true
    });
    expect(resolvedTheme.partUrls).toEqual({
      tokens: expect.stringContaining("/default-dark/tokens.css"),
      editor: expect.stringContaining("/default-dark/editor.css"),
      markdown: expect.stringContaining("/default-dark/markdown.css")
    });
    await rm(rootDirectory, { recursive: true, force: true });
  });
});
