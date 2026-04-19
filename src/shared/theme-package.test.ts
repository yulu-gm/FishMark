import { describe, expect, it } from "vitest";

import {
  normalizeThemePackageManifest,
  type ThemePackageManifest
} from "./theme-package";
import {
  THEME_RUNTIME_ENV_CSS_VARS,
  THEME_RUNTIME_THEME_MODE_ATTRIBUTE,
  THEME_SEMANTIC_STYLE_SLOTS
} from "./theme-style-contract";

describe("normalizeThemePackageManifest", () => {
  it("accepts manifest contract version 2 and exposes the formal style contract constants", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        contractVersion: 2,
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );

    expect(manifest).toMatchObject<Partial<ThemePackageManifest>>({
      id: "rain-glass",
      contractVersion: 2,
      styles: {
        ui: "/tmp/rain-glass/styles/ui.css"
      }
    });
    expect(THEME_SEMANTIC_STYLE_SLOTS).toContain("markdown.table.border");
    expect(THEME_RUNTIME_ENV_CSS_VARS.wordCount).toBe("--yulora-env-word-count");
    expect(THEME_RUNTIME_THEME_MODE_ATTRIBUTE).toBe("data-yulora-theme-mode");
  });

  it("rejects manifests with missing or unsupported contract versions", () => {
    const missingContractVersion = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );
    const unsupportedContractVersion = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        contractVersion: 1,
        name: "Rain Glass",
        version: "1.0.0",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );

    expect(missingContractVersion).toBeNull();
    expect(unsupportedContractVersion).toBeNull();
  });

  it("keeps supported style, layout, and surface paths inside the package root", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        contractVersion: 2,
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
        contractVersion: 2,
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
        contractVersion: 2,
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
        contractVersion: 2,
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
        contractVersion: 2,
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
        contractVersion: 2,
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

  it("normalizes scene-level render defaults for shader surfaces", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "ember-ascend",
        contractVersion: 2,
        name: "Ember Ascend",
        version: "1.0.0",
        supports: { light: false, dark: true },
        styles: {},
        layout: { titlebar: null },
        scene: {
          id: "ascend-scene",
          sharedUniforms: { glowStrength: 2.0 },
          render: {
            renderScale: 0.75,
            frameRate: 24
          }
        },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "ascend-scene",
            shader: "./shaders/workbench-background.glsl"
          }
        }
      },
      "/tmp/ember-ascend"
    );

    expect(manifest?.scene).toMatchObject({
      id: "ascend-scene",
      sharedUniforms: { glowStrength: 2.0 },
      render: {
        renderScale: 0.75,
        frameRate: 24
      }
    });
  });

  it("normalizes surface-level render overrides independently from scene defaults", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "dual-surface",
        contractVersion: 2,
        name: "Dual Surface",
        version: "1.0.0",
        supports: { light: false, dark: true },
        styles: {},
        layout: { titlebar: null },
        scene: {
          id: "dual-scene",
          sharedUniforms: {},
          render: {
            renderScale: 0.8,
            frameRate: 30
          }
        },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "dual-scene",
            shader: "./shaders/workbench-background.glsl",
            render: {
              renderScale: 0.6,
              frameRate: 18
            }
          }
        }
      },
      "/tmp/dual-surface"
    );

    expect(manifest?.surfaces?.workbenchBackground).toMatchObject({
      kind: "fragment",
      scene: "dual-scene",
      shader: "/tmp/dual-surface/shaders/workbench-background.glsl",
      render: {
        renderScale: 0.6,
        frameRate: 18
      }
    });
    expect(manifest?.scene?.render).toEqual({
      renderScale: 0.8,
      frameRate: 30
    });
  });

  it("drops invalid render settings instead of preserving unsafe values", () => {
    const manifest = normalizeThemePackageManifest(
      {
        id: "bad-render",
        contractVersion: 2,
        name: "Bad Render",
        version: "1.0.0",
        supports: { light: false, dark: true },
        styles: {},
        layout: { titlebar: null },
        scene: {
          id: "bad-scene",
          sharedUniforms: {},
          render: {
            renderScale: 0,
            frameRate: Number.NaN
          }
        },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "bad-scene",
            shader: "./shaders/workbench-background.glsl",
            render: {
              renderScale: 1.2,
              frameRate: -12
            }
          }
        }
      },
      "/tmp/bad-render"
    );

    expect(manifest?.scene?.render).toBeUndefined();
    expect(manifest?.surfaces?.workbenchBackground?.render).toBeUndefined();
  });

  it("returns null when id or name is whitespace-only", () => {
    const manifestByBlankId = normalizeThemePackageManifest(
      {
        id: "   ",
        contractVersion: 2,
        name: "Win Theme",
        supports: { light: true, dark: true },
        styles: { ui: "./styles/ui.css" }
      },
      "/tmp/rain-glass"
    );
    const manifestByBlankName = normalizeThemePackageManifest(
      {
        id: "rain-glass",
        contractVersion: 2,
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
