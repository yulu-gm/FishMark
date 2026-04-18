// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeSurfaceHost } from "./ThemeSurfaceHost";

const themeSurfaceRuntimeMock = vi.hoisted(() => ({
  mount: vi.fn(
    async ({
      shaderSource
    }: {
      shaderSource: string;
      sceneState?: unknown;
    }) => ({
      mode: shaderSource.includes("broken") ? ("fallback" as const) : ("full" as const),
      unmount: vi.fn()
    })
  )
}));

vi.mock("../shader/theme-surface-runtime", () => ({
  createThemeSurfaceRuntime: () => ({
    mount: themeSurfaceRuntimeMock.mount
  })
}));

describe("ThemeSurfaceHost", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        return {
          ok: true,
          text: async () =>
            url.includes("broken") ? "void main() { broken; }" : "void main() { gl_FragColor = vec4(1.0); }"
        } as Response;
      })
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
    vi.unstubAllGlobals();
    themeSurfaceRuntimeMock.mount.mockClear();
  });

  it("keeps runtime mode callbacks stable across unmount and remount churn", async () => {
    const runtimeModeChanges: Array<string> = [];

    const element = createElement(ThemeSurfaceHost, {
      surface: "workbenchBackground",
      descriptor: {
        kind: "fragment",
        sceneId: "rain-scene",
        shaderUrl: "file:///themes/rain-glass/shaders/broken-workbench.glsl",
        sharedUniforms: {}
      },
      themeMode: "dark",
      effectsMode: "auto",
      onRuntimeModeChange: (mode) => {
        runtimeModeChanges.push(mode);
      }
    });

    await act(async () => {
      root.render(element);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(null);
      await Promise.resolve();
    });

    await act(async () => {
      root.render(element);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtimeModeChanges).toEqual(["fallback", "fallback"]);
  });

  it("passes image channel descriptors through to runtime mount", async () => {
    await act(async () => {
      root.render(
        createElement(ThemeSurfaceHost, {
          surface: "workbenchBackground",
          descriptor: {
            kind: "fragment",
            sceneId: "rain-scene",
            shaderUrl: "file:///themes/rain-glass/shaders/workbench.glsl",
            channels: {
              "0": {
                type: "image",
                src: "file:///themes/rain-glass/textures/noise.png"
              }
            },
            sharedUniforms: {
              rainAmount: 0.8
            }
          },
          themeMode: "dark",
          effectsMode: "auto"
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(themeSurfaceRuntimeMock.mount).toHaveBeenCalledTimes(1);
    expect(themeSurfaceRuntimeMock.mount.mock.calls[0]?.[0]).toMatchObject({
      channels: {
        "0": {
          type: "image",
          src: "file:///themes/rain-glass/textures/noise.png"
        }
      }
    });
  });

  it("passes resolved render settings through to runtime mount", async () => {
    await act(async () => {
      root.render(
        createElement(ThemeSurfaceHost, {
          surface: "workbenchBackground",
          descriptor: {
            kind: "fragment",
            sceneId: "ember-scene",
            shaderUrl: "file:///themes/ember-ascend/shaders/workbench.glsl",
            renderSettings: {
              scene: {
                renderScale: 0.75,
                frameRate: 24
              },
              surface: {
                renderScale: 0.65
              }
            },
            sharedUniforms: {}
          },
          themeMode: "dark",
          effectsMode: "full"
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(themeSurfaceRuntimeMock.mount).toHaveBeenCalledTimes(1);
    expect(themeSurfaceRuntimeMock.mount.mock.calls[0]?.[0]).toMatchObject({
      renderSettings: {
        scene: {
          renderScale: 0.75,
          frameRate: 24
        },
        surface: {
          renderScale: 0.65
        }
      }
    });
  });

  it("bridges the resolved theme mode into the scene uniforms sent to runtime", async () => {
    await act(async () => {
      root.render(
        createElement(ThemeSurfaceHost, {
          surface: "workbenchBackground",
          descriptor: {
            kind: "fragment",
            sceneId: "pearl-scene",
            shaderUrl: "file:///themes/pearl-drift/shaders/workbench.glsl",
            sharedUniforms: {
              iridescence: 0.9
            }
          },
          themeMode: "light",
          effectsMode: "auto"
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const runtimeInput = themeSurfaceRuntimeMock.mount.mock.calls[0]?.[0] as
      | {
          sceneState: {
            nextFrame: (
              surface: "workbenchBackground",
              viewport: { width: number; height: number }
            ) => { uniforms: Record<string, number> };
          };
        }
      | undefined;
    expect(runtimeInput).toBeDefined();
    expect(
      runtimeInput?.sceneState.nextFrame("workbenchBackground", { width: 320, height: 200 }).uniforms
    ).toMatchObject({
      iridescence: 0.9,
      themeMode: 0
    });
  });
});
