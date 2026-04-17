import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createThemeService } from "./theme-service";
import { createPreviewAssetUrl, PREVIEW_ASSET_PROTOCOL } from "../shared/preview-asset-url";

function createThemeVariantDir(
  basePath: string,
  themeFamilyId: string,
  mode: "light" | "dark",
  files: string[] = []
): Promise<void> {
  return mkdir(path.join(basePath, themeFamilyId, mode), { recursive: true }).then(async () => {
    await Promise.all(
      files.map((fileName) =>
        writeFile(
          path.join(basePath, themeFamilyId, mode, fileName),
          "/* theme asset */",
          "utf8"
        )
      )
    );
  });
}

describe("createThemeService", () => {
  it("discovers community theme families with partial mode variants", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-"));
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });

    await createThemeVariantDir(path.join(userDataDir, "themes"), "graphite", "light", [
      "tokens.css",
      "ui.css",
      "markdown.css"
    ]);
    await createThemeVariantDir(path.join(userDataDir, "themes"), "graphite", "dark", [
      "tokens.css",
      "ui.css",
      "editor.css",
      "markdown.css"
    ]);
    await createThemeVariantDir(path.join(userDataDir, "themes"), "paper", "light", ["tokens.css"]);
    await mkdir(path.join(userDataDir, "themes", "empty-family"), { recursive: true });
    await mkdir(path.join(userDataDir, "themes", "sepia", "dark"), { recursive: true });

    const service = createThemeService({ userDataDir });
    const themes = await service.listThemes();
    const graphiteLightDirectory = path.join(userDataDir, "themes", "graphite", "light");
    const graphiteDarkDirectory = path.join(userDataDir, "themes", "graphite", "dark");
    const paperLightDirectory = path.join(userDataDir, "themes", "paper", "light");

    expect(themes).toEqual([
      {
        id: "graphite",
        source: "community",
        name: "Graphite",
        directoryName: "graphite",
        modes: {
          light: {
            available: true,
            availableParts: {
              tokens: true,
              ui: true,
              editor: false,
              markdown: true
            },
            partUrls: {
              tokens: createPreviewAssetUrl(path.join(graphiteLightDirectory, "tokens.css")),
              ui: createPreviewAssetUrl(path.join(graphiteLightDirectory, "ui.css")),
              markdown: createPreviewAssetUrl(path.join(graphiteLightDirectory, "markdown.css"))
            }
          },
          dark: {
            available: true,
            availableParts: {
              tokens: true,
              ui: true,
              editor: true,
              markdown: true
            },
            partUrls: {
              tokens: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "tokens.css")),
              ui: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "ui.css")),
              editor: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "editor.css")),
              markdown: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "markdown.css"))
            }
          }
        },
      },
      {
        id: "paper",
        source: "community",
        name: "Paper",
        directoryName: "paper",
        modes: {
          light: {
            available: true,
            availableParts: {
              tokens: true,
              ui: false,
              editor: false,
              markdown: false
            },
            partUrls: {
              tokens: createPreviewAssetUrl(path.join(paperLightDirectory, "tokens.css"))
            }
          },
          dark: {
            available: false,
            availableParts: {
              tokens: false,
              ui: false,
              editor: false,
              markdown: false
            },
            partUrls: {}
          }
        }
      }
    ]);

    expect(themes[0]?.modes.light.partUrls.tokens).toMatch(
      new RegExp(`^${PREVIEW_ASSET_PROTOCOL}://`)
    );
    expect(themes[0]?.modes.dark.partUrls.tokens).toMatch(
      new RegExp(`^${PREVIEW_ASSET_PROTOCOL}://`)
    );
    expect(themes[1]?.modes.light.partUrls.tokens).toMatch(
      new RegExp(`^${PREVIEW_ASSET_PROTOCOL}://`)
    );

    expect(themes.some((theme) => theme.directoryName === "empty-family")).toBe(false);
    expect(themes.some((theme) => theme.directoryName === "sepia")).toBe(false);
    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("returns cached themes until refreshThemes() is called", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-refresh-"));
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });

    await createThemeVariantDir(path.join(userDataDir, "themes"), "paper", "light", ["tokens.css"]);
    const service = createThemeService({ userDataDir });

    const firstList = await service.listThemes();
    await createThemeVariantDir(path.join(userDataDir, "themes"), "graphite", "dark", [
      "editor.css"
    ]);

    const secondList = await service.listThemes();
    const refreshedList = await service.refreshThemes();

    expect(firstList).toHaveLength(1);
    expect(secondList).toHaveLength(1);
    expect(secondList[0]).toMatchObject({ directoryName: "paper" });
    expect(refreshedList).toHaveLength(2);
    expect(refreshedList.map((theme) => theme.directoryName)).toContain("graphite");

    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("keeps file-part metadata per theme family mode", async () => {
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "yulora-theme-service-parts-"));
    const userDataDir = path.join(rootDirectory, "userdata");
    await mkdir(path.join(userDataDir, "themes"), { recursive: true });
    await createThemeVariantDir(path.join(userDataDir, "themes"), "graphite", "dark", [
      "editor.css",
      "markdown.css"
    ]);

    const service = createThemeService({ userDataDir });
    const [theme] = await service.listThemes();
    expect(theme).toBeDefined();
    const resolvedTheme = theme!;
    const graphiteDarkDirectory = path.join(userDataDir, "themes", "graphite", "dark");
    const themeParts = resolvedTheme.modes.dark.availableParts;

    expect(themeParts).toEqual({
      tokens: false,
      ui: false,
      editor: true,
      markdown: true
    });
    expect(resolvedTheme.modes.dark.partUrls).toEqual({
      editor: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "editor.css")),
      markdown: createPreviewAssetUrl(path.join(graphiteDarkDirectory, "markdown.css"))
    });
    expect(resolvedTheme.modes.dark.partUrls.editor).toMatch(
      new RegExp(`^${PREVIEW_ASSET_PROTOCOL}://`)
    );
    expect(resolvedTheme.modes.dark.partUrls.markdown).toMatch(
      new RegExp(`^${PREVIEW_ASSET_PROTOCOL}://`)
    );
    expect(resolvedTheme.modes.light).toEqual({
      available: false,
      availableParts: {
        tokens: false,
        ui: false,
        editor: false,
        markdown: false
      },
      partUrls: {}
    });
    await rm(rootDirectory, { recursive: true, force: true });
  });
});
