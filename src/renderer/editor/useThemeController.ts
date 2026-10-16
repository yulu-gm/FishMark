import { useEffect, useMemo, useState } from "react";

import { createPreviewAssetUrl } from "../../shared/preview-asset-url";
import type { Preferences, ThemeMode } from "../../shared/preferences";
import type { ThemePackageManifest, ThemeSurfaceSlot } from "../../shared/theme-package";
import {
  normalizeThemePackageDescriptor,
  resolveActiveThemePackage
} from "../theme-package-catalog";
import {
  resolveEffectiveThemeParameterValue
} from "../theme-style-runtime";
import {
  buildThemeRuntimeEnv,
  type ThemeRuntimeEnv
} from "../theme-runtime-env";
import type { ThemeSurfaceHostDescriptor } from "./ThemeSurfaceHost";
import {
  resolveThemeDynamicAggregateMode,
  type ThemeDynamicAggregateMode
} from "./theme-dynamic-mode";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";

export type ResolvedThemeMode = Exclude<ThemeMode, "system">;
export type ThemePackageEntry = Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>[number];

export const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  const mediaQuery = window.matchMedia?.(DARK_MODE_MEDIA_QUERY);
  return mediaQuery?.matches ? "dark" : "light";
}

export function getWindowViewport(): ThemeRuntimeEnv["viewport"] {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

export function resolveThemeWarningMessage(
  resolution: ReturnType<typeof resolveActiveThemePackage>
): string | null {
  if (resolution.fallbackReason === "unsupported-mode") {
    return `该主题不支持${resolution.resolvedMode === "light" ? "浅色" : "深色"}模式，已回退到 FishMark 默认。`;
  }

  if (resolution.fallbackReason === "missing-theme") {
    return "已配置主题未找到，已回退到 FishMark 默认。";
  }

  return null;
}

function resolveSurfaceChannels(
  channels: ThemeSurfaceHostDescriptor["channels"] | undefined
): ThemeSurfaceHostDescriptor["channels"] | undefined {
  const channel0 = channels?.["0"];

  if (!channel0 || channel0.type !== "image") {
    return undefined;
  }

  return {
    "0": {
      type: "image",
      src: createPreviewAssetUrl(channel0.src)
    }
  };
}

export function composeEffectiveUniforms(
  manifest: ThemePackageManifest,
  parameterOverrides: Record<string, number> | undefined
): Record<string, number> {
  const uniforms: Record<string, number> = {
    ...(manifest.scene?.sharedUniforms ?? {})
  };

  const parameters = manifest.parameters ?? [];
  for (const parameter of parameters) {
    if (!parameter.uniform) {
      continue;
    }

    uniforms[parameter.uniform] = resolveEffectiveThemeParameterValue(parameter, parameterOverrides);
  }

  return uniforms;
}

export function resolveActiveThemePackageManifest(
  selectedId: string | null,
  themePackages: ThemePackageEntry[],
  mode: ResolvedThemeMode
): ThemePackageManifest | null {
  if (!selectedId) {
    return null;
  }

  const activeThemePackage = themePackages.find((entry) => entry.id === selectedId) ?? null;

  if (!activeThemePackage || !activeThemePackage.manifest.supports[mode]) {
    return null;
  }

  return activeThemePackage.manifest;
}

export function resolveActiveThemeSurface(
  selectedId: string | null,
  themePackages: ThemePackageEntry[],
  mode: ResolvedThemeMode,
  surface: ThemeSurfaceSlot,
  parameterOverrides: Record<string, number> | undefined
): ThemeSurfaceHostDescriptor | null {
  if (!selectedId) {
    return null;
  }

  const activeThemePackage = themePackages.find((entry) => entry.id === selectedId) ?? null;

  if (!activeThemePackage || !activeThemePackage.manifest.supports[mode]) {
    return null;
  }

  const fragmentSurface = activeThemePackage.manifest.surfaces[surface];
  const scene = activeThemePackage.manifest.scene;

  if (!fragmentSurface || fragmentSurface.kind !== "fragment" || !scene) {
    return null;
  }

  if (fragmentSurface.scene !== scene.id) {
    return null;
  }

  return {
    kind: "fragment",
    sceneId: scene.id,
    shaderUrl: createPreviewAssetUrl(fragmentSurface.shader),
    channels: resolveSurfaceChannels(fragmentSurface.channels),
    renderSettings: {
      ...(scene.render ? { scene: scene.render } : {}),
      ...(fragmentSurface.render ? { surface: fragmentSurface.render } : {})
    },
    sharedUniforms: composeEffectiveUniforms(activeThemePackage.manifest, parameterOverrides)
  };
}

export function useThemeController({
  preferences,
  themePackages,
  themePackageCatalogState,
  isRefreshingThemePackages,
  currentDocumentWordCount,
  controlledTitlebarEnabled,
  workbenchSurfaceRuntimeMode,
  titlebarSurfaceRuntimeMode
}: {
  preferences: Preferences;
  themePackages: ThemePackageEntry[];
  themePackageCatalogState: "loading" | "loaded" | "failed";
  isRefreshingThemePackages: boolean;
  currentDocumentWordCount: number;
  controlledTitlebarEnabled: boolean;
  workbenchSurfaceRuntimeMode: ThemeSurfaceRuntimeMode | null;
  titlebarSurfaceRuntimeMode: ThemeSurfaceRuntimeMode | null;
}) {
  const [systemThemeMode, setSystemThemeMode] = useState<ResolvedThemeMode>(() =>
    resolveThemeMode("system")
  );
  const resolvedThemeMode =
    preferences.theme.mode === "system" ? systemThemeMode : preferences.theme.mode;
  const themeRuntimeEnv = useMemo<ThemeRuntimeEnv>(
    () =>
      buildThemeRuntimeEnv({
        wordCount: currentDocumentWordCount,
        // Keep the theme ABI field while the workspace chrome is permanent.
        isReadingMode: false,
        themeMode: resolvedThemeMode,
        viewport: getWindowViewport()
      }),
    [currentDocumentWordCount, resolvedThemeMode]
  );
  const activeThemePackages = useMemo(
    () => themePackages.map(normalizeThemePackageDescriptor),
    [themePackages]
  );
  const activeThemePackageResolution = useMemo(
    () =>
      resolveActiveThemePackage(
        preferences.theme.selectedId,
        activeThemePackages,
        resolvedThemeMode
      ),
    [activeThemePackages, preferences.theme.selectedId, resolvedThemeMode]
  );
  const themeWarningMessage =
    activeThemePackageResolution.fallbackReason === "missing-theme" &&
    (themePackageCatalogState !== "loaded" || isRefreshingThemePackages)
      ? null
      : resolveThemeWarningMessage(activeThemePackageResolution);
  const activeThemeParameterOverrides = useMemo<Record<string, number> | undefined>(() => {
    if (!preferences.theme.selectedId) {
      return undefined;
    }

    return preferences.theme.parameters?.[preferences.theme.selectedId];
  }, [preferences.theme.parameters, preferences.theme.selectedId]);
  const activeWorkbenchSurface = useMemo(
    () =>
      preferences.theme.effectsMode === "off"
        ? null
        : resolveActiveThemeSurface(
            preferences.theme.selectedId,
            themePackages,
            resolvedThemeMode,
            "workbenchBackground",
            activeThemeParameterOverrides
          ),
    [
      preferences.theme.effectsMode,
      preferences.theme.selectedId,
      resolvedThemeMode,
      themePackages,
      activeThemeParameterOverrides
    ]
  );
  const activeTitlebarSurface = useMemo(
    () =>
      !controlledTitlebarEnabled || preferences.theme.effectsMode === "off"
        ? null
        : resolveActiveThemeSurface(
            preferences.theme.selectedId,
            themePackages,
            resolvedThemeMode,
            "titlebarBackdrop",
            activeThemeParameterOverrides
          ),
    [
      preferences.theme.effectsMode,
      preferences.theme.selectedId,
      resolvedThemeMode,
      themePackages,
      controlledTitlebarEnabled,
      activeThemeParameterOverrides
    ]
  );
  const themeDynamicMode = useMemo<ThemeDynamicAggregateMode>(
    () =>
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: activeWorkbenchSurface !== null,
          mode: workbenchSurfaceRuntimeMode
        },
        titlebar: {
          active: activeTitlebarSurface !== null,
          mode: titlebarSurfaceRuntimeMode
        }
      }),
    [
      activeTitlebarSurface,
      activeWorkbenchSurface,
      titlebarSurfaceRuntimeMode,
      workbenchSurfaceRuntimeMode
    ]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(DARK_MODE_MEDIA_QUERY);

    if (!mediaQuery) {
      return undefined;
    }

    const applySystemThemeMode = () => {
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    };

    applySystemThemeMode();
    mediaQuery.addEventListener("change", applySystemThemeMode);
    return () => mediaQuery.removeEventListener("change", applySystemThemeMode);
  }, []);

  function createThemeRuntimeEnv(themeMode: ResolvedThemeMode = resolvedThemeMode): ThemeRuntimeEnv {
    return buildThemeRuntimeEnv({
      wordCount: currentDocumentWordCount,
      isReadingMode: false,
      themeMode,
      viewport: getWindowViewport()
    });
  }

  return {
    activeThemeParameterOverrides,
    activeThemePackageResolution,
    activeTitlebarSurface,
    activeWorkbenchSurface,
    createThemeRuntimeEnv,
    resolvedThemeMode,
    themeDynamicMode,
    themeRuntimeEnv,
    themeWarningMessage
  };
}

export type { ThemeSurfaceHostDescriptor };
