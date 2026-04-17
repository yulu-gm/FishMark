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
});
