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
          scene: "rain-scene",
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

  it("normalizes image channel 0 path to an absolute path inside package root", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: {},
        layout: { titlebar: "./layout/titlebar.json" },
        scene: { id: "rain-scene", sharedUniforms: {} },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "./shaders/workbench-background.glsl",
            channels: {
              "0": {
                type: "image",
                src: "./images/backdrop.png"
              }
            }
          }
        }
      },
      "/tmp/rain-glass"
    );

    expect(manifest).toMatchObject({
      surfaces: {
        workbenchBackground: {
          channels: {
            "0": {
              type: "image",
              src: "/tmp/rain-glass/images/backdrop.png"
            }
          }
        }
      }
    });
  });

  it("drops unsupported channels and unsupported channel slots", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: {},
        layout: { titlebar: "./layout/titlebar.json" },
        scene: { id: "rain-scene", sharedUniforms: {} },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "./shaders/workbench-background.glsl",
            channels: {
              "0": {
                type: "video",
                src: "./images/movie.mp4"
              },
              "1": {
                type: "image",
                src: "./images/other.png"
              }
            } as unknown as Record<string, unknown>
          }
        }
      },
      "/tmp/rain-glass"
    );

    expect(manifest?.surfaces?.workbenchBackground?.channels).toBeUndefined();
  });

  it("accepts CSS-only parameters without shader uniforms", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: false, dark: true },
        styles: {},
        layout: { titlebar: null },
        scene: { id: "rain-scene", sharedUniforms: { rainAmount: 0.72 } },
        parameters: [
          {
            id: "workspaceGlassOpacity",
            label: "Workspace Glass",
            type: "slider",
            min: 0,
            max: 1,
            step: 0.05,
            default: 0.24
          },
          {
            id: "rainAmount",
            label: "Rain Amount",
            type: "slider",
            min: 0,
            max: 1,
            step: 0.05,
            default: 0.72,
            uniform: "rainAmount"
          }
        ]
      },
      "/tmp/rain-glass"
    );

    expect(manifest?.parameters).toEqual([
      {
        id: "workspaceGlassOpacity",
        label: "Workspace Glass",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.24
      },
      {
        id: "rainAmount",
        label: "Rain Amount",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.72,
        uniform: "rainAmount"
      }
    ]);
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
