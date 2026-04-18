// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createThemeSceneState } from "./theme-scene-state";
import { buildFragmentShaderSource, createThemeSurfaceRuntime } from "./theme-surface-runtime";

type TestCanvas = HTMLCanvasElement & {
  __setSize: (width: number, height: number) => void;
};

function createCanvas(width = 640, height = 360): TestCanvas {
  const canvas = document.createElement("canvas");
  let currentWidth = width;
  let currentHeight = height;

  Object.defineProperty(canvas, "clientWidth", {
    configurable: true,
    get: () => currentWidth
  });
  Object.defineProperty(canvas, "clientHeight", {
    configurable: true,
    get: () => currentHeight
  });

  canvas.getBoundingClientRect = () =>
    ({
      width: currentWidth,
      height: currentHeight,
      top: 0,
      left: 0,
      right: currentWidth,
      bottom: currentHeight,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;

  return Object.assign(canvas, {
    __setSize(width: number, height: number) {
      currentWidth = width;
      currentHeight = height;
    }
  });
}

describe("theme surface runtime", () => {
  it("keeps the rain-glass workbench shader sampling an upright scene with reference-style refractive drops", () => {
    const shader = readFileSync(
      path.join(process.cwd(), "fixtures/themes/rain-glass/shaders/workbench-background.glsl"),
      "utf8"
    );

    // Scene UV flip so the iChannel0 upload reads upright.
    expect(shader).toMatch(/return\s+vec2\(uv\.x,\s*1\.0\s*-\s*uv\.y\)\s*;/u);
    // Reference drop shape: teardrop via length((st-p)*a.yx) with a = vec2(6,1).
    expect(shader).toMatch(/vec2\s+a\s*=\s*vec2\(6\.0\s*,\s*1\.0\)\s*;/u);
    expect(shader).toMatch(/length\(\(st\s*-\s*p\)\s*\*\s*a\.yx\)/u);
    // Second drop layer zoomed at 1.85x (reference value) to separate near/far drops.
    expect(shader).toMatch(/DropLayer2\(\s*uv\s*\*\s*1\.85\s*,/u);
    // Dense static micro-droplets at uv *= 40.0 (reference value, not 24/26).
    expect(shader).toMatch(/uv\s*\*=\s*40\.0\s*;/u);
    // Finite-difference normal on the raw drop field (the refraction driver).
    expect(shader).toMatch(/vec2\s+n\s*=\s*vec2\(\s*cx\s*-\s*c\.x\s*,\s*cy\s*-\s*c\.x\s*\)\s*;/u);
    // Lens refraction: scene sampled at UV + n (no painted rim/fog overlay).
    expect(shader).toMatch(/sampleScene\(\s*UV\s*\+\s*n\s*,\s*focus\s*\)/u);
    // Lightning post-processing preserved from the reference.
    expect(shader).toMatch(/\blightning\b/u);
    // No constant-color fog overlay that would wash the blurred scene.
    expect(shader).not.toMatch(/\bfogColor\b/u);
  });

  it("keeps the pearl-drift workbench shader driven by theme mode instead of a manual background-tone slider", () => {
    const shader = readFileSync(
      path.join(process.cwd(), "fixtures/themes/pearl-drift/shaders/workbench-background.glsl"),
      "utf8"
    );
    const manifest = readFileSync(
      path.join(process.cwd(), "fixtures/themes/pearl-drift/manifest.json"),
      "utf8"
    );

    expect(manifest).not.toMatch(/"id"\s*:\s*"backgroundTone"/u);
    expect(manifest).not.toMatch(/"backgroundTone"\s*:/u);

    expect(shader).toMatch(/\buniform\s+float\s+u_themeMode\s*;/u);
    expect(shader).not.toMatch(/\buniform\s+float\s+u_backgroundTone\s*;/u);
    expect(shader).toMatch(/float\s+tone\s*=\s*clamp\(u_themeMode\s*,\s*0\.0\s*,\s*1\.0\)\s*;/u);
    expect(shader).toMatch(/vec3\s+baseColor\s*=\s*mix\(/u);
    expect(shader).toMatch(/vec3\s+pearlTint\s*=\s*mix\(/u);
  });

  it("does not inject shadertoy-compatible uniforms when channel 0 is absent", () => {
    const source = buildFragmentShaderSource(
      [
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      [],
      false
    );

    expect(source).not.toMatch(/\buniform\s+vec3\s+iResolution\s*;/u);
    expect(source).not.toMatch(/\buniform\s+float\s+iTime\s*;/u);
    expect(source).not.toMatch(/\buniform\s+sampler2D\s+iChannel0\s*;/u);
  });

  it("injects shadertoy-compatible uniforms when channel 0 is present", () => {
    const source = buildFragmentShaderSource(
      [
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      [],
      true
    );

    expect(source).toMatch(/\buniform\s+vec3\s+iResolution\s*;/u);
    expect(source).toMatch(/\buniform\s+float\s+iTime\s*;/u);
    expect(source).toMatch(/\buniform\s+sampler2D\s+iChannel0\s*;/u);
  });

  it("does not duplicate built-in, shadertoy, or shared uniform declarations already present in the shader source", () => {
    const source = buildFragmentShaderSource(
      [
        "precision mediump float;",
        "uniform vec2 u_resolution;",
        "uniform float u_time;",
        "uniform vec3 iResolution;",
        "uniform float iTime;",
        "uniform sampler2D iChannel0;",
        "uniform float u_rainAmount;",
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      ["rainAmount"],
      true
    );

    expect(source.match(/\buniform\s+vec2\s+u_resolution\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+float\s+u_time\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+vec3\s+iResolution\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+float\s+iTime\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+sampler2D\s+iChannel0\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+float\s+u_rainAmount\s*;/gu)?.length).toBe(1);
  });

  it("keeps fragment precision declarations ahead of injected uniforms when the shader already declares precision", () => {
    const source = buildFragmentShaderSource(
      [
        "// comment",
        "precision mediump float;",
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      ["themeMode"],
      false
    );

    const precisionIndex = source.indexOf("precision mediump float;");
    const uniformIndex = source.indexOf("uniform float u_themeMode;");

    expect(precisionIndex).toBeGreaterThanOrEqual(0);
    expect(uniformIndex).toBeGreaterThanOrEqual(0);
    expect(precisionIndex).toBeLessThan(uniformIndex);
  });

  it("does not duplicate shadertoy uniforms declared with precision qualifiers", () => {
    const source = buildFragmentShaderSource(
      [
        "uniform mediump vec3 iResolution;",
        "uniform highp float iTime;",
        "uniform lowp sampler2D iChannel0;",
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      [],
      true
    );

    expect(source.match(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?vec3\s+iResolution\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?float\s+iTime\s*;/gu)?.length).toBe(1);
    expect(source.match(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+iChannel0\s*;/gu)?.length).toBe(1);
  });

  it("ignores commented-out uniform declarations when deciding header injection", () => {
    const source = buildFragmentShaderSource(
      [
        "// uniform vec3 iResolution;",
        "// uniform float iTime;",
        "/* uniform sampler2D iChannel0; */",
        "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
        "  fragColor = vec4(1.0);",
        "}"
      ].join("\n"),
      [],
      true
    );
    const uncommentedSource = source
      .replace(/\/\*[\s\S]*?\*\//gu, " ")
      .replace(/\/\/.*$/gmu, " ");

    expect(uncommentedSource.match(/\buniform\s+vec3\s+iResolution\s*;/gu)?.length).toBe(1);
    expect(uncommentedSource.match(/\buniform\s+float\s+iTime\s*;/gu)?.length).toBe(1);
    expect(uncommentedSource.match(/\buniform\s+sampler2D\s+iChannel0\s*;/gu)?.length).toBe(1);
  });

  it("falls back immediately when effects are disabled", async () => {
    const createPresenter = vi.fn();
    const runtime = createThemeSurfaceRuntime({ createPresenter });

    const result = await runtime.mount({
      canvas: createCanvas(),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "off",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "off",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("fallback");
    expect(createPresenter).not.toHaveBeenCalled();
  });

  it("scales the internal canvas resolution using theme renderScale while preserving layout viewport", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const runtime = createThemeSurfaceRuntime({
      createPresenter: () => ({
        render,
        destroy
      })
    });
    const canvas = createCanvas(320, 200);

    const result = await runtime.mount({
      canvas,
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "full",
      renderSettings: {
        scene: {
          renderScale: 0.75
        }
      },
      sceneState: createThemeSceneState({
        sceneId: "ember-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("full");
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(150);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        viewport: { width: 320, height: 200 }
      })
    );

    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("prefers surface render overrides over scene defaults when resolving internal resolution", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const runtime = createThemeSurfaceRuntime({
      createPresenter: () => ({
        render,
        destroy
      })
    });
    const canvas = createCanvas(320, 200);

    const result = await runtime.mount({
      canvas,
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "full",
      renderSettings: {
        scene: {
          renderScale: 0.8,
          frameRate: 30
        },
        surface: {
          renderScale: 0.5
        }
      },
      sceneState: createThemeSceneState({
        sceneId: "ember-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("full");
    expect(canvas.width).toBe(160);
    expect(canvas.height).toBe(100);
    expect(render).toHaveBeenCalledTimes(1);

    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("throttles full-mode animation frames according to the resolved theme frameRate", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const scheduledFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const runtime = createThemeSurfaceRuntime({
      now: () => 0,
      requestAnimationFrame,
      createPresenter: () => ({
        render,
        destroy
      })
    });

    const result = await runtime.mount({
      canvas: createCanvas(320, 200),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "full",
      renderSettings: {
        scene: {
          frameRate: 20
        }
      },
      sceneState: createThemeSceneState({
        sceneId: "ember-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("full");
    expect(render).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    scheduledFrames[0]?.(16);
    expect(render).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    scheduledFrames[1]?.(60);
    expect(render).toHaveBeenCalledTimes(2);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);

    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("uses an animated render path for auto mode when reduced motion is not requested", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const scheduledFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const runtime = createThemeSurfaceRuntime({
      requestAnimationFrame,
      createPresenter: () => ({
        render,
        destroy
      })
    });

    const result = await runtime.mount({
      canvas: createCanvas(320, 200),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "auto",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "auto",
        sharedUniforms: { rainAmount: 0.7 }
      })
    });

    expect(result.mode).toBe("full");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "workbenchBackground",
        viewport: { width: 320, height: 200 },
        uniforms: expect.objectContaining({ rainAmount: 0.7, themeMode: 1 })
      })
    );
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    scheduledFrames[0]?.(16);

    expect(render).toHaveBeenCalledTimes(2);

    result.unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("still renders surfaces that do not provide channels", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const createPresenter = vi.fn(() => ({
      render,
      destroy
    }));
    const runtime = createThemeSurfaceRuntime({
      createPresenter
    });

    const result = await runtime.mount({
      canvas: createCanvas(320, 200),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "full",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("full");
    expect(createPresenter).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: undefined
      })
    );
    expect(render).toHaveBeenCalledTimes(1);

    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("binds channel 0 textures to texture unit 0 in the default presenter path", async () => {
    const originalImage = globalThis.Image;
    const originalWebGLRenderingContext = globalThis.WebGLRenderingContext;
    const requestAnimationFrame = vi.fn(() => 1);
    const cancelAnimationFrame = vi.fn();

    const channel0Location = {} as WebGLUniformLocation;

    class FakeWebGLRenderingContext {
      readonly VERTEX_SHADER = 0x8b31;
      readonly FRAGMENT_SHADER = 0x8b30;
      readonly COMPILE_STATUS = 0x8b81;
      readonly LINK_STATUS = 0x8b82;
      readonly ARRAY_BUFFER = 0x8892;
      readonly STATIC_DRAW = 0x88e4;
      readonly FLOAT = 0x1406;
      readonly COLOR_BUFFER_BIT = 0x4000;
      readonly TRIANGLES = 0x0004;
      readonly TEXTURE0 = 0x84c0;
      readonly TEXTURE_2D = 0x0de1;
      readonly TEXTURE_WRAP_S = 0x2802;
      readonly TEXTURE_WRAP_T = 0x2803;
      readonly TEXTURE_MIN_FILTER = 0x2801;
      readonly TEXTURE_MAG_FILTER = 0x2800;
      readonly CLAMP_TO_EDGE = 0x812f;
      readonly LINEAR = 0x2601;
      readonly RGBA = 0x1908;
      readonly UNSIGNED_BYTE = 0x1401;

      createShader = vi.fn(() => ({} as WebGLShader));
      shaderSource = vi.fn();
      compileShader = vi.fn();
      getShaderParameter = vi.fn(() => true);
      getShaderInfoLog = vi.fn(() => "");
      deleteShader = vi.fn();
      createProgram = vi.fn(() => ({} as WebGLProgram));
      attachShader = vi.fn();
      linkProgram = vi.fn();
      getProgramParameter = vi.fn(() => true);
      getProgramInfoLog = vi.fn(() => "");
      deleteProgram = vi.fn();
      getAttribLocation = vi.fn(() => 0);
      getUniformLocation = vi.fn((_program: WebGLProgram, name: string) => {
        if (name === "iChannel0") {
          return channel0Location;
        }
        return {} as WebGLUniformLocation;
      });
      createBuffer = vi.fn(() => ({} as WebGLBuffer));
      bindBuffer = vi.fn();
      bufferData = vi.fn();
      useProgram = vi.fn();
      enableVertexAttribArray = vi.fn();
      vertexAttribPointer = vi.fn();
      clearColor = vi.fn();
      viewport = vi.fn();
      clear = vi.fn();
      uniform2f = vi.fn();
      uniform3f = vi.fn();
      uniform1f = vi.fn();
      uniform1i = vi.fn();
      drawArrays = vi.fn();
      createTexture = vi.fn(() => ({} as WebGLTexture));
      activeTexture = vi.fn();
      bindTexture = vi.fn();
      texParameteri = vi.fn();
      texImage2D = vi.fn();
      deleteTexture = vi.fn();
      deleteBuffer = vi.fn();
    }

    class SuccessfulImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      decoding = "async";
      #src = "";

      set src(value: string) {
        this.#src = value;
        queueMicrotask(() => {
          this.onload?.(new Event("load"));
        });
      }

      get src(): string {
        return this.#src;
      }

      decode(): Promise<void> {
        return Promise.resolve();
      }
    }

    globalThis.WebGLRenderingContext = FakeWebGLRenderingContext as unknown as typeof WebGLRenderingContext;
    globalThis.Image = SuccessfulImage as unknown as typeof Image;

    try {
      const gl = new FakeWebGLRenderingContext() as unknown as WebGLRenderingContext;
      const canvas = createCanvas(320, 200);
      canvas.getContext = vi.fn((contextId: string) => {
        return contextId === "webgl" ? gl : null;
      }) as HTMLCanvasElement["getContext"];

      const runtime = createThemeSurfaceRuntime({
        requestAnimationFrame,
        cancelAnimationFrame
      });

      const result = await runtime.mount({
        canvas,
        surface: "workbenchBackground",
        shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
        channels: {
          "0": {
            type: "image",
            src: "file:///tmp/channel-0.png"
          }
        },
        effectsMode: "full",
        sceneState: createThemeSceneState({
          sceneId: "rain-scene",
          themeMode: "dark",
          effectsMode: "full",
          sharedUniforms: {}
        })
      });

      expect(result.mode).toBe("full");
      expect((gl.activeTexture as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(gl.TEXTURE0);
      expect((gl.uniform1i as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(channel0Location, 0);
      expect((gl.texImage2D as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
      expect((gl.deleteTexture as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

      result.unmount();
      expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
      expect((gl.deleteTexture as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.WebGLRenderingContext = originalWebGLRenderingContext;
      globalThis.Image = originalImage;
    }
  });

  it("uses a reduced one-shot render path for auto mode when reduced motion is requested", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const requestAnimationFrame = vi.fn();
    const runtime = createThemeSurfaceRuntime({
      requestAnimationFrame,
      matchMedia: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      } satisfies MediaQueryList),
      createPresenter: () => ({
        render,
        destroy
      })
    });

    const result = await runtime.mount({
      canvas: createCanvas(320, 200),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "auto",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "auto",
        sharedUniforms: { rainAmount: 0.7 }
      })
    });

    expect(result.mode).toBe("reduced");
    expect(render).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    result.unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("redraws reduced surfaces when the canvas size changes", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const observedTargets: Element[] = [];
    let triggerResize!: () => void;
    let disconnected = false;
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = () => callback([] as ResizeObserverEntry[], {} as ResizeObserver);
      }

      observe(target: Element) {
        observedTargets.push(target);
      }

      disconnect() {
        disconnected = true;
      }
    }

    const runtime = createThemeSurfaceRuntime({
      ResizeObserver: FakeResizeObserver as typeof ResizeObserver,
      matchMedia: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      } satisfies MediaQueryList),
      createPresenter: () => ({
        render,
        destroy
      })
    });
    const canvas = createCanvas(320, 200);
    const result = await runtime.mount({
      canvas,
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "auto",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "auto",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("reduced");
    expect(render).toHaveBeenCalledTimes(1);
    expect(observedTargets).toEqual([canvas]);

    canvas.__setSize(640, 400);
    triggerResize();

    expect(render).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(400);

    result.unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(disconnected).toBe(true);
  });

  it("starts an animation loop in full mode and tears it down cleanly", async () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const scheduledFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const cancelAnimationFrame = vi.fn();
    const runtime = createThemeSurfaceRuntime({
      requestAnimationFrame,
      cancelAnimationFrame,
      createPresenter: () => ({
        render,
        destroy
      })
    });

    const result = await runtime.mount({
      canvas: createCanvas(),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "full",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "full",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("full");
    expect(render).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    scheduledFrames[0]?.(16);

    expect(render).toHaveBeenCalledTimes(2);

    result.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back when presenter creation fails", async () => {
    const runtime = createThemeSurfaceRuntime({
      createPresenter: () => {
        throw new Error("shader compile failed");
      }
    });

    const result = await runtime.mount({
      canvas: createCanvas(),
      surface: "workbenchBackground",
      shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
      effectsMode: "auto",
      sceneState: createThemeSceneState({
        sceneId: "rain-scene",
        themeMode: "dark",
        effectsMode: "auto",
        sharedUniforms: {}
      })
    });

    expect(result.mode).toBe("fallback");
  });

  it("falls back safely when channel 0 image loading fails", async () => {
    const originalImage = globalThis.Image;
    const createPresenter = vi.fn(() => ({
      render: vi.fn(),
      destroy: vi.fn()
    }));

    class FailingImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_: string) {
        queueMicrotask(() => {
          this.onerror?.(new Event("error"));
        });
      }
    }

    globalThis.Image = FailingImage as unknown as typeof Image;

    try {
      const runtime = createThemeSurfaceRuntime({
        createPresenter
      });

      const result = await runtime.mount({
        canvas: createCanvas(),
        surface: "workbenchBackground",
        shaderSource: "void main() { gl_FragColor = vec4(1.0); }",
        channels: {
          "0": {
            type: "image",
            src: "file:///tmp/missing-channel.png"
          }
        },
        effectsMode: "auto",
        sceneState: createThemeSceneState({
          sceneId: "rain-scene",
          themeMode: "dark",
          effectsMode: "auto",
          sharedUniforms: {}
        })
      });

      expect(result.mode).toBe("fallback");
      expect(createPresenter).not.toHaveBeenCalled();
    } finally {
      globalThis.Image = originalImage;
    }
  });
});
