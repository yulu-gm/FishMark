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
});
