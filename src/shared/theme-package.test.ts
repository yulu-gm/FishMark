import { describe, expect, it } from "vitest";

import {
  normalizeThemePackageManifest,
  type ThemePackageManifest
} from "./theme-package";

describe("normalizeThemePackageManifest", () => {
  it("keeps supported style, layout, and surface paths inside the package root", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css", titlebar: "./styles/titlebar.css" },
        layout: { titlebar: "./layout/titlebar.json" },
        scene: { id: "rain-scene", sharedUniforms: { rainAmount: 0.7 } },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "./shaders/workbench-background.glsl"
          }
        }
      },
      "/tmp/rain-glass"
    );

    expect(manifest).toMatchObject<Partial<ThemePackageManifest>>({
      id: "rain-glass",
      styles: {
        ui: "/tmp/rain-glass/styles/ui.css",
        titlebar: "/tmp/rain-glass/styles/titlebar.css"
      },
      layout: {
        titlebar: "/tmp/rain-glass/layout/titlebar.json"
      },
      surfaces: {
        workbenchBackground: {
          kind: "fragment",
          shader: "/tmp/rain-glass/shaders/workbench-background.glsl"
        }
      }
    });
  });

  it("drops paths that escape the package root", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        supports: { light: true, dark: true },
        styles: { ui: "../../outside/ui.css", editor: "../up/editor.css", titlebar: "/etc/escape.css" },
        layout: { titlebar: "../../outside/layout.json" },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "../../outside/workbench.glsl"
          },
          titlebarBackdrop: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "/etc/titlebar-backdrop.glsl"
          }
        },
        scene: { id: "rain-scene", sharedUniforms: {} }
      },
      "/tmp/rain-glass"
    );

    expect(manifest?.styles).toEqual({});
    expect(manifest?.layout?.titlebar).toBeNull();
    expect(manifest?.surfaces).toEqual({});
  });

  it("preserves Windows absolute paths inside the package root", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "win-theme",
        name: "Win Theme",
        supports: { light: true, dark: true },
        styles: { ui: "C:/themes/win-theme/styles/ui.css" },
        layout: { titlebar: "C:/themes/win-theme/layout/titlebar.json" },
        scene: { id: "win-scene", sharedUniforms: {} },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "win-scene",
            shader: "C:/themes/win-theme/shaders/workbench-background.glsl"
          }
        }
      },
      "C:/themes/win-theme"
    );

    expect(manifest).toMatchObject({
      styles: { ui: "C:/themes/win-theme/styles/ui.css" },
      layout: { titlebar: "C:/themes/win-theme/layout/titlebar.json" },
      surfaces: {
        workbenchBackground: {
          shader: "C:/themes/win-theme/shaders/workbench-background.glsl"
        }
      }
    });
  });

  it("returns null when id or name is whitespace-only", () => {
    const manifestByBlankId = normalizeThemePackageManifest(
      {
        id: "   ",
        name: "Win Theme",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );
    const manifestByBlankName = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "\t\n",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );

    expect(manifestByBlankId).toBeNull();
    expect(manifestByBlankName).toBeNull();
  });
});
