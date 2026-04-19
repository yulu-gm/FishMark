import type { ThemeEffectsMode, ThemeSurfaceSlot } from "../../shared/theme-package";
import type { ThemeRuntimeEnv } from "../theme-runtime-env";

export type ThemeAppearanceMode = "light" | "dark";

export type ThemeSceneViewport = {
  width: number;
  height: number;
};

export type ThemeSceneFrame = {
  sceneId: string;
  surface: ThemeSurfaceSlot;
  time: number;
  viewport: ThemeSceneViewport;
  uniforms: Record<string, number>;
  effectsMode: ThemeEffectsMode;
};

export type ThemeSceneState = {
  readonly sceneId: string;
  readonly effectsMode: ThemeEffectsMode;
  readonly sharedUniformKeys: readonly string[];
  updateRuntimeEnv: (runtimeEnv: ThemeSceneRuntimeEnv) => void;
  nextFrame: (surface: ThemeSurfaceSlot, viewport: ThemeSceneViewport) => ThemeSceneFrame;
};

export type ThemeSceneRuntimeEnv = Pick<ThemeRuntimeEnv, "wordCount" | "focusMode" | "viewport">;

type ThemeSceneStateInput = {
  sceneId: string;
  themeMode: ThemeAppearanceMode;
  effectsMode: ThemeEffectsMode;
  sharedUniforms: Record<string, number>;
  runtimeEnv: ThemeSceneRuntimeEnv;
};

type ThemeSceneStateOptions = {
  now?: () => number;
};

function getNow(): number {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

function normalizeViewport(viewport: ThemeSceneViewport): ThemeSceneViewport {
  return {
    width: Number.isFinite(viewport.width) ? Math.max(0, Math.round(viewport.width)) : 0,
    height: Number.isFinite(viewport.height) ? Math.max(0, Math.round(viewport.height)) : 0
  };
}

function cloneUniforms(sharedUniforms: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(sharedUniforms).filter(([, value]) => Number.isFinite(value))
  );
}

function resolveThemeModeUniform(mode: ThemeAppearanceMode): number {
  return mode === "dark" ? 1 : 0;
}

function normalizeWordCount(wordCount: number): number {
  return Number.isFinite(wordCount) ? Math.max(0, Math.round(wordCount)) : 0;
}

function normalizeFocusMode(focusMode: number): 0 | 1 {
  return focusMode === 1 ? 1 : 0;
}

function normalizeRuntimeEnv(runtimeEnv: ThemeSceneRuntimeEnv): ThemeSceneRuntimeEnv {
  return {
    wordCount: normalizeWordCount(runtimeEnv.wordCount),
    focusMode: normalizeFocusMode(runtimeEnv.focusMode),
    viewport: normalizeViewport(runtimeEnv.viewport)
  };
}

function createBuiltInUniforms(
  mode: ThemeAppearanceMode,
  runtimeEnv: ThemeSceneRuntimeEnv,
  viewport: ThemeSceneViewport
): Record<string, number> {
  const normalizedViewport = normalizeViewport(viewport);

  return {
    themeMode: resolveThemeModeUniform(mode),
    wordCount: runtimeEnv.wordCount,
    focusMode: runtimeEnv.focusMode,
    viewportWidth: normalizedViewport.width,
    viewportHeight: normalizedViewport.height
  };
}

export function createThemeSceneState(
  input: ThemeSceneStateInput,
  options: ThemeSceneStateOptions = {}
): ThemeSceneState {
  const now = options.now ?? getNow;
  const startedAtMs = now();
  const sharedUniforms = cloneUniforms(input.sharedUniforms);
  let runtimeEnv = normalizeRuntimeEnv(input.runtimeEnv);
  const sharedUniformKeys = Object.freeze(
    Object.keys({
      ...sharedUniforms,
      ...createBuiltInUniforms(input.themeMode, runtimeEnv, runtimeEnv.viewport)
    })
  );
  let cachedNowMs: number | null = null;
  let clearScheduled = false;

  function readSharedNowMs(): number {
    if (cachedNowMs !== null) {
      return cachedNowMs;
    }

    cachedNowMs = now();

    if (!clearScheduled) {
      clearScheduled = true;
      queueMicrotask(() => {
        cachedNowMs = null;
        clearScheduled = false;
      });
    }

    return cachedNowMs;
  }

  function nextFrame(surface: ThemeSurfaceSlot, viewport: ThemeSceneViewport): ThemeSceneFrame {
    const currentMs = readSharedNowMs();
    const normalizedViewport = normalizeViewport(viewport);

    return {
      sceneId: input.sceneId,
      surface,
      time: Math.max(0, (currentMs - startedAtMs) / 1_000),
      viewport: normalizedViewport,
      uniforms: {
        ...cloneUniforms(sharedUniforms),
        ...createBuiltInUniforms(input.themeMode, runtimeEnv, normalizedViewport)
      },
      effectsMode: input.effectsMode
    };
  }

  return {
    sceneId: input.sceneId,
    effectsMode: input.effectsMode,
    sharedUniformKeys,
    updateRuntimeEnv(nextRuntimeEnv) {
      runtimeEnv = normalizeRuntimeEnv(nextRuntimeEnv);
    },
    nextFrame
  };
}
