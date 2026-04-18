import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ThemeEffectsMode,
  ThemeSurfaceRenderSettings,
  ThemeSurfaceSlot
} from "../../shared/theme-package";
import { createThemeSceneState, type ThemeAppearanceMode } from "../shader/theme-scene-state";
import {
  createThemeSurfaceRuntime,
  type ThemeSurfaceRuntimeChannels,
  type ThemeSurfaceRuntimeMode
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
  effectsMode: ThemeEffectsMode;
  onRuntimeModeChange?: (mode: ThemeSurfaceRuntimeMode) => void;
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

export function ThemeSurfaceHost({
  surface,
  descriptor,
  themeMode,
  effectsMode,
  onRuntimeModeChange
}: ThemeSurfaceHostProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef(createThemeSurfaceRuntime());
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

  useEffect(() => {
    let isDisposed = false;
    let mountedSurface: { unmount: () => void } | null = null;
    const abortController = new AbortController();

    async function loadAndMount(): Promise<void> {
      try {
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
          sharedUniforms
        });
        const result = await runtimeRef.current.mount({
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

  return (
    <div
      className="theme-surface-host"
      data-yulora-theme-surface={surface}
      data-yulora-theme-scene={descriptor.sceneId}
      data-yulora-theme-surface-mode={mode}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="theme-surface-canvas"
      />
    </div>
  );
}
