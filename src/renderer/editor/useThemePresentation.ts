import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { AppNotification } from "../../shared/app-update";
import type { Preferences } from "../../shared/preferences";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";
import { createThemePackageRuntime } from "../theme-package-runtime";
import { applyThemeRuntimeEnv, clearThemeRuntimeEnv } from "../theme-runtime-env";
import { applyThemeParameterCssVariables, clearThemeParameterCssVariables } from "../theme-style-runtime";
import { shouldWarnForThemeDynamicFallback, type ThemeDynamicAggregateMode } from "./theme-dynamic-mode";
import { resolveActiveThemePackageManifest, useThemeController, type ResolvedThemeMode } from "./useThemeController";
const THEME_ATTRIBUTE = "data-fishmark-theme";
const UI_FONT_FAMILY_CSS_VAR = "--fishmark-ui-font-family";
const UI_FONT_SIZE_CSS_VAR = "--fishmark-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--fishmark-document-font-family";
const DOCUMENT_CJK_FONT_FAMILY_CSS_VAR = "--fishmark-document-cjk-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--fishmark-document-font-size";
const THEME_DYNAMIC_MODE_ATTRIBUTE = "data-fishmark-theme-dynamic-mode";
const THEME_DYNAMIC_FALLBACK_MESSAGE = "主题动态效果已自动关闭，已回退到静态样式。";
function applyPreferencesToDocument(
  root: HTMLElement,
  preferences: Preferences,
  resolvedThemeMode: ResolvedThemeMode
): void {
  root.setAttribute(THEME_ATTRIBUTE, resolvedThemeMode);
  root.style.colorScheme = resolvedThemeMode;

  if (preferences.ui.fontFamily) {
    root.style.setProperty(UI_FONT_FAMILY_CSS_VAR, preferences.ui.fontFamily);
  } else {
    root.style.removeProperty(UI_FONT_FAMILY_CSS_VAR);
  }

  if (preferences.ui.fontSize !== null) {
    root.style.setProperty(UI_FONT_SIZE_CSS_VAR, `${preferences.ui.fontSize}px`);
  } else {
    root.style.removeProperty(UI_FONT_SIZE_CSS_VAR);
  }

  if (preferences.document.fontFamily) {
    root.style.setProperty(DOCUMENT_FONT_FAMILY_CSS_VAR, preferences.document.fontFamily);
  } else {
    root.style.removeProperty(DOCUMENT_FONT_FAMILY_CSS_VAR);
  }

  if (preferences.document.cjkFontFamily) {
    root.style.setProperty(DOCUMENT_CJK_FONT_FAMILY_CSS_VAR, preferences.document.cjkFontFamily);
  } else {
    root.style.removeProperty(DOCUMENT_CJK_FONT_FAMILY_CSS_VAR);
  }

  if (preferences.document.fontSize !== null) {
    root.style.setProperty(DOCUMENT_FONT_SIZE_CSS_VAR, `${preferences.document.fontSize}px`);
  } else {
    root.style.removeProperty(DOCUMENT_FONT_SIZE_CSS_VAR);
  }
}

function clearDocumentPreferences(root: HTMLElement): void {
  root.removeAttribute(THEME_ATTRIBUTE);
  root.style.removeProperty("color-scheme");
  root.style.removeProperty(UI_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(UI_FONT_SIZE_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(DOCUMENT_CJK_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_SIZE_CSS_VAR);
  clearThemeParameterCssVariables(root);
}

function applyThemeDynamicModeToDocument(
  root: HTMLElement,
  mode: ThemeDynamicAggregateMode
): void {
  root.setAttribute(THEME_DYNAMIC_MODE_ATTRIBUTE, mode);
}

function clearThemeDynamicModeFromDocument(root: HTMLElement): void {
  root.removeAttribute(THEME_DYNAMIC_MODE_ATTRIBUTE);
}


export function useThemePresentation({ preferences, themePackages, themePackageCatalogState, isRefreshingThemePackages, currentDocumentWordCount, isDocumentReadingMode, controlledTitlebarEnabled, showNotification }: {
  preferences: Preferences;
  themePackages: Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>;
  themePackageCatalogState: "loading" | "loaded" | "failed";
  isRefreshingThemePackages: boolean;
  currentDocumentWordCount: number;
  isDocumentReadingMode: boolean;
  controlledTitlebarEnabled: boolean;
  showNotification: (notification: AppNotification) => void;
}) {
  const [workbenchRuntime, setWorkbenchRuntime] = useState<{ key: string; mode: ThemeSurfaceRuntimeMode | null }>({ key: "", mode: null });
  const [titlebarRuntime, setTitlebarRuntime] = useState<{ key: string; mode: ThemeSurfaceRuntimeMode | null }>({ key: "", mode: null });
  const workbenchSurfaceRuntimeMode = workbenchRuntime.mode;
  const titlebarSurfaceRuntimeMode = titlebarRuntime.mode;
  const themePackageRuntimeRef = useRef<ReturnType<typeof createThemePackageRuntime> | null>(null);
  const lastThemeNotificationKeyRef = useRef<string | null>(null);
  const lastThemeDynamicNotificationKeyRef = useRef<string | null>(null);
  const {
    activeThemeParameterOverrides,
    activeThemePackageResolution,
    activeTitlebarSurface,
    activeWorkbenchSurface,
    createThemeRuntimeEnv,
    resolvedThemeMode,
    themeDynamicMode,
    themeRuntimeEnv,
    themeWarningMessage
  } = useThemeController({
    preferences,
    themePackages,
    themePackageCatalogState,
    isRefreshingThemePackages,
    currentDocumentWordCount,
    isDocumentReadingMode,
    controlledTitlebarEnabled,
    workbenchSurfaceRuntimeMode,
    titlebarSurfaceRuntimeMode
  });
  const activeWorkbenchChannel0Src = activeWorkbenchSurface?.channels?.["0"]?.src ?? null;
  const activeTitlebarChannel0Src = activeTitlebarSurface?.channels?.["0"]?.src ?? null;
  const syncThemeRuntimeEnv = useEffectEvent((themeMode: ResolvedThemeMode = resolvedThemeMode): void => {
    applyThemeRuntimeEnv(document.documentElement, createThemeRuntimeEnv(themeMode));
  });
  const workbenchKey = JSON.stringify([activeWorkbenchSurface?.sceneId, activeWorkbenchSurface?.shaderUrl, activeWorkbenchChannel0Src, preferences.theme.effectsMode]);
  const titlebarKey = JSON.stringify([activeTitlebarSurface?.sceneId, activeTitlebarSurface?.shaderUrl, activeTitlebarChannel0Src, controlledTitlebarEnabled, preferences.theme.effectsMode]);
  // A surface identity change invalidates only its local runtime feedback.
  if (workbenchRuntime.key !== workbenchKey) setWorkbenchRuntime({ key: workbenchKey, mode: null });
  if (titlebarRuntime.key !== titlebarKey) setTitlebarRuntime({ key: titlebarKey, mode: null });

  const handleWorkbenchSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setWorkbenchRuntime((current) => current.key !== workbenchKey || current.mode === mode ? current : { key: workbenchKey, mode });
  }, [workbenchKey]);
  const handleTitlebarSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setTitlebarRuntime((current) => current.key !== titlebarKey || current.mode === mode ? current : { key: titlebarKey, mode });
  }, [titlebarKey]);

  useEffect(() => {
    const handleResize = () => syncThemeRuntimeEnv();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    syncThemeRuntimeEnv(resolvedThemeMode);
  }, [currentDocumentWordCount, isDocumentReadingMode, resolvedThemeMode]);

  useEffect(() => {
    const themePackageRuntime =
      themePackageRuntimeRef.current ?? createThemePackageRuntime(document);
    themePackageRuntimeRef.current = themePackageRuntime;

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      const activeThemeManifest = resolveActiveThemePackageManifest(
        preferences.theme.selectedId,
        themePackages,
        resolvedThemeMode
      );

      applyPreferencesToDocument(root, preferences, resolvedThemeMode);
      applyThemeParameterCssVariables(root, activeThemeManifest, activeThemeParameterOverrides);
      themePackageRuntime.applyPackage(
        activeThemePackageResolution.descriptor,
        resolvedThemeMode
      );
    };

    applyCurrentTheme();
  }, [
    activeThemePackageResolution.descriptor,
    activeThemeParameterOverrides,
    preferences,
    resolvedThemeMode,
    themePackages
  ]);

  useEffect(() => {
    if (!themeWarningMessage) {
      lastThemeNotificationKeyRef.current = null;
      return;
    }

    const notificationKey = `${activeThemePackageResolution.requestedId ?? "default"}:${activeThemePackageResolution.resolvedMode}:${activeThemePackageResolution.fallbackReason ?? "none"}`;

    if (lastThemeNotificationKeyRef.current === notificationKey) {
      return;
    }

    lastThemeNotificationKeyRef.current = notificationKey;
    showNotification({
      kind: "warning",
      message: themeWarningMessage
    });
  }, [
    activeThemePackageResolution.fallbackReason,
    activeThemePackageResolution.requestedId,
    activeThemePackageResolution.resolvedMode,
    showNotification,
    themeWarningMessage
  ]);

  useEffect(() => {
    const root = document.documentElement;
    applyThemeDynamicModeToDocument(root, themeDynamicMode);

    if (!shouldWarnForThemeDynamicFallback(themeDynamicMode)) {
      lastThemeDynamicNotificationKeyRef.current = null;
      return () => {
        clearThemeDynamicModeFromDocument(root);
      };
    }

    const notificationKey = `${activeThemePackageResolution.requestedId ?? "default"}:${activeThemePackageResolution.resolvedMode}:${themeDynamicMode}`;

    if (lastThemeDynamicNotificationKeyRef.current !== notificationKey) {
      lastThemeDynamicNotificationKeyRef.current = notificationKey;
      showNotification({
        kind: "warning",
        message: THEME_DYNAMIC_FALLBACK_MESSAGE
      });
    }

    return () => {
      clearThemeDynamicModeFromDocument(root);
    };
  }, [
    activeThemePackageResolution.requestedId,
    activeThemePackageResolution.resolvedMode,
    showNotification,
    themeDynamicMode
  ]);

  useEffect(() => () => {
    themePackageRuntimeRef.current?.clear();
    clearThemeDynamicModeFromDocument(document.documentElement);
    clearThemeRuntimeEnv(document.documentElement);
    clearDocumentPreferences(document.documentElement);
  }, []);

  return { activeTitlebarSurface, activeWorkbenchSurface, resolvedThemeMode, themeRuntimeEnv, handleWorkbenchSurfaceRuntimeModeChange, handleTitlebarSurfaceRuntimeModeChange };
}
