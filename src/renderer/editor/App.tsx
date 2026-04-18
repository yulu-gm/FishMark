import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";

import type { ActiveBlockState } from "@yulora/editor-core";
import type { AppNotification, AppUpdateState } from "../../shared/app-update";
import { createPreviewAssetUrl } from "../../shared/preview-asset-url";
import type {
  ThemePackageManifest,
  ThemeParameterDescriptor,
  ThemeSurfaceSlot
} from "../../shared/theme-package";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesUpdate,
  type ThemeMode
} from "../../shared/preferences";
import { CodeEditorView, type CodeEditorHandle } from "../code-editor-view";
import { createEditorTestDriver } from "../editor-test-driver";
import { deriveOutlineItems, type OutlineItem } from "../outline";
import { createThemePackageRuntime } from "../theme-package-runtime";
import {
  normalizeThemePackageDescriptor,
  resolveLegacyThemeFamilyId,
  resolveActiveThemePackage,
  type ThemePackageRuntimeEntry
} from "../theme-package-catalog";
import {
  type AppState,
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  createNewMarkdownDocumentState,
  createInitialAppState,
  startAutosavingDocument,
  startManualSavingDocument,
  startOpeningMarkdownFile
} from "../document-state";
import { getDocumentMetrics } from "../document-metrics";
import {
  ThemeSurfaceHost,
  type ThemeSurfaceHostDescriptor
} from "./ThemeSurfaceHost";
import { TitlebarHost } from "./TitlebarHost";
import {
  normalizeTitlebarLayout,
  resolveDefaultTitlebarLayout
} from "./titlebar-layout";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";
import {
  resolveThemeDynamicAggregateMode,
  shouldWarnForThemeDynamicFallback,
  type ThemeDynamicAggregateMode
} from "./theme-dynamic-mode";

const SettingsView = lazy(async () => {
  const module = await import("./settings-view");
  return { default: module.SettingsView };
});

type ResolvedThemeMode = Exclude<ThemeMode, "system">;
type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];
type ThemePackageEntry = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_ATTRIBUTE = "data-yulora-theme";
const UI_FONT_SIZE_CSS_VAR = "--yulora-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--yulora-document-font-family";
const DOCUMENT_CJK_FONT_FAMILY_CSS_VAR = "--yulora-document-cjk-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--yulora-document-font-size";
const THEME_DYNAMIC_MODE_ATTRIBUTE = "data-yulora-theme-dynamic-mode";
const THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE = "data-yulora-theme-parameter-css-variables";
const THEME_PARAMETER_CSS_VAR_PREFIX = "--yulora-theme-parameter-";
const OUTLINE_EXIT_ANIMATION_MS = 180;
const SETTINGS_DRAWER_EXIT_ANIMATION_MS = 180;
const APP_NOTIFICATION_DURATION_MS = 3000;
const APP_NOTIFICATION_EXIT_ANIMATION_MS = 180;
const THEME_DYNAMIC_FALLBACK_MESSAGE = "主题动态效果已自动关闭，已回退到静态样式。";
const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown"] as const;

function isMarkdownFilePath(targetPath: string): boolean {
  const normalizedPath = targetPath.trim().toLowerCase();

  return MARKDOWN_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

function getDroppedMarkdownPath(
  yulora: Window["yulora"],
  dataTransfer: DataTransfer | null
): string | null {
  const file = dataTransfer?.files?.[0];

  if (!(file instanceof File)) {
    return null;
  }

  const filePath = yulora.getPathForDroppedFile(file);

  if (typeof filePath !== "string" || !isMarkdownFilePath(filePath)) {
    return null;
  }

  return filePath;
}

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  if ((dataTransfer.files?.length ?? 0) > 0) {
    return true;
  }

  return Array.from(dataTransfer.types ?? []).includes("Files");
}

type AppNotificationBannerState = "hidden" | "open" | "closing";
type FocusModeSource = "manual" | "auto";

function supportsControlledTitlebar(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

function isAutoFocusKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return (
    event.key.length === 1 ||
    event.key === "Enter" ||
    event.key === "Backspace" ||
    event.key === "Delete" ||
    event.key === "Tab"
  );
}

function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  const mediaQuery = window.matchMedia?.(DARK_MODE_MEDIA_QUERY);
  return mediaQuery?.matches ? "dark" : "light";
}

function applyPreferencesToDocument(
  root: HTMLElement,
  preferences: Preferences,
  resolvedThemeMode: ResolvedThemeMode
): void {
  root.setAttribute(THEME_ATTRIBUTE, resolvedThemeMode);
  root.style.colorScheme = resolvedThemeMode;

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

function clearThemeParameterCssVariables(root: HTMLElement): void {
  const variables = root.getAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE);

  if (!variables) {
    return;
  }

  for (const variable of variables.split(",")) {
    const trimmed = variable.trim();

    if (trimmed.length === 0) {
      continue;
    }

    root.style.removeProperty(trimmed);
  }

  root.removeAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE);
}

function toThemeParameterCssVariable(parameterId: string): string {
  return `${THEME_PARAMETER_CSS_VAR_PREFIX}${parameterId}`;
}

function clearDocumentPreferences(root: HTMLElement): void {
  root.removeAttribute(THEME_ATTRIBUTE);
  root.style.removeProperty("color-scheme");
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

function toLegacyRuntimeThemePackageEntry(
  theme: ThemeCatalogEntry,
  resolvedThemeMode: ResolvedThemeMode
): ThemePackageRuntimeEntry {
  const mode = theme.modes[resolvedThemeMode];
  const tokens: ThemePackageRuntimeEntry["tokens"] = {};
  const styles: ThemePackageRuntimeEntry["styles"] = {};

  if (mode.partUrls.tokens) {
    tokens[resolvedThemeMode] = mode.partUrls.tokens;
  }

  if (mode.partUrls.ui) {
    styles.ui = mode.partUrls.ui;
  }

  if (mode.partUrls.editor) {
    styles.editor = mode.partUrls.editor;
  }

  if (mode.partUrls.markdown) {
    styles.markdown = mode.partUrls.markdown;
  }

  return {
    id: theme.id,
    source: theme.source,
    supports: {
      light: theme.modes.light.available,
      dark: theme.modes.dark.available
    },
    tokens,
    styles
  };
}

function resolveThemeWarningMessage(
  resolution: ReturnType<typeof resolveActiveThemePackage>
): string | null {
  if (resolution.fallbackReason === "unsupported-mode") {
    return `该主题不支持${resolution.resolvedMode === "light" ? "浅色" : "深色"}模式，已回退到 Yulora 默认。`;
  }

  if (resolution.fallbackReason === "missing-theme") {
    return "已配置主题未找到，已回退到 Yulora 默认。";
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

function resolveParameterDefaultValue(parameter: ThemeParameterDescriptor): number {
  if (parameter.type === "toggle") {
    return parameter.default ? 1 : 0;
  }

  return parameter.default;
}

function resolveEffectiveThemeParameterValue(
  parameter: ThemeParameterDescriptor,
  parameterOverrides: Record<string, number> | undefined
): number {
  const overrideValue = parameterOverrides?.[parameter.id];

  if (typeof overrideValue !== "number" || !Number.isFinite(overrideValue)) {
    return resolveParameterDefaultValue(parameter);
  }

  if (parameter.type === "toggle") {
    return overrideValue > 0.5 ? 1 : 0;
  }

  return Math.min(Math.max(overrideValue, parameter.min), parameter.max);
}

function applyThemeParameterCssVariables(
  root: HTMLElement,
  manifest: ThemePackageManifest | null,
  parameterOverrides: Record<string, number> | undefined
): void {
  clearThemeParameterCssVariables(root);

  if (!manifest) {
    return;
  }

  const appliedVariables: string[] = [];

  for (const parameter of manifest.parameters ?? []) {
    const variableName = toThemeParameterCssVariable(parameter.id);
    root.style.setProperty(
      variableName,
      String(resolveEffectiveThemeParameterValue(parameter, parameterOverrides))
    );
    appliedVariables.push(variableName);
  }

  if (appliedVariables.length > 0) {
    root.setAttribute(THEME_PARAMETER_CSS_VARIABLES_ATTRIBUTE, appliedVariables.join(","));
  }
}

/**
 * Compose the effective shader uniform map for a theme by layering:
 *   1. `scene.sharedUniforms` declared in the manifest,
 *   2. defaults from each shader-bound parameter (keyed by `uniform`),
 *   3. user overrides from `preferences.theme.parameters[themeId]` (keyed by
 *      parameter id, mapped to the parameter's `uniform`).
 *
 * Parameters without a `uniform` remain UI/CSS-only and are intentionally
 * excluded from the shader pipeline.
 */
function composeEffectiveUniforms(
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

function resolveActiveThemePackageManifest(
  selectedId: string | null,
  themePackages: ThemePackageEntry[],
  mode: ResolvedThemeMode
): ThemePackageManifest | null {
  if (!selectedId) {
    return null;
  }

  const legacyFamilyId = resolveLegacyThemeFamilyId(selectedId);
  const activeThemePackage =
    themePackages.find((entry) => entry.id === selectedId) ??
    (legacyFamilyId ? themePackages.find((entry) => entry.id === legacyFamilyId) : null) ??
    null;

  if (!activeThemePackage || !activeThemePackage.manifest.supports[mode]) {
    return null;
  }

  return activeThemePackage.manifest;
}

function resolveActiveThemeSurface(
  selectedId: string | null,
  themePackages: ThemePackageEntry[],
  mode: ResolvedThemeMode,
  surface: ThemeSurfaceSlot,
  parameterOverrides: Record<string, number> | undefined
): ThemeSurfaceHostDescriptor | null {
  if (!selectedId) {
    return null;
  }

  const legacyFamilyId = resolveLegacyThemeFamilyId(selectedId);
  const activeThemePackage =
    themePackages.find((entry) => entry.id === selectedId) ??
    (legacyFamilyId ? themePackages.find((entry) => entry.id === legacyFamilyId) : null) ??
    null;

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
    sharedUniforms: composeEffectiveUniforms(activeThemePackage.manifest, parameterOverrides)
  };
}

function SettingsDrawerFallback({ surfaceState }: { surfaceState: "open" | "closing" }) {
  return (
    <section
      className="settings-shell"
      data-yulora-panel="settings-drawer"
      data-yulora-surface="floating-drawer"
      data-state={surfaceState}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
    />
  );
}

export default function EditorApp() {
  const yulora = window.yulora;

  if (!yulora) {
    return <BridgeUnavailableApp />;
  }

  return <EditorShell yulora={yulora} />;
}

function EditorShell({ yulora }: { yulora: Window["yulora"] }) {
  const [state, setState] = useState(createInitialAppState);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isOutlineClosing, setIsOutlineClosing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const [focusModeSource, setFocusModeSource] = useState<FocusModeSource | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [fontFamilies, setFontFamilies] = useState<string[]>([]);
  const [themes, setThemes] = useState<ThemeCatalogEntry[]>([]);
  const [themePackages, setThemePackages] = useState<
    Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>
  >([]);
  const [themePackageCatalogState, setThemePackageCatalogState] = useState<
    "loading" | "loaded" | "failed"
  >("loading");
  const [isRefreshingThemePackages, setIsRefreshingThemePackages] = useState(false);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({
    kind: "idle"
  });
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [notificationState, setNotificationState] = useState<AppNotificationBannerState>("hidden");
  const [workbenchSurfaceRuntimeMode, setWorkbenchSurfaceRuntimeMode] = useState<
    ThemeSurfaceRuntimeMode | null
  >(null);
  const [titlebarSurfaceRuntimeMode, setTitlebarSurfaceRuntimeMode] = useState<
    ThemeSurfaceRuntimeMode | null
  >(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorContentRef = useRef("");
  const activeBlockStateRef = useRef<ActiveBlockState | null>(null);
  const startupOpenPathRef = useRef(yulora.startupOpenPath);
  const stateRef = useRef(state);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveReplayRef = useRef(false);
  const inFlightSaveOriginRef = useRef<"manual" | "autosave" | null>(null);
  const preferencesRef = useRef<Preferences>(DEFAULT_PREFERENCES);
  const settingsEntryRef = useRef<HTMLButtonElement | null>(null);
  const settingsOpenOriginRef = useRef<"editor" | null>(null);
  const shouldRestoreEditorFocusRef = useRef(false);
  const pendingFocusRestoreRef = useRef<"editor" | "settings-entry" | null>(null);
  const themePackageRuntimeRef = useRef<ReturnType<typeof createThemePackageRuntime> | null>(null);
  const outlineCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThemeNotificationKeyRef = useRef<string | null>(null);
  const lastThemeDynamicNotificationKeyRef = useRef<string | null>(null);
  const fontFamilyLoadStateRef = useRef<"idle" | "loading" | "loaded">("idle");
  const currentDocumentContent = state.currentDocument
    ? (editorContentRef.current || state.currentDocument.content)
    : "";
  const currentDocumentMetrics = state.currentDocument
    ? getDocumentMetrics(currentDocumentContent)
    : null;
  const isDocumentOpen = Boolean(state.currentDocument);
  const isFocusModeActive = focusModeSource !== null;
  const isManualFocusToggleEnabled = preferences.focus.triggerMode === "manual";
  const isOutlinePanelVisible = isOutlineOpen || isOutlineClosing;
  const isSettingsDrawerVisible = isSettingsOpen || isSettingsClosing;
  const hintText =
    state.openState === "opening"
      ? "Opening document..."
      : "Use File > Open... to load a Markdown document.";
  const headerEyebrow = isDocumentOpen ? "Current document" : "Yulora";
  const headerTitle = isDocumentOpen
    ? state.currentDocument?.name ?? "Untitled"
    : "Local-first Markdown writing";
  const headerDetail =
    state.openState === "opening"
      ? "Opening document..."
      : isDocumentOpen
        ? state.currentDocument?.path ?? "Not saved yet."
        : "Markdown remains the source of truth, and the writing canvas stays calm and stable.";
  const saveStatusLabel =
    state.saveState === "manual-saving"
      ? "Saving changes..."
      : state.saveState === "autosaving"
        ? "Autosaving..."
        : state.currentDocument && !state.currentDocument.path && !state.isDirty
          ? "Not saved yet"
        : state.isDirty
          ? "Unsaved changes"
          : "All changes saved";
  const appUpdateStatusLabel = appUpdateState.kind === "downloading"
    ? `正在下载更新${Number.isFinite(appUpdateState.percent) ? ` ${Math.round(appUpdateState.percent)}%` : "…"}`
    : null;
  const controlledTitlebarEnabled = supportsControlledTitlebar(yulora.platform);
  const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);
  const activeThemePackages =
    themePackages.length > 0
      ? themePackages.map(normalizeThemePackageDescriptor)
      : themes.map((theme) => toLegacyRuntimeThemePackageEntry(theme, resolvedThemeMode));
  const activeThemePackageResolution = resolveActiveThemePackage(
    preferences.theme.selectedId,
    activeThemePackages,
    resolvedThemeMode
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
  const titlebarLayout = useMemo(
    () => normalizeTitlebarLayout(resolveDefaultTitlebarLayout(yulora.platform)),
    [yulora.platform]
  );

  function applyState(updater: (current: AppState) => AppState): void {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }

  function getEditorContent(): string {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }

  const handleWorkbenchSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setWorkbenchSurfaceRuntimeMode((current) => (current === mode ? current : mode));
  }, []);

  const handleTitlebarSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setTitlebarSurfaceRuntimeMode((current) => (current === mode ? current : mode));
  }, []);

  useEffect(() => {
    setWorkbenchSurfaceRuntimeMode(null);
  }, [
    activeWorkbenchSurface?.sceneId,
    activeWorkbenchSurface?.shaderUrl,
    activeWorkbenchSurface?.channels?.["0"]?.src,
    preferences.theme.effectsMode
  ]);

  useEffect(() => {
    setTitlebarSurfaceRuntimeMode(null);
  }, [
    activeTitlebarSurface?.sceneId,
    activeTitlebarSurface?.shaderUrl,
    activeTitlebarSurface?.channels?.["0"]?.src,
    controlledTitlebarEnabled,
    preferences.theme.effectsMode
  ]);

  function clearAutosaveTimer(): void {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }

  function clearOutlineCloseTimer(): void {
    if (outlineCloseTimerRef.current !== null) {
      clearTimeout(outlineCloseTimerRef.current);
      outlineCloseTimerRef.current = null;
    }
  }

  function clearSettingsCloseTimer(): void {
    if (settingsCloseTimerRef.current !== null) {
      clearTimeout(settingsCloseTimerRef.current);
      settingsCloseTimerRef.current = null;
    }
  }

  function clearFocusIdleTimer(): void {
    if (focusIdleTimerRef.current !== null) {
      clearTimeout(focusIdleTimerRef.current);
      focusIdleTimerRef.current = null;
    }
  }

  const clearNotificationTimers = useCallback((): void => {
    if (notificationHideTimerRef.current !== null) {
      clearTimeout(notificationHideTimerRef.current);
      notificationHideTimerRef.current = null;
    }

    if (notificationCloseTimerRef.current !== null) {
      clearTimeout(notificationCloseTimerRef.current);
      notificationCloseTimerRef.current = null;
    }
  }, []);

  const scheduleFocusIdle = useCallback((): void => {
    clearFocusIdleTimer();

    if (
      preferencesRef.current.focus.triggerMode !== "auto" ||
      !stateRef.current.currentDocument ||
      isSettingsOpen ||
      isSettingsClosing
    ) {
      return;
    }

    focusIdleTimerRef.current = setTimeout(() => {
      focusIdleTimerRef.current = null;
      setFocusModeSource((current) => current ?? "auto");
    }, preferencesRef.current.focus.idleDelayMs);
  }, [isSettingsClosing, isSettingsOpen]);

  const exitFocusMode = useCallback((): void => {
    setFocusModeSource(null);
    scheduleFocusIdle();
  }, [scheduleFocusIdle]);

  const enterFocusMode = useCallback((source: FocusModeSource): void => {
    if (isSettingsOpen || isSettingsClosing) {
      return;
    }

    clearFocusIdleTimer();
    setFocusModeSource((current) => current ?? source);
  }, [isSettingsClosing, isSettingsOpen]);

  function toggleManualFocusMode(): void {
    if (preferencesRef.current.focus.triggerMode !== "manual" && focusModeSource !== "manual") {
      return;
    }

    if (focusModeSource !== null) {
      exitFocusMode();
      return;
    }

    enterFocusMode("manual");
  }

  const showNotification = useCallback((nextNotification: AppNotification): void => {
    clearNotificationTimers();
    setNotification(nextNotification);
    setNotificationState("open");

    if (nextNotification.kind === "loading") {
      return;
    }

    notificationHideTimerRef.current = setTimeout(() => {
      notificationHideTimerRef.current = null;
      setNotificationState("closing");
      notificationCloseTimerRef.current = setTimeout(() => {
        notificationCloseTimerRef.current = null;
        setNotificationState("hidden");
        setNotification(null);
      }, APP_NOTIFICATION_EXIT_ANIMATION_MS);
      }, APP_NOTIFICATION_DURATION_MS);
  }, [clearNotificationTimers]);

  function resetAutosaveRuntime(): void {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }

  async function runAutosave(): Promise<void> {
    clearAutosaveTimer();

    const snapshot = stateRef.current;

    if (
      !snapshot.currentDocument ||
      !snapshot.currentDocument.path ||
      !snapshot.isDirty ||
      inFlightSaveOriginRef.current
    ) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startAutosavingDocument(current));

    const result = await yulora.saveMarkdownFile({
      path: snapshot.currentDocument.path,
      content: getEditorContent()
    });

    if (result.status === "error") {
      showNotification({ kind: "error", message: AUTOSAVE_FAILED_MESSAGE });
    }

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, result);

      return result.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      void runAutosave();
    }
  }

  function scheduleAutosave(nextState: AppState): void {
    clearAutosaveTimer();

    if (!nextState.currentDocument || !nextState.currentDocument.path || !nextState.isDirty) {
      pendingAutosaveReplayRef.current = false;
      return;
    }

    if (inFlightSaveOriginRef.current) {
      pendingAutosaveReplayRef.current = true;
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, preferencesRef.current.autosave.idleDelayMs);
  }

  async function runManualSave(
    request: () => ReturnType<typeof window.yulora.saveMarkdownFile>
  ): Promise<void> {
    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || inFlightSaveOriginRef.current) {
      return;
    }

    clearAutosaveTimer();
    inFlightSaveOriginRef.current = "manual";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startManualSavingDocument(current));

    const result = await request();

    if (result.status === "error") {
      showNotification({ kind: "error", message: result.error.message });
    }

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, result);

      return result.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      scheduleAutosave(stateRef.current);
    }
  }

  const handlePreferencesSync = useEffectEvent((nextPreferences: Preferences): void => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    scheduleAutosave(stateRef.current);
    scheduleFocusIdle();
  });

  const handleLoadFontFamilies = useEffectEvent(async (): Promise<void> => {
    if (fontFamilyLoadStateRef.current !== "idle") {
      return;
    }

    fontFamilyLoadStateRef.current = "loading";

    try {
      const nextFontFamilies = await yulora.listFontFamilies();
      fontFamilyLoadStateRef.current = "loaded";
      setFontFamilies(nextFontFamilies);
    } catch {
      // Keep the dropdowns usable with their fallback options.
      fontFamilyLoadStateRef.current = "idle";
    }
  });

  const handleRefreshThemePackages = useCallback(async (): Promise<void> => {
    setIsRefreshingThemePackages(true);

    try {
      const [nextThemes, nextThemePackages] = await Promise.all([
        yulora.refreshThemes(),
        yulora.refreshThemePackages()
      ]);

      setThemes(nextThemes);
      setThemePackages(nextThemePackages);
      setThemePackageCatalogState("loaded");
    } finally {
      setIsRefreshingThemePackages(false);
    }
  }, [yulora]);

  const handleUpdatePreferences = useCallback(
    async (
      patch: PreferencesUpdate
    ): Promise<Awaited<ReturnType<Window["yulora"]["updatePreferences"]>>> => {
      const result = await yulora.updatePreferences(patch);
      preferencesRef.current = result.preferences;
      setPreferences(result.preferences);
      scheduleAutosave(stateRef.current);
      scheduleFocusIdle();
      return result;
    },
    [scheduleAutosave, scheduleFocusIdle, yulora]
  );

  function openSettingsDrawer(): void {
    setFocusModeSource(null);
    clearFocusIdleTimer();
    const activeElement = document.activeElement;
    shouldRestoreEditorFocusRef.current =
      settingsOpenOriginRef.current === "editor" ||
      (activeElement instanceof Node ? !!editorContainerRef.current?.contains(activeElement) : false);
    settingsOpenOriginRef.current = null;
    clearSettingsCloseTimer();
    setIsSettingsClosing(false);
    setIsSettingsOpen(true);
  }

  function captureSettingsOpenOrigin(): void {
    const activeElement = document.activeElement;
    settingsOpenOriginRef.current =
      activeElement instanceof Node && editorContainerRef.current?.contains(activeElement)
        ? "editor"
        : null;
  }

  function closeSettingsDrawer(): void {
    clearSettingsCloseTimer();
    setIsSettingsOpen(false);
    setIsSettingsClosing(true);

    if (shouldRestoreEditorFocusRef.current) {
      shouldRestoreEditorFocusRef.current = false;
      pendingFocusRestoreRef.current = "editor";
    } else {
      pendingFocusRestoreRef.current = "settings-entry";
    }

    settingsCloseTimerRef.current = setTimeout(() => {
      settingsCloseTimerRef.current = null;
      setIsSettingsClosing(false);
    }, SETTINGS_DRAWER_EXIT_ANIMATION_MS);
  }

  const handleEscapeCloseSettings = useEffectEvent((): void => {
    closeSettingsDrawer();
  });

  function openOutlinePanel(): void {
    clearOutlineCloseTimer();
    setIsOutlineClosing(false);
    setIsOutlineOpen(true);
  }

  function closeOutlinePanel(): void {
    clearOutlineCloseTimer();
    setIsOutlineOpen(false);
    setIsOutlineClosing(true);
    outlineCloseTimerRef.current = setTimeout(() => {
      outlineCloseTimerRef.current = null;
      setIsOutlineClosing(false);
    }, OUTLINE_EXIT_ANIMATION_MS);
  }

  const handleOpenMarkdown = useEffectEvent(async (): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFile();

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
      setOutlineItems(deriveOutlineItems(result.document.content));
      setActiveHeadingId(null);
    } else if (result.status === "error") {
      showNotification({ kind: "error", message: result.error.message });
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleNewMarkdown = useEffectEvent((): void => {
    resetAutosaveRuntime();
    editorContentRef.current = "";
    setOutlineItems([]);
    setActiveHeadingId(null);
    applyState((current) => createNewMarkdownDocumentState(current));
  });

  const handleOpenMarkdownFromPath = useEffectEvent(async (targetPath: string): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFileFromPath(targetPath);

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
      setOutlineItems(deriveOutlineItems(result.document.content));
      setActiveHeadingId(null);
    } else if (result.status === "error") {
      showNotification({ kind: "error", message: result.error.message });
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleWindowDragOver = useEffectEvent((event: globalThis.DragEvent): void => {
    if (!hasFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  });

  const handleWindowDrop = useEffectEvent((event: globalThis.DragEvent): void => {
    if (!hasFileDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetPath = getDroppedMarkdownPath(yulora, event.dataTransfer);

    if (!targetPath) {
      return;
    }

    void yulora
      .handleDroppedMarkdownFile({
        targetPath,
        hasOpenDocument: stateRef.current.currentDocument !== null
      })
      .then((result) => {
        if (result.disposition === "open-in-place") {
          return handleOpenMarkdownFromPath(targetPath);
        }

        return undefined;
      });
  });

  useEffect(() => {
    window.addEventListener("dragover", handleWindowDragOver, true);
    window.addEventListener("drop", handleWindowDrop, true);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver, true);
      window.removeEventListener("drop", handleWindowDrop, true);
    };
  }, []);

  const handleSaveMarkdown = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    const currentPath = currentDocument.path;

    if (!currentPath) {
      await runManualSave(() =>
        yulora.saveMarkdownFileAs({
          currentPath,
          content: getEditorContent()
        })
      );
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFile({
        path: currentPath,
        content: getEditorContent()
      })
    );
  });

  const handleSaveMarkdownAs = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFileAs({
        currentPath: currentDocument.path,
        content: getEditorContent()
      })
    );
  });

  async function handleImportClipboardImage(
    input: { documentPath: string | null }
  ): Promise<string | null> {
    const result = await yulora.importClipboardImage({
      documentPath: input.documentPath ?? ""
    });

    if (result.status === "success") {
      return result.markdown;
    }

    showNotification({ kind: "error", message: result.error.message });
    return null;
  }

  const handleEditorTestCommand = useEffectEvent(async (payload: {
    sessionId: string;
    commandId: string;
    command: Parameters<ReturnType<typeof createEditorTestDriver>["run"]>[0];
  }): Promise<void> => {
    const driver = createEditorTestDriver({
      getState: () => stateRef.current,
      applyState,
      resetAutosaveRuntime,
      editor: {
        getContent: getEditorContent,
        setContent: (content: string) => {
          editorRef.current?.setContent(content);
        },
        insertText: (text: string) => {
          editorRef.current?.insertText(text);
        },
        setSelection: (anchor: number, head?: number) => {
          editorRef.current?.setSelection(anchor, head);
        },
        pressEnter: () => {
          editorRef.current?.pressEnter();
        }
      },
      setEditorContentSnapshot: (content: string) => {
        editorContentRef.current = content;
      },
      openMarkdownFileFromPath: (targetPath: string) => yulora.openMarkdownFileFromPath(targetPath),
      saveMarkdownFile: (input) => yulora.saveMarkdownFile(input)
    });

    try {
      const result = await driver.run(payload.command);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result: {
          ok: false,
          message
        }
      });
    }
  });

  useEffect(() => {
    return yulora.onMenuCommand((command) => {
      if (command === "new-markdown-document") {
        handleNewMarkdown();
        return;
      }

      if (command === "open-markdown-file") {
        void handleOpenMarkdown();
        return;
      }

      if (command === "save-markdown-file") {
        void handleSaveMarkdown();
        return;
      }

      if (command === "save-markdown-file-as") {
        void handleSaveMarkdownAs();
      }
    });
  }, [yulora]);

  useEffect(() => {
    return yulora.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [yulora]);

  useEffect(() => {
    let isCancelled = false;

    void yulora
      .getPreferences()
      .then((nextPreferences) => {
        if (isCancelled) {
          return;
        }

        handlePreferencesSync(nextPreferences);
      })
      .catch(() => {
        // Keep defaults when the bridge is temporarily unavailable.
      });

    void yulora
      .listThemes()
      .then((nextThemes) => {
        if (isCancelled) {
          return;
        }

        setThemes(nextThemes);
      })
      .catch(() => {
        // Keep the builtin theme active when the catalog is unavailable.
      });

    void yulora
      .listThemePackages()
      .then((nextThemePackages) => {
        if (isCancelled) {
          return;
        }

        setThemePackages(nextThemePackages);
        setThemePackageCatalogState("loaded");
      })
      .catch(() => {
        // Keep the builtin theme package active when the package catalog is unavailable.
        if (isCancelled) {
          return;
        }

        setThemePackageCatalogState("failed");
      });

    const detach = yulora.onPreferencesChanged((nextPreferences) => {
      handlePreferencesSync(nextPreferences);
    });

    return () => {
      isCancelled = true;
      detach();
    };
  }, [yulora]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void handleLoadFontFamilies();
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isSettingsOpen || isSettingsClosing) {
      clearFocusIdleTimer();
      return;
    }

    scheduleFocusIdle();
    return () => clearFocusIdleTimer();
  }, [
    isDocumentOpen,
    isSettingsClosing,
    isSettingsOpen,
    preferences.focus.triggerMode,
    preferences.focus.idleDelayMs,
    scheduleFocusIdle
  ]);

  useEffect(() => {
    if (focusModeSource === "manual" && preferences.focus.triggerMode !== "manual") {
      setFocusModeSource(null);
      scheduleFocusIdle();
    }
  }, [focusModeSource, preferences.focus.triggerMode, scheduleFocusIdle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isAutoFocusKeyboardEvent(event) ||
        preferencesRef.current.focus.triggerMode !== "auto"
      ) {
        return;
      }

      enterFocusMode("auto");
      scheduleFocusIdle();
    };

    const handlePointerActivity = () => {
      setFocusModeSource((current) => (current === "auto" ? null : current));
      scheduleFocusIdle();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handlePointerActivity);
    window.addEventListener("wheel", handlePointerActivity);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handlePointerActivity);
      window.removeEventListener("wheel", handlePointerActivity);
    };
  }, [enterFocusMode, scheduleFocusIdle]);

  useEffect(() => {
    const themePackageRuntime =
      themePackageRuntimeRef.current ?? createThemePackageRuntime(document);
    themePackageRuntimeRef.current = themePackageRuntime;

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);
      const activeThemePackages =
        themePackages.length > 0
          ? themePackages.map(normalizeThemePackageDescriptor)
          : themes.map((theme) => toLegacyRuntimeThemePackageEntry(theme, resolvedThemeMode));
      const activeThemePackageResolution = resolveActiveThemePackage(
        preferences.theme.selectedId,
        activeThemePackages,
        resolvedThemeMode
      );
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

    if (preferences.theme.mode !== "system") {
      return undefined;
    }

    const mediaQuery = window.matchMedia?.(DARK_MODE_MEDIA_QUERY);

    if (!mediaQuery) {
      return undefined;
    }

    mediaQuery.addEventListener("change", applyCurrentTheme);
    return () => mediaQuery.removeEventListener("change", applyCurrentTheme);
  }, [activeThemeParameterOverrides, preferences, themePackages, themes]);

  useEffect(() => {
    return yulora.onAppUpdateState((nextState) => {
      setAppUpdateState(nextState);
    });
  }, [yulora]);

  useEffect(() => {
    return yulora.onAppNotification((nextNotification) => {
      showNotification(nextNotification);
    });
  }, [showNotification, yulora]);

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

  useEffect(() => {
    if (isSettingsOpen || isSettingsClosing || pendingFocusRestoreRef.current === null) {
      return;
    }

    if (pendingFocusRestoreRef.current === "editor") {
      editorRef.current?.focus();
    } else {
      settingsEntryRef.current?.focus();
    }

    pendingFocusRestoreRef.current = null;
  }, [isSettingsClosing, isSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleEscapeCloseSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen]);

  useEffect(() => {
    const startupOpenPath = startupOpenPathRef.current;

    if (!startupOpenPath) {
      return;
    }

    startupOpenPathRef.current = null;
    void handleOpenMarkdownFromPath(startupOpenPath);
  }, []);

  useEffect(
    () => () => {
      clearAutosaveTimer();
      clearOutlineCloseTimer();
      clearSettingsCloseTimer();
      clearFocusIdleTimer();
      clearNotificationTimers();
      themePackageRuntimeRef.current?.clear();
      clearThemeDynamicModeFromDocument(document.documentElement);
      clearDocumentPreferences(document.documentElement);
    },
    [clearNotificationTimers]
  );

  return (
    <main
      className="app-shell"
      data-yulora-focus-mode={isFocusModeActive ? "active" : "inactive"}
      style={
        {
          "--yulora-titlebar-height": controlledTitlebarEnabled ? `${titlebarLayout.height}px` : "0px"
        } as CSSProperties
      }
    >
      {controlledTitlebarEnabled ? (
        <TitlebarHost
          platform={yulora.platform}
          layout={titlebarLayout}
          title={headerTitle}
          isDirty={state.isDirty}
          effectsMode={preferences.theme.effectsMode}
          titlebarSurface={activeTitlebarSurface}
          onTitlebarSurfaceRuntimeModeChange={handleTitlebarSurfaceRuntimeModeChange}
        />
      ) : null}
      <div
        className="app-layout"
        data-yulora-focus-mode={isFocusModeActive ? "active" : "inactive"}
      >
        {activeWorkbenchSurface ? (
          <ThemeSurfaceHost
            surface="workbenchBackground"
            descriptor={activeWorkbenchSurface}
            effectsMode={preferences.theme.effectsMode}
            onRuntimeModeChange={handleWorkbenchSurfaceRuntimeModeChange}
          />
        ) : null}
        <aside
          className="app-rail"
          data-yulora-layout="rail"
          data-visibility={isFocusModeActive ? "collapsed" : "visible"}
        >
          <div className="app-rail-brand">
            <p className="app-name">Yulora</p>
            <p className="app-subtitle">Desktop editor</p>
          </div>
          <div
            className="app-rail-spacer"
            aria-hidden="true"
          />
          <button
            type="button"
            className="settings-entry"
            ref={settingsEntryRef}
            onMouseDown={captureSettingsOpenOrigin}
            onClick={openSettingsDrawer}
            aria-label="打开偏好设置"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M19.14 12.94a7.94 7.94 0 0 0 .05-.94 7.94 7.94 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.9 7.9 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.94 7.94 0 0 0 0 1.88L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.9 7.9 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span>设置</span>
          </button>
        </aside>

        <div
          className="app-workspace"
          data-yulora-layout="workspace"
        >
          {notification && notificationState !== "hidden" ? (
            <div
              className={`app-notification-banner is-${notification.kind}`}
              data-yulora-region="app-notification-banner"
              data-state={notificationState}
              role="status"
              aria-live="polite"
            >
              <p className="app-notification-message">
                {notification.kind === "loading" ? (
                  <span
                    className="app-notification-spinner"
                    data-yulora-region="app-notification-spinner"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{notification.message}</span>
              </p>
            </div>
          ) : null}
          <header
            className="app-header workspace-header"
            data-yulora-region="workspace-header"
            data-visibility={isFocusModeActive ? "collapsed" : "visible"}
          >
            <div className="workspace-title-group">
              <p className="workspace-kicker">{headerEyebrow}</p>
              <h1 className="workspace-title">{headerTitle}</h1>
              <p className="workspace-detail">{headerDetail}</p>
            </div>
            {!isDocumentOpen ? <p className="app-hint">{hintText}</p> : null}
          </header>

          <section
            className="workspace-canvas"
            data-yulora-region="workspace-canvas"
          >
            {state.currentDocument ? (
              <section className={`workspace-shell ${isOutlineOpen ? "is-outline-open" : ""}`}>
                {isManualFocusToggleEnabled ? (
                  <button
                    type="button"
                    className="focus-toggle-entry"
                    data-yulora-region="focus-toggle"
                    aria-label={isFocusModeActive ? "Exit focus mode" : "Enter focus mode"}
                    aria-pressed={isFocusModeActive}
                    onClick={toggleManualFocusMode}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{isFocusModeActive ? "Exit focus" : "Enter focus"}</span>
                  </button>
                ) : null}
                <div
                  className="document-canvas"
                  ref={editorContainerRef}
                >
                  <CodeEditorView
                    ref={editorRef}
                    initialContent={state.currentDocument.content}
                    documentPath={state.currentDocument.path}
                    loadRevision={state.editorLoadRevision}
                    importClipboardImage={handleImportClipboardImage}
                    onActiveBlockChange={(nextActiveBlockState) => {
                      activeBlockStateRef.current = nextActiveBlockState;
                      setActiveHeadingId(
                        nextActiveBlockState.activeBlock?.type === "heading"
                          ? nextActiveBlockState.activeBlock.id
                          : null
                      );
                    }}
                    onChange={(nextContent) => {
                      editorContentRef.current = nextContent;
                      setOutlineItems(deriveOutlineItems(nextContent));
                      let nextState: AppState = stateRef.current;

                      applyState((current) => {
                        nextState = applyEditorContentChanged(current, nextContent);
                        return nextState;
                      });

                      scheduleAutosave(nextState);
                    }}
                    onBlur={() => {
                      void runAutosave();
                    }}
                  />
                </div>
                {isOutlinePanelVisible ? (
                  <aside
                    className="outline-panel"
                    data-yulora-region="outline-panel"
                    data-state={isOutlineOpen ? "open" : "closing"}
                    aria-label="Document outline"
                  >
                    <div
                      className="outline-panel-header"
                      data-yulora-region="outline-panel-header"
                    >
                      <p className="outline-panel-title">Outline</p>
                      <button
                        type="button"
                        className="outline-panel-close"
                        aria-label="Collapse outline"
                        onClick={closeOutlinePanel}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M9 6l6 6-6 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div
                      className="outline-panel-body"
                      data-yulora-region="outline-panel-body"
                    >
                      {outlineItems.length > 0 ? (
                        <ol className="outline-panel-list">
                          {outlineItems.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className={`outline-panel-item ${activeHeadingId === item.id ? "is-current" : ""}`}
                                style={{
                                  paddingInlineStart: `${10 + Math.max(item.depth - 1, 0) * 10}px`
                                }}
                                onClick={() => {
                                  editorRef.current?.navigateToOffset(item.startOffset);
                                }}
                              >
                                <span className="outline-panel-item-label">{item.label}</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="outline-panel-empty">No headings yet.</p>
                      )}
                    </div>
                  </aside>
                ) : (
                  <button
                    type="button"
                    className="outline-entry"
                    data-yulora-region="outline-toggle"
                    aria-label="Expand outline"
                    onClick={openOutlinePanel}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M15 6l-6 6 6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </section>
            ) : (
              <section
                className="empty-workspace"
                data-yulora-region="empty-state"
              >
                <div className="empty-inner">
                  <p className="empty-kicker">Ready</p>
                  <h1>Open a Markdown document from the File menu.</h1>
                  <p className="empty-copy">
                    Yulora keeps Markdown text as the source of truth and writes it back without
                    reformatting the whole document.
                  </p>
                  <p className="empty-meta">Shortcut: Ctrl/Cmd+O</p>
                </div>
              </section>
            )}
          </section>

          <footer
            className="app-status-bar"
            data-yulora-region="app-status-bar"
            data-visibility={isFocusModeActive ? "collapsed" : "visible"}
          >
            <div data-yulora-region="status-strip">
              {appUpdateStatusLabel ? <p className="app-update-status">{appUpdateStatusLabel}</p> : null}
              <p className={`save-status ${state.isDirty ? "is-dirty" : "is-clean"}`}>
                {saveStatusLabel}
              </p>
              <p className="document-word-count">
                字数 {currentDocumentMetrics?.meaningfulCharacterCount ?? 0}
              </p>
            </div>
          </footer>
        </div>
      </div>

      {isSettingsDrawerVisible ? (
        <div
          data-yulora-dialog="settings-drawer"
          data-yulora-overlay-style="floating-drawer"
          data-state={isSettingsOpen ? "open" : "closing"}
          onClick={closeSettingsDrawer}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Suspense
              fallback={
                <SettingsDrawerFallback surfaceState={isSettingsOpen ? "open" : "closing"} />
              }
            >
              <SettingsView
                surfaceState={isSettingsOpen ? "open" : "closing"}
                preferences={preferences}
                fontFamilies={fontFamilies}
                themePackages={themePackages}
                isRefreshingThemes={isRefreshingThemePackages}
                onRefreshThemes={handleRefreshThemePackages}
                onUpdate={handleUpdatePreferences}
                onClose={closeSettingsDrawer}
              />
            </Suspense>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function BridgeUnavailableApp() {
  return (
    <main
      className="app-shell"
      style={{ "--yulora-titlebar-height": "0px" } as CSSProperties}
    >
      <div className="app-shell-fallback">
        <p
          className="error-banner"
          role="alert"
        >
          Yulora bridge unavailable. Reload the window or restart the dev shell.
        </p>
      </div>
    </main>
  );
}
