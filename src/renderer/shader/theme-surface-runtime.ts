import type {
  ThemeEffectsMode,
  ThemeSurfaceRenderSettings,
  ThemeSurfaceSlot
} from "../../shared/theme-package";
import type { ThemeSceneFrame, ThemeSceneState, ThemeSceneViewport } from "./theme-scene-state";

export type ThemeSurfaceRuntimeMode = "full" | "reduced" | "fallback";

export type ThemeSurfacePresenter = {
  render: (frame: ThemeSceneFrame) => void;
  destroy: () => void;
};

type ThemeSurfaceImageChannelDescriptor = {
  type: "image";
  src: string;
};

export type ThemeSurfaceRuntimeChannels = Partial<Record<"0", ThemeSurfaceImageChannelDescriptor>>;
type ThemeSurfaceRuntimeChannelImages = Partial<Record<"0", HTMLImageElement>>;

export type ThemeSurfacePresenterFactory = (input: {
  canvas: HTMLCanvasElement;
  shaderSource: string;
  uniformKeys: readonly string[];
  channels?: ThemeSurfaceRuntimeChannels;
  channelImages?: ThemeSurfaceRuntimeChannelImages;
}) => ThemeSurfacePresenter;

export type MountThemeSurfaceInput = {
  canvas: HTMLCanvasElement | null;
  surface: ThemeSurfaceSlot;
  shaderSource: string | null;
  channels?: ThemeSurfaceRuntimeChannels;
  effectsMode: ThemeEffectsMode;
  renderSettings?: {
    scene?: ThemeSurfaceRenderSettings;
    surface?: ThemeSurfaceRenderSettings;
  };
  sceneState: ThemeSceneState;
};

export type MountedThemeSurface = {
  mode: ThemeSurfaceRuntimeMode;
  invalidate: () => void;
  unmount: () => void;
};

type ThemeSurfaceRuntimeDependencies = {
  createPresenter?: ThemeSurfacePresenterFactory;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  ResizeObserver?: typeof ResizeObserver;
  matchMedia?: (query: string) => MediaQueryList;
  now?: () => number;
};

type ResolvedThemeSurfaceRenderSettings = {
  renderScale: number;
  frameRate: number | null;
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function prefersReducedMotion(
  matchMediaImpl: ((query: string) => MediaQueryList) | undefined
): boolean {
  if (!matchMediaImpl) {
    return false;
  }

  return matchMediaImpl("(prefers-reduced-motion: reduce)").matches;
}

function resolveRenderMode(
  effectsMode: ThemeEffectsMode,
  matchMediaImpl: ((query: string) => MediaQueryList) | undefined
): ThemeSurfaceRuntimeMode {
  if (effectsMode === "off") {
    return "fallback";
  }

  if (effectsMode === "full") {
    return "full";
  }

  return prefersReducedMotion(matchMediaImpl) ? "reduced" : "full";
}

function getViewport(canvas: HTMLCanvasElement): ThemeSceneViewport {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || canvas.width;
  const height = rect.height || canvas.clientHeight || canvas.height;

  return {
    width: Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0,
    height: Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0
  };
}

function syncCanvasSize(
  canvas: HTMLCanvasElement,
  viewport: ThemeSceneViewport,
  renderScale: number
): void {
  const devicePixelRatio =
    typeof globalThis.window?.devicePixelRatio === "number" ? globalThis.window.devicePixelRatio : 1;
  const effectiveScale =
    typeof renderScale === "number" && Number.isFinite(renderScale) && renderScale > 0
      ? renderScale
      : 1;
  const nextWidth = Math.max(
    1,
    Math.round(viewport.width * Math.max(1, devicePixelRatio) * effectiveScale)
  );
  const nextHeight = Math.max(
    1,
    Math.round(viewport.height * Math.max(1, devicePixelRatio) * effectiveScale)
  );

  if (canvas.width !== nextWidth) {
    canvas.width = nextWidth;
  }

  if (canvas.height !== nextHeight) {
    canvas.height = nextHeight;
  }
}

function createFallbackMount(): MountedThemeSurface {
  return {
    mode: "fallback",
    invalidate() {},
    unmount() {}
  };
}

function resolveThemeSurfaceRenderSettings(
  renderSettings: MountThemeSurfaceInput["renderSettings"]
): ResolvedThemeSurfaceRenderSettings {
  const renderScale =
    renderSettings?.surface?.renderScale ?? renderSettings?.scene?.renderScale ?? 1;
  const frameRate =
    renderSettings?.surface?.frameRate ?? renderSettings?.scene?.frameRate ?? null;

  return {
    renderScale:
      typeof renderScale === "number" &&
      Number.isFinite(renderScale) &&
      renderScale > 0 &&
      renderScale <= 1
        ? renderScale
        : 1,
    frameRate:
      typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0
        ? frameRate
        : null
  };
}

function sanitizeUniformKey(key: string, index: number): string {
  const stripped = key.trim().replace(/[^A-Za-z0-9_]/gu, "_");
  const prefixed = /^[A-Za-z_]/u.test(stripped) ? stripped : `shared_${index}`;
  return `u_${prefixed}`;
}

function stripShaderComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/\/\/.*$/gmu, " ");
}

function hasUniformDeclaration(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\buniform\\s+(?:(?:lowp|mediump|highp)\\s+)?\\w+\\s+${escaped}\\s*;`,
    "u"
  ).test(source);
}

export function buildFragmentShaderSource(
  shaderSource: string,
  uniformKeys: readonly string[],
  hasChannel0 = false
): string {
  const trimmed = shaderSource.trim();

  if (trimmed.length === 0) {
    throw new Error("Shader source is empty.");
  }
  const declarationScanSource = stripShaderComments(trimmed);
  const existingPrecisionMatch = trimmed.match(/\bprecision\s+(?:lowp|mediump|highp)\s+float\s*;/u);
  const bodyWithoutPrecision =
    existingPrecisionMatch && typeof existingPrecisionMatch.index === "number"
      ? `${trimmed.slice(0, existingPrecisionMatch.index)}${trimmed.slice(existingPrecisionMatch.index + existingPrecisionMatch[0].length)}`.trim()
      : trimmed;

  const header = [
    existingPrecisionMatch?.[0] ?? "precision mediump float;",
    hasUniformDeclaration(declarationScanSource, "u_resolution") ? null : "uniform vec2 u_resolution;",
    hasUniformDeclaration(declarationScanSource, "u_time") ? null : "uniform float u_time;",
    hasChannel0 && !hasUniformDeclaration(declarationScanSource, "iResolution") ? "uniform vec3 iResolution;" : null,
    hasChannel0 && !hasUniformDeclaration(declarationScanSource, "iTime") ? "uniform float iTime;" : null,
    hasChannel0 && !hasUniformDeclaration(declarationScanSource, "iChannel0") ? "uniform sampler2D iChannel0;" : null,
    ...uniformKeys.map((key, index) => {
      const uniformName = sanitizeUniformKey(key, index);
      return hasUniformDeclaration(declarationScanSource, uniformName) ? null : `uniform float ${uniformName};`;
    })
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  if (/\bvoid\s+mainImage\s*\(/u.test(bodyWithoutPrecision)) {
    return `${header}\n${bodyWithoutPrecision}\nvoid main() {\n  vec4 yuloraColor = vec4(0.0);\n  mainImage(yuloraColor, gl_FragCoord.xy);\n  gl_FragColor = yuloraColor;\n}`;
  }

  return `${header}\n${bodyWithoutPrecision}`;
}

async function loadImageChannel(src: string): Promise<HTMLImageElement> {
  if (typeof globalThis.Image !== "function") {
    throw new Error("Image loading is unavailable.");
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new globalThis.Image();
    image.decoding = "async";

    let settled = false;
    const rejectLoad = () => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`Failed to load image channel: ${src}`));
    };

    const resolveLoad = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(image);
    };

    image.onerror = () => {
      rejectLoad();
    };

    image.onload = () => {
      if (typeof image.decode !== "function") {
        resolveLoad();
        return;
      }

      image.decode().then(
        () => {
          resolveLoad();
        },
        () => {
          rejectLoad();
        }
      );
    };

    try {
      image.src = src;
    } catch {
      rejectLoad();
    }
  });
}

async function resolveChannelImages(
  channels: ThemeSurfaceRuntimeChannels | undefined
): Promise<ThemeSurfaceRuntimeChannelImages | undefined> {
  const channel0 = channels?.["0"];

  if (!channel0 || channel0.type !== "image") {
    return undefined;
  }

  const image = await loadImageChannel(channel0.src);
  return { "0": image };
}

function getWebGlContext(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false
  };
  const context =
    canvas.getContext("webgl", contextAttributes) ??
    canvas.getContext("experimental-webgl", contextAttributes);

  if (!(context instanceof WebGLRenderingContext)) {
    throw new Error("WebGL is unavailable.");
  }

  return context;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to allocate shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const message = gl.getShaderInfoLog(shader) ?? "Shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to allocate shader program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const message = gl.getProgramInfoLog(program) ?? "Shader link failed.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createDefaultPresenter(input: {
  canvas: HTMLCanvasElement;
  shaderSource: string;
  uniformKeys: readonly string[];
  channels?: ThemeSurfaceRuntimeChannels;
  channelImages?: ThemeSurfaceRuntimeChannelImages;
}): ThemeSurfacePresenter {
  const gl = getWebGlContext(input.canvas);
  const channel0Image = input.channelImages?.["0"];
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    buildFragmentShaderSource(input.shaderSource, input.uniformKeys, Boolean(channel0Image))
  );
  const program = createProgram(gl, vertexShader, fragmentShader);
  const positionAttribute = gl.getAttribLocation(program, "a_position");
  const resolutionUniform = gl.getUniformLocation(program, "u_resolution");
  const timeUniform = gl.getUniformLocation(program, "u_time");
  const iResolutionUniform = gl.getUniformLocation(program, "iResolution");
  const iTimeUniform = gl.getUniformLocation(program, "iTime");
  const iChannel0Uniform = channel0Image ? gl.getUniformLocation(program, "iChannel0") : null;
  const sharedUniformLocations = new Map<string, WebGLUniformLocation | null>(
    input.uniformKeys.map((key, index) => [key, gl.getUniformLocation(program, sanitizeUniformKey(key, index))])
  );
  const quadBuffer = gl.createBuffer();
  let channel0Texture: WebGLTexture | null = null;

  if (!quadBuffer) {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Failed to allocate geometry buffer.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]),
    gl.STATIC_DRAW
  );

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionAttribute);
  gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 0);

  if (channel0Image) {
    channel0Texture = gl.createTexture();
    if (!channel0Texture) {
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error("Failed to allocate channel texture.");
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, channel0Texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, channel0Image);
    } catch (error) {
      gl.deleteTexture(channel0Texture);
      gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw error;
    }
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return {
    render(frame) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(positionAttribute);
      gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, input.canvas.width, input.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (resolutionUniform) {
        gl.uniform2f(resolutionUniform, input.canvas.width, input.canvas.height);
      }

      if (timeUniform) {
        gl.uniform1f(timeUniform, frame.time);
      }

      if (iResolutionUniform) {
        gl.uniform3f(iResolutionUniform, input.canvas.width, input.canvas.height, 1);
      }

      if (iTimeUniform) {
        gl.uniform1f(iTimeUniform, frame.time);
      }

      if (channel0Texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, channel0Texture);
        if (iChannel0Uniform) {
          gl.uniform1i(iChannel0Uniform, 0);
        }
      }

      for (const [key, location] of sharedUniformLocations) {
        if (!location) {
          continue;
        }

        gl.uniform1f(location, frame.uniforms[key] ?? 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      gl.deleteBuffer(quadBuffer);
      if (channel0Texture) {
        gl.deleteTexture(channel0Texture);
      }
      gl.deleteProgram(program);
    }
  };
}

export function createThemeSurfaceRuntime(
  dependencies: ThemeSurfaceRuntimeDependencies = {}
): {
  mount: (input: MountThemeSurfaceInput) => Promise<MountedThemeSurface>;
} {
  const createPresenter = dependencies.createPresenter ?? createDefaultPresenter;
  const requestAnimationFrameImpl =
    dependencies.requestAnimationFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelAnimationFrameImpl =
    dependencies.cancelAnimationFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
  const ResizeObserverImpl = dependencies.ResizeObserver ?? globalThis.ResizeObserver;
  const matchMediaImpl = dependencies.matchMedia ?? globalThis.matchMedia?.bind(globalThis);
  const nowImpl =
    dependencies.now ??
    (() => {
      if (typeof globalThis.performance?.now === "function") {
        return globalThis.performance.now();
      }

      return Date.now();
    });

  async function mount(input: MountThemeSurfaceInput): Promise<MountedThemeSurface> {
    const mode = resolveRenderMode(input.effectsMode, matchMediaImpl);

    if (mode === "fallback" || !(input.canvas instanceof HTMLCanvasElement)) {
      return createFallbackMount();
    }

    const canvas = input.canvas;

    const shaderSource = input.shaderSource?.trim() ?? "";

    if (shaderSource.length === 0) {
      return createFallbackMount();
    }

    let presenter: ThemeSurfacePresenter;
    let channelImages: ThemeSurfaceRuntimeChannelImages | undefined;

    try {
      channelImages = await resolveChannelImages(input.channels);
      presenter = createPresenter({
        canvas,
        shaderSource,
        uniformKeys: input.sceneState.sharedUniformKeys,
        channels: input.channels,
        channelImages
      });
    } catch {
      return createFallbackMount();
    }

    let isUnmounted = false;
    let frameHandle: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let lastRenderAtMs: number | null = null;
    const resolvedRenderSettings = resolveThemeSurfaceRenderSettings(input.renderSettings);
    const frameIntervalMs =
      resolvedRenderSettings.frameRate !== null ? 1_000 / resolvedRenderSettings.frameRate : null;

    const renderFrame = (renderedAtMs?: number): void => {
      if (isUnmounted) {
        return;
      }

      const viewport = getViewport(canvas);

      if (viewport.width > 0 && viewport.height > 0) {
        syncCanvasSize(canvas, viewport, resolvedRenderSettings.renderScale);
        presenter.render(input.sceneState.nextFrame(input.surface, viewport));
        lastRenderAtMs = renderedAtMs ?? nowImpl();
      }
    };

    renderFrame();

    const handleAnimationFrame = (timestamp: number): void => {
      if (isUnmounted) {
        return;
      }

      if (
        frameIntervalMs === null ||
        lastRenderAtMs === null ||
        timestamp - lastRenderAtMs >= frameIntervalMs - 0.5
      ) {
        renderFrame(timestamp);
      }

      if (!isUnmounted && requestAnimationFrameImpl) {
        frameHandle = requestAnimationFrameImpl(handleAnimationFrame);
      }
    };

    if (mode === "full" && requestAnimationFrameImpl) {
      frameHandle = requestAnimationFrameImpl(handleAnimationFrame);
    }

    if (mode === "reduced" && typeof ResizeObserverImpl === "function") {
      resizeObserver = new ResizeObserverImpl(() => {
        renderFrame();
      });
      resizeObserver.observe(canvas);
    }

    return {
      mode,
      invalidate() {
        if (isUnmounted || mode !== "reduced") {
          return;
        }

        renderFrame();
      },
      unmount() {
        if (isUnmounted) {
          return;
        }

        isUnmounted = true;

        if (frameHandle !== null && cancelAnimationFrameImpl) {
          cancelAnimationFrameImpl(frameHandle);
          frameHandle = null;
        }

        resizeObserver?.disconnect();
        resizeObserver = null;
        presenter.destroy();
      }
    };
  }

  return {
    mount
  };
}
