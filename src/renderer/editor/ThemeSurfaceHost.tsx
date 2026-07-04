import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ThemeEffectsMode,
  ThemeSurfaceRenderSettings,
  ThemeSurfaceSlot
} from "../../shared/theme-package";
import type { ThemeRuntimeEnv } from "../theme-runtime-env";
import { createThemeSceneState, type ThemeAppearanceMode } from "../shader/theme-scene-state";
import type {
  MountThemeSurfaceInput,
  MountedThemeSurface,
  ThemeSurfaceRuntimeChannels,
  ThemeSurfaceRuntimeMode
} from "../shader/theme-surface-runtime";

export type ThemeSurfaceHostDescriptor = {
  kind: "fragment";
  sceneId: string;
  shaderUrl: string;
  channels?: ThemeSurfaceRuntimeChannels;
  renderSettings?: {
    scene?: ThemeSurfaceRenderSettings;
    surface?: ThemeSurfaceRenderSettings;
  };
  sharedUniforms: Record<string, number>;
};

type ThemeSurfaceHostProps = {
  surface: ThemeSurfaceSlot;
  descriptor: ThemeSurfaceHostDescriptor;
  themeMode: ThemeAppearanceMode;
  runtimeEnv: ThemeRuntimeEnv;
  effectsMode: ThemeEffectsMode;
  onRuntimeModeChange?: (mode: ThemeSurfaceRuntimeMode) => void;
};

type ThemeSurfaceRuntime = {
  mount: (input: MountThemeSurfaceInput) => Promise<MountedThemeSurface>;
};

function serializeSharedUniforms(sharedUniforms: Record<string, number>): string {
  return JSON.stringify(
    Object.entries(sharedUniforms).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  );
}

function parseSharedUniforms(serializedUniforms: string): Record<string, number> {
  return Object.fromEntries(
    JSON.parse(serializedUniforms) as Array<[string, number]>
  );
}

function serializeChannels(channels: ThemeSurfaceRuntimeChannels | undefined): string {
  if (!channels) {
    return "null";
  }

  return JSON.stringify(
    Object.entries(channels).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  );
}

function parseChannels(serializedChannels: string): ThemeSurfaceRuntimeChannels | undefined {
  if (serializedChannels === "null") {
    return undefined;
  }

  return Object.fromEntries(
    JSON.parse(serializedChannels) as Array<[string, { type: "image"; src: string }]>
  ) as ThemeSurfaceRuntimeChannels;
}

function serializeRuntimeEnv(runtimeEnv: ThemeRuntimeEnv): string {
  return JSON.stringify([
    runtimeEnv.wordCount,
    runtimeEnv.readingMode,
    runtimeEnv.viewport.width,
    runtimeEnv.viewport.height
  ]);
}

export function ThemeSurfaceHost({
  surface,
  descriptor,
  themeMode,
  runtimeEnv,
  effectsMode,
  onRuntimeModeChange
}: ThemeSurfaceHostProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<ThemeSurfaceRuntime | null>(null);
  const sceneStateRef = useRef<ReturnType<typeof createThemeSceneState> | null>(null);
  const mountedSurfaceRef = useRef<{ invalidate: () => void; unmount: () => void } | null>(null);
  const runtimeEnvRef = useRef(runtimeEnv);
  const [mode, setMode] = useState<ThemeSurfaceRuntimeMode>("fallback");
  const sharedUniformsSignature = useMemo(
    () => serializeSharedUniforms(descriptor.sharedUniforms),
    [descriptor.sharedUniforms]
  );
  const sharedUniforms = useMemo(
    () => parseSharedUniforms(sharedUniformsSignature),
    [sharedUniformsSignature]
  );
  const channelsSignature = useMemo(
    () => serializeChannels(descriptor.channels),
    [descriptor.channels]
  );
  const channels = useMemo(
    () => parseChannels(channelsSignature),
    [channelsSignature]
  );
  const runtimeEnvSignature = useMemo(
    () => serializeRuntimeEnv(runtimeEnv),
    [runtimeEnv]
  );

  useEffect(() => {
    let isDisposed = false;
    let mountedSurface: { unmount: () => void } | null = null;
    const abortController = new AbortController();

    async function loadAndMount(): Promise<void> {
      try {
        if (effectsMode === "off") {
          setMode("fallback");
          onRuntimeModeChange?.("fallback");
          return;
        }

        const response = await fetch(descriptor.shaderUrl, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Shader request failed with status ${response.status}.`);
        }

        const shaderSource = await response.text();

        if (isDisposed) {
          return;
        }

        const sceneState = createThemeSceneState({
          sceneId: descriptor.sceneId,
          themeMode,
          effectsMode,
          sharedUniforms,
          runtimeEnv: runtimeEnvRef.current
        });
        sceneStateRef.current = sceneState;
        const runtime = runtimeRef.current ?? await createLazyThemeSurfaceRuntime();

        if (isDisposed) {
          return;
        }

        runtimeRef.current = runtime;
        const result = await runtime.mount({
          canvas: canvasRef.current,
          surface,
          shaderSource,
          channels,
          effectsMode,
          renderSettings: descriptor.renderSettings,
          sceneState
        });

        if (isDisposed) {
          result.unmount();
          return;
        }

        mountedSurfaceRef.current = result;
        mountedSurface = result;
        setMode(result.mode);
        onRuntimeModeChange?.(result.mode);
      } catch {
        if (!isDisposed) {
          setMode("fallback");
          onRuntimeModeChange?.("fallback");
        }
      }
    }

    void loadAndMount();

    return () => {
      isDisposed = true;
      abortController.abort();
      sceneStateRef.current = null;
      mountedSurfaceRef.current = null;
      mountedSurface?.unmount();
    };
  }, [
    descriptor.sceneId,
    descriptor.shaderUrl,
    descriptor.renderSettings,
    channels,
    sharedUniforms,
    themeMode,
    effectsMode,
    surface,
    onRuntimeModeChange
  ]);

  useEffect(() => {
    runtimeEnvRef.current = runtimeEnv;
    sceneStateRef.current?.updateRuntimeEnv({
      wordCount: runtimeEnv.wordCount,
      readingMode: runtimeEnv.readingMode,
      viewport: runtimeEnv.viewport
    });
    mountedSurfaceRef.current?.invalidate();
  }, [runtimeEnvSignature, runtimeEnv]);

  return (
    <div
      className="theme-surface-host"
      data-fishmark-theme-surface={surface}
      data-fishmark-theme-scene={descriptor.sceneId}
      data-fishmark-theme-surface-mode={mode}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="theme-surface-canvas"
      />
    </div>
  );
}

async function createLazyThemeSurfaceRuntime(): Promise<ThemeSurfaceRuntime> {
  const module = await import("../shader/theme-surface-runtime");
  return module.createThemeSurfaceRuntime();
}
