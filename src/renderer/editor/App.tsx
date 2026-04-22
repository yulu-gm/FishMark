import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type SVGProps
} from "react";

import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP,
  type ActiveBlockState,
  type ShortcutGroup,
  type ShortcutGroupId
} from "@fishmark/editor-core";
import type { AppNotification, AppUpdateState } from "../../shared/app-update";
import type { ExternalMarkdownFileChangedEvent } from "../../shared/external-file-change";
import type { AppMenuCommand } from "../../shared/menu-command";
import { createPreviewAssetUrl } from "../../shared/preview-asset-url";
import type { ThemePackageManifest, ThemeSurfaceSlot } from "../../shared/theme-package";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
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
  resolveActiveThemePackage
} from "../theme-package-catalog";
import {
  type AppState,
  type ExternalMarkdownFileState,
  applyExternalMarkdownFileChanged,
  applyEditorContentChanged,
  applySaveMarkdownResult,
  applyWorkspaceSnapshot,
  clearExternalMarkdownFileState,
  createInitialAppState,
  getActiveDocument,
  keepExternalMarkdownMemoryVersion,
  startAutosavingDocument,
  startManualSavingDocument,
  startOpeningMarkdownFile
} from "../document-state";
import { getDocumentMetrics } from "../document-metrics";
import {
  applyThemeParameterCssVariables,
  clearThemeParameterCssVariables,
  resolveEffectiveThemeParameterValue
} from "../theme-style-runtime";
import {
  applyThemeRuntimeEnv,
  buildThemeRuntimeEnv,
  clearThemeRuntimeEnv,
  type ThemeRuntimeEnv
} from "../theme-runtime-env";
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
import { ShortcutHintOverlay } from "./shortcut-hint-overlay";

const SettingsView = lazy(async () => {
  const module = await import("./settings-view");
  return { default: module.SettingsView };
});

type ResolvedThemeMode = Exclude<ThemeMode, "system">;
type ThemePackageEntry = Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>[number];
type OpenWorkspaceFileResult = Awaited<ReturnType<Window["fishmark"]["openWorkspaceFile"]>>;

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const EXTERNAL_FILE_MODIFIED_PENDING_MESSAGE =
  "当前文件已被外部修改。请先决定是重载磁盘版本，还是保留当前编辑并另存为。";
const EXTERNAL_FILE_DELETED_PENDING_MESSAGE =
  "当前文件已在磁盘上被删除或移走。你可以重载、保留当前编辑，或另存为新文件。";
const EXTERNAL_FILE_KEEPING_MEMORY_MESSAGE =
  "正在保留当前内存版本，autosave 已暂停。请另存为新文件，避免覆盖外部变化。";
const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_ATTRIBUTE = "data-fishmark-theme";
const UI_FONT_FAMILY_CSS_VAR = "--fishmark-ui-font-family";
const UI_FONT_SIZE_CSS_VAR = "--fishmark-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--fishmark-document-font-family";
const DOCUMENT_CJK_FONT_FAMILY_CSS_VAR = "--fishmark-document-cjk-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--fishmark-document-font-size";
const THEME_DYNAMIC_MODE_ATTRIBUTE = "data-fishmark-theme-dynamic-mode";
const OUTLINE_EXIT_ANIMATION_MS = 180;
const SETTINGS_DRAWER_EXIT_ANIMATION_MS = 180;
type TableToolTone = "default" | "danger";
type TableToolIconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;
type TableToolAction = {
  id: string;
  label: string;
  tone: TableToolTone;
  icon: TableToolIconComponent;
  onClick: () => void;
};

function isExternalFileConflictActive(state: AppState): boolean {
  return state.externalFileState.status !== "idle";
}

function getExternalFileConflictMessage(externalFileState: ExternalMarkdownFileState): string {
  if (externalFileState.status === "idle") {
    return "";
  }

  if (externalFileState.status === "keeping-memory") {
    return EXTERNAL_FILE_KEEPING_MEMORY_MESSAGE;
  }

  return externalFileState.kind === "deleted"
    ? EXTERNAL_FILE_DELETED_PENDING_MESSAGE
    : EXTERNAL_FILE_MODIFIED_PENDING_MESSAGE;
}

function isCancelledWorkspaceOpenResult(
  result: OpenWorkspaceFileResult
): result is Extract<OpenWorkspaceFileResult, { status: "cancelled" }> {
  return "status" in result && result.status === "cancelled";
}

function RowAboveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M12 3v4M10 5h4M4 9h16M4 9v11M20 9v11M8 9v11M16 9v11M4 14.5h16" />
    </svg>
  );
}

function RowBelowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 4v11M20 4v11M8 4v11M16 4v11M4 9.5h16M12 17v4M10 19h4" />
    </svg>
  );
}

function ColumnLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h14M4 20h14M8 4v16M13 4v16M18 4v16M2 12h4M4 10v4" />
    </svg>
  );
}

function ColumnRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M6 4h14M6 20h14M6 4v16M11 4v16M16 4v16M18 12h4M20 10v4" />
    </svg>
  );
}

function DeleteRowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 4v16M20 4v16M8 4v16M16 4v16M4 9.5h16M9 14.5h6" />
      <path d="M18 12l3 3M21 12l-3 3" />
    </svg>
  );
}

function DeleteColumnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 20h16M4 4v16M9 4v16M14 4v16M4 9.5h16M4 14.5h16" />
      <path d="M17 3l3 3M20 3l-3 3" />
    </svg>
  );
}

function DeleteTableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M5 5h14M5 5v14M19 5v14M9.5 5v14M14.5 5v14M5 9.5h14M5 14.5h14" />
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}
const APP_NOTIFICATION_DURATION_MS = 3000;
const APP_NOTIFICATION_EXIT_ANIMATION_MS = 180;
const THEME_DYNAMIC_FALLBACK_MESSAGE = "主题动态效果已自动关闭，已回退到静态样式。";
const SHORTCUT_HINT_HOLD_DELAY_MS = 1000;
const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown"] as const;
const PRIMARY_MODIFIER_LEFT_LOCATION = 1;
const PRIMARY_MODIFIER_RIGHT_LOCATION = 2;

function getPrimaryShortcutModifierId(
  event: KeyboardEvent,
  primaryModifierKey: "Control" | "Meta"
): string | null {
  if (event.key !== primaryModifierKey) {
    return null;
  }

  if (
    event.code === `${primaryModifierKey}Left` ||
    event.code === `${primaryModifierKey}Right`
  ) {
    return event.code;
  }

  if (event.location === PRIMARY_MODIFIER_LEFT_LOCATION) {
    return `${primaryModifierKey}Left`;
  }

  if (event.location === PRIMARY_MODIFIER_RIGHT_LOCATION) {
    return `${primaryModifierKey}Right`;
  }

  return primaryModifierKey;
}

function resolveEditorShortcutGroup(activeBlockState: ActiveBlockState | null): ShortcutGroup {
  return activeBlockState?.tableCursor?.mode === "inside"
    ? TABLE_EDITING_SHORTCUT_GROUP
    : DEFAULT_TEXT_SHORTCUT_GROUP;
}

function isMarkdownFilePath(targetPath: string): boolean {
  const normalizedPath = targetPath.trim().toLowerCase();

  return MARKDOWN_FILE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

function getDroppedMarkdownPaths(
  fishmark: Window["fishmark"],
  dataTransfer: DataTransfer | null
): string[] {
  const resolvedPaths = new Set<string>();

  for (const file of Array.from(dataTransfer?.files ?? [])) {
    if (!(file instanceof File)) {
      continue;
    }

    const filePath = fishmark.getPathForDroppedFile(file);

    if (typeof filePath !== "string" || !isMarkdownFilePath(filePath)) {
      continue;
    }

    resolvedPaths.add(filePath);
  }

  return [...resolvedPaths];
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
type ShellMode = "reading" | "editing";

const EDITOR_INTERACTIVE_TARGET_SELECTOR = [
  ".cm-table-widget",
  ".cm-table-widget-input",
  "input",
  "textarea",
  "[contenteditable='true']"
].join(", ");

const WORKSPACE_NON_EDITOR_INTERACTIVE_SELECTOR = [
  ".outline-panel",
  ".outline-entry",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']"
].join(", ");

function isPointerInsideRect(event: MouseEvent, element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function isEditingContentPointerEvent(event: MouseEvent, editorContainer: HTMLElement): boolean {
  const target = event.target;

  if (target instanceof Element && target.closest(EDITOR_INTERACTIVE_TARGET_SELECTOR)) {
    return true;
  }

  const contentElement = editorContainer.querySelector<HTMLElement>(".cm-content");
  return contentElement ? isPointerInsideRect(event, contentElement) : false;
}

function supportsControlledTitlebar(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  const mediaQuery = window.matchMedia?.(DARK_MODE_MEDIA_QUERY);
  return mediaQuery?.matches ? "dark" : "light";
}

function getWindowViewport(): ThemeRuntimeEnv["viewport"] {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

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

function resolveThemeWarningMessage(
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

  const activeThemePackage = themePackages.find((entry) => entry.id === selectedId) ?? null;

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

function SettingsDrawerFallback({ surfaceState }: { surfaceState: "open" | "closing" }) {
  return (
    <section
      className="settings-shell"
      data-fishmark-panel="settings-drawer"
      data-fishmark-surface="floating-drawer"
      data-state={surfaceState}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
    />
  );
}

export default function EditorApp() {
  const fishmark = window.fishmark;

  if (!fishmark) {
    return <BridgeUnavailableApp />;
  }

  return <EditorShell fishmark={fishmark} />;
}

function EditorShell({ fishmark }: { fishmark: Window["fishmark"] }) {
  const [state, setState] = useState(createInitialAppState);
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isOutlineClosing, setIsOutlineClosing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const [shellMode, setShellMode] = useState<ShellMode>("reading");
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [fontFamilies, setFontFamilies] = useState<string[]>([]);
  const [themePackages, setThemePackages] = useState<
    Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>
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
  const [systemThemeMode, setSystemThemeMode] = useState<ResolvedThemeMode>(() =>
    resolveThemeMode("system")
  );
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isShortcutHintArmed, setIsShortcutHintArmed] = useState(false);
  const [activeShortcutGroupId, setActiveShortcutGroupId] =
    useState<ShortcutGroupId>("default-text");
  const [activeTableToolId, setActiveTableToolId] = useState<string | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorContentRef = useRef("");
  const activeBlockStateRef = useRef<ActiveBlockState | null>(null);
  const startupOpenPathRef = useRef(fishmark.startupOpenPath);
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
  const notificationHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutHintHoldTimerRef = useRef<number | null>(null);
  const lastEditorPointerIntentRef = useRef<"editing" | "blank" | null>(null);
  const lastThemeNotificationKeyRef = useRef<string | null>(null);
  const lastThemeDynamicNotificationKeyRef = useRef<string | null>(null);
  const fontFamilyLoadStateRef = useRef<"idle" | "loading" | "loaded">("idle");
  const pressedShortcutModifiersRef = useRef<Set<string>>(new Set());
  const draggedWorkspaceTabIdRef = useRef<string | null>(null);
  const handledWorkspaceTabDropRef = useRef(false);
  const activeDocument = getActiveDocument(state);
  const workspaceTabs = state.workspace.tabs;
  const activeTabId = state.workspace.activeTabId;
  const currentDocumentContent = activeDocument
    ? (editorContentRef.current || activeDocument.content)
    : "";
  const currentDocumentMetrics = activeDocument ? getDocumentMetrics(currentDocumentContent) : null;
  const currentDocumentWordCount = currentDocumentMetrics?.meaningfulCharacterCount ?? 0;
  const isDocumentOpen = activeDocument !== null;
  const isReadingMode = shellMode === "reading";
  const isDocumentReadingMode = isDocumentOpen && isReadingMode;
  const isOutlinePanelVisible = isOutlineOpen || isOutlineClosing;
  const isSettingsDrawerVisible = isSettingsOpen || isSettingsClosing;
  const hintText =
    state.openState === "opening"
      ? "Opening document..."
      : "Use File > Open... to load a Markdown document.";
  const headerEyebrow = isDocumentOpen ? "Current document" : "FishMark";
  const headerTitle = isDocumentOpen
    ? activeDocument?.name ?? "Untitled"
    : "Local-first Markdown writing";
  const headerDetail =
    state.openState === "opening"
      ? "Opening document..."
      : isDocumentOpen
        ? activeDocument?.path ?? "Not saved yet."
        : "Markdown remains the source of truth, and the writing canvas stays calm and stable.";
  const saveStatusLabel =
    activeDocument?.saveState === "manual-saving"
      ? "Saving changes..."
      : activeDocument?.saveState === "autosaving"
        ? "Autosaving..."
        : activeDocument && !activeDocument.path && !activeDocument.isDirty
          ? "Not saved yet"
        : activeDocument?.isDirty
          ? "Unsaved changes"
          : "All changes saved";
  const externalFileConflictMessage = getExternalFileConflictMessage(state.externalFileState);
  const appUpdateStatusLabel = appUpdateState.kind === "downloading"
    ? `正在下载更新${Number.isFinite(appUpdateState.percent) ? ` ${Math.round(appUpdateState.percent)}%` : "…"}`
    : null;
  const appVersionLabel = `FishMark v${__FISHMARK_APP_VERSION__}`;
  const controlledTitlebarEnabled = supportsControlledTitlebar(fishmark.platform);
  const resolvedThemeMode =
    preferences.theme.mode === "system" ? systemThemeMode : preferences.theme.mode;
  const themeRuntimeEnv = useMemo<ThemeRuntimeEnv>(
    () =>
      buildThemeRuntimeEnv({
        wordCount: currentDocumentWordCount,
        isReadingMode: isDocumentReadingMode,
        themeMode: resolvedThemeMode,
        viewport: getWindowViewport()
      }),
    [currentDocumentWordCount, isDocumentReadingMode, resolvedThemeMode]
  );
  const activeThemePackages = themePackages.map(normalizeThemePackageDescriptor);
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
  const activeWorkbenchChannel0Src = activeWorkbenchSurface?.channels?.["0"]?.src ?? null;
  const activeTitlebarChannel0Src = activeTitlebarSurface?.channels?.["0"]?.src ?? null;
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
    () => normalizeTitlebarLayout(resolveDefaultTitlebarLayout(fishmark.platform)),
    [fishmark.platform]
  );
  const shortcutHintModifierKey: "Control" | "Meta" = fishmark.platform === "darwin" ? "Meta" : "Control";
  const activeShortcutGroup =
    activeShortcutGroupId === "table-editing"
      ? TABLE_EDITING_SHORTCUT_GROUP
      : DEFAULT_TEXT_SHORTCUT_GROUP;
  const isShortcutHintVisible = isDocumentOpen && isEditorFocused && isShortcutHintArmed;

  function createThemeRuntimeEnv(themeMode: ResolvedThemeMode = resolvedThemeMode): ThemeRuntimeEnv {
    return buildThemeRuntimeEnv({
      wordCount: currentDocumentWordCount,
      isReadingMode: isDocumentReadingMode,
      themeMode,
      viewport: getWindowViewport()
    });
  }

  const syncThemeRuntimeEnv = useEffectEvent((themeMode: ResolvedThemeMode = resolvedThemeMode): void => {
    applyThemeRuntimeEnv(document.documentElement, createThemeRuntimeEnv(themeMode));
  });

  const applyState = useCallback((updater: (current: AppState) => AppState): void => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const syncActiveDocumentUi = useCallback((nextState: AppState): void => {
    const nextActiveDocument = getActiveDocument(nextState);

    editorContentRef.current = nextActiveDocument?.content ?? "";
    activeBlockStateRef.current = null;
    setOutlineItems(nextActiveDocument ? deriveOutlineItems(nextActiveDocument.content) : []);
    setActiveHeadingId(null);
    setActiveShortcutGroupId("default-text");
    setActiveTableToolId(null);
  }, []);

  const applyWorkspaceWindowSnapshot = useCallback((
    snapshot: WorkspaceWindowSnapshot,
    options: { syncUi?: boolean; clearExternalFileConflict?: boolean } = {}
  ): AppState => {
    let nextState = stateRef.current;
    const previousState = stateRef.current;
    const shouldSyncUi = options.syncUi ?? true;

    applyState((current) => {
      nextState = {
        ...applyWorkspaceSnapshot(current, snapshot, {
          clearExternalFileState: options.clearExternalFileConflict ?? false
        }),
        openState: "idle"
      };
      return nextState;
    });

    if (shouldSyncUi && previousState.editorLoadRevision !== nextState.editorLoadRevision) {
      syncActiveDocumentUi(nextState);
    }

    return nextState;
  }, [applyState, syncActiveDocumentUi]);

  const getEditorContent = useCallback((): string => {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }, []);

  const flushActiveWorkspaceDraft = useCallback(async (): Promise<void> => {
    const activeDocument = getActiveDocument(stateRef.current);

    if (!activeDocument) {
      return;
    }

    const currentContent = getEditorContent();

    if (currentContent === activeDocument.content) {
      return;
    }

    const snapshot = await fishmark.updateWorkspaceTabDraft({
      tabId: activeDocument.tabId,
      content: currentContent
    });

    applyWorkspaceWindowSnapshot(snapshot, { syncUi: false });
  }, [applyWorkspaceWindowSnapshot, fishmark, getEditorContent]);

  const insertTableRowAbove = useCallback(() => {
    editorRef.current?.insertTableRowAbove();
  }, []);

  const insertTableRowBelow = useCallback(() => {
    editorRef.current?.insertTableRowBelow();
  }, []);

  const insertTableColumnLeft = useCallback(() => {
    editorRef.current?.insertTableColumnLeft();
  }, []);

  const insertTableColumnRight = useCallback(() => {
    editorRef.current?.insertTableColumnRight();
  }, []);

  const deleteTableRow = useCallback(() => {
    editorRef.current?.deleteTableRow();
  }, []);

  const deleteTableColumn = useCallback(() => {
    editorRef.current?.deleteTableColumn();
  }, []);

  const deleteTable = useCallback(() => {
    editorRef.current?.deleteTable();
  }, []);

  const tableToolActions = useMemo<TableToolAction[]>(
    () => [
      {
        id: "row-above",
        label: "Row Above",
        tone: "default",
        icon: RowAboveIcon,
        onClick: insertTableRowAbove
      },
      {
        id: "row-below",
        label: "Row Below",
        tone: "default",
        icon: RowBelowIcon,
        onClick: insertTableRowBelow
      },
      {
        id: "column-left",
        label: "Column Left",
        tone: "default",
        icon: ColumnLeftIcon,
        onClick: insertTableColumnLeft
      },
      {
        id: "column-right",
        label: "Column Right",
        tone: "default",
        icon: ColumnRightIcon,
        onClick: insertTableColumnRight
      },
      {
        id: "delete-row",
        label: "Delete Row",
        tone: "danger",
        icon: DeleteRowIcon,
        onClick: deleteTableRow
      },
      {
        id: "delete-column",
        label: "Delete Column",
        tone: "danger",
        icon: DeleteColumnIcon,
        onClick: deleteTableColumn
      },
      {
        id: "delete-table",
        label: "Delete Table",
        tone: "danger",
        icon: DeleteTableIcon,
        onClick: deleteTable
      }
    ],
    [
      deleteTable,
      deleteTableColumn,
      deleteTableRow,
      insertTableColumnLeft,
      insertTableColumnRight,
      insertTableRowAbove,
      insertTableRowBelow
    ]
  );

  const handleWorkbenchSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setWorkbenchSurfaceRuntimeMode((current) => (current === mode ? current : mode));
  }, []);

  const handleTitlebarSurfaceRuntimeModeChange = useCallback((mode: ThemeSurfaceRuntimeMode) => {
    setTitlebarSurfaceRuntimeMode((current) => (current === mode ? current : mode));
  }, []);

  useEffect(() => {
    setWorkbenchSurfaceRuntimeMode(null);
  }, [activeWorkbenchSurface?.sceneId, activeWorkbenchSurface?.shaderUrl, activeWorkbenchChannel0Src, preferences.theme.effectsMode]);

  useEffect(() => {
    setTitlebarSurfaceRuntimeMode(null);
  }, [
    activeTitlebarSurface?.sceneId,
    activeTitlebarSurface?.shaderUrl,
    activeTitlebarChannel0Src,
    controlledTitlebarEnabled,
    preferences.theme.effectsMode
  ]);

  useEffect(() => {
    if (!activeDocument) {
      setActiveShortcutGroupId("default-text");
    }
  }, [activeDocument]);

  useEffect(() => {
    if (activeShortcutGroup.id !== "table-editing") {
      setActiveTableToolId(null);
    }
  }, [activeShortcutGroup.id]);

  const clearAutosaveTimer = useCallback((): void => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

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

  const enterEditingMode = useCallback((): void => {
    setShellMode("editing");
  }, []);

  const enterReadingMode = useCallback((): void => {
    if (!getActiveDocument(stateRef.current) || isSettingsOpen || isSettingsClosing) {
      return;
    }

    setShellMode("reading");

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && editorContainerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, [isSettingsClosing, isSettingsOpen]);

  const handleAppWorkspaceMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      if (event.button !== 0 || !getActiveDocument(stateRef.current)) {
        return;
      }

      const target = event.target;
      const editorContainer = editorContainerRef.current;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".outline-panel, .outline-entry")) {
        return;
      }

      if (
        editorContainer &&
        editorContainer.contains(target) &&
        isEditingContentPointerEvent(event.nativeEvent, editorContainer)
      ) {
        return;
      }

      if (
        !editorContainer?.contains(target) &&
        target.closest(WORKSPACE_NON_EDITOR_INTERACTIVE_SELECTOR)
      ) {
        return;
      }

      lastEditorPointerIntentRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      enterReadingMode();
    },
    [enterReadingMode]
  );

  function clearShortcutHintHoldTimer(): void {
    if (shortcutHintHoldTimerRef.current !== null) {
      clearTimeout(shortcutHintHoldTimerRef.current);
      shortcutHintHoldTimerRef.current = null;
    }
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

  const resetAutosaveRuntime = useCallback((): void => {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }, [clearAutosaveTimer]);

  const runAutosave = useCallback(async (): Promise<void> => {
    clearAutosaveTimer();

    const snapshot = stateRef.current;
    const currentDocument = getActiveDocument(snapshot);

    if (
      !currentDocument ||
      !currentDocument.path ||
      !currentDocument.isDirty ||
      isExternalFileConflictActive(snapshot) ||
      inFlightSaveOriginRef.current
    ) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startAutosavingDocument(current));

    const result = await fishmark.saveMarkdownFile({
      tabId: currentDocument.tabId,
      path: currentDocument.path,
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
  }, [applyState, clearAutosaveTimer, fishmark, getEditorContent, showNotification]);

  const scheduleAutosave = useCallback((nextState: AppState): void => {
    clearAutosaveTimer();
    const activeDocument = getActiveDocument(nextState);

    if (
      !activeDocument ||
      !activeDocument.path ||
      !activeDocument.isDirty ||
      isExternalFileConflictActive(nextState)
    ) {
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
  }, [clearAutosaveTimer, runAutosave]);

  async function runManualSave(
    request: () => ReturnType<typeof window.fishmark.saveMarkdownFile>
  ): Promise<void> {
    const snapshot = stateRef.current;
    const currentDocument = getActiveDocument(snapshot);

    if (!currentDocument || inFlightSaveOriginRef.current) {
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
  });

  const handleAppMenuCommand = useEffectEvent((command: AppMenuCommand): void => {
    if (command === "new-markdown-document") {
      void handleNewMarkdown();
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

  const handleLoadFontFamilies = useEffectEvent(async (): Promise<void> => {
    if (fontFamilyLoadStateRef.current !== "idle") {
      return;
    }

    fontFamilyLoadStateRef.current = "loading";

    try {
      const nextFontFamilies = await fishmark.listFontFamilies();
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
      const nextThemePackages = await fishmark.refreshThemePackages();
      setThemePackages(nextThemePackages);
      setThemePackageCatalogState("loaded");
    } finally {
      setIsRefreshingThemePackages(false);
    }
  }, [fishmark]);

  async function handleUpdatePreferences(
    patch: PreferencesUpdate
  ): Promise<Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>>> {
    const result = await fishmark.updatePreferences(patch);
    preferencesRef.current = result.preferences;
    setPreferences(result.preferences);
    scheduleAutosave(stateRef.current);
    return result;
  }

  function openSettingsDrawer(): void {
    if (getActiveDocument(stateRef.current)) {
      setShellMode("editing");
    }
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

  async function handleOpenMarkdown(): Promise<void> {
    applyState((current) => startOpeningMarkdownFile(current));
    resetAutosaveRuntime();

    try {
      const result = await fishmark.openWorkspaceFile();

      if (isCancelledWorkspaceOpenResult(result)) {
        applyState((current) => ({
          ...current,
          openState: "idle"
        }));
        return;
      }

      applyWorkspaceWindowSnapshot(result, { clearExternalFileConflict: true });
      setShellMode("reading");
    } catch (error) {
      applyState((current) => ({
        ...current,
        openState: "idle"
      }));
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function handleNewMarkdown(): Promise<void> {
    resetAutosaveRuntime();

    const snapshot = await fishmark.createWorkspaceTab({
      kind: "untitled"
    });

    applyWorkspaceWindowSnapshot(snapshot, { clearExternalFileConflict: true });
    setShellMode("editing");
  }

  const handleOpenMarkdownFromPath = useCallback(async (targetPath: string): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));
    resetAutosaveRuntime();

    try {
      const snapshot = await fishmark.openWorkspaceFileFromPath(targetPath);
      applyWorkspaceWindowSnapshot(snapshot, { clearExternalFileConflict: true });
      setShellMode("reading");
      // Drag-drop on the editor container can leave the editor focused after
      // the drop event resolves, even though we requested reading mode. Blur
      // any lingering focus inside the editor on the next frames so the
      // caret does not appear in reading mode.
      const blurEditorIfFocused = (): void => {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          editorContainerRef.current?.contains(activeElement)
        ) {
          activeElement.blur();
        }
      };
      blurEditorIfFocused();
      requestAnimationFrame(() => {
        blurEditorIfFocused();
        requestAnimationFrame(blurEditorIfFocused);
      });
    } catch (error) {
      applyState((current) => ({
        ...current,
        openState: "idle"
      }));
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [applyState, applyWorkspaceWindowSnapshot, fishmark, resetAutosaveRuntime, showNotification]);

  async function handleActivateWorkspaceTab(tabId: string): Promise<void> {
    if (stateRef.current.workspace.activeTabId === tabId) {
      return;
    }

    await flushActiveWorkspaceDraft();
    resetAutosaveRuntime();

    try {
      const snapshot = await fishmark.activateWorkspaceTab({ tabId });
      const nextState = applyWorkspaceWindowSnapshot(snapshot);
      scheduleAutosave(nextState);
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const handleCloseWorkspaceTab = useCallback(async (tabId: string): Promise<void> => {
    await flushActiveWorkspaceDraft();
    const isClosingActiveTab = stateRef.current.workspace.activeTabId === tabId;

    if (isClosingActiveTab) {
      resetAutosaveRuntime();
    }

    try {
      const snapshot = await fishmark.closeWorkspaceTab({ tabId });
      const nextState = applyWorkspaceWindowSnapshot(snapshot);
      if (isClosingActiveTab) {
        scheduleAutosave(nextState);
      }
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [
    applyWorkspaceWindowSnapshot,
    fishmark,
    flushActiveWorkspaceDraft,
    resetAutosaveRuntime,
    scheduleAutosave,
    showNotification
  ]);

  const handleReorderWorkspaceTab = useCallback(
    async (tabId: string, toIndex: number): Promise<void> => {
      await flushActiveWorkspaceDraft();

      try {
        const snapshot = await fishmark.reorderWorkspaceTab({ tabId, toIndex });
        applyWorkspaceWindowSnapshot(snapshot, { syncUi: false });
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]
  );

  const handleDetachWorkspaceTab = useCallback(async (tabId: string): Promise<void> => {
    await flushActiveWorkspaceDraft();
    resetAutosaveRuntime();

    try {
      const snapshot = await fishmark.detachWorkspaceTabToNewWindow({ tabId });
      const nextState = applyWorkspaceWindowSnapshot(snapshot);
      scheduleAutosave(nextState);
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, resetAutosaveRuntime, scheduleAutosave, showNotification]);

  const handleWorkspaceTabDragStart = useCallback(
    (tabId: string, event: React.DragEvent<HTMLElement>): void => {
      draggedWorkspaceTabIdRef.current = tabId;
      handledWorkspaceTabDropRef.current = false;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tabId);
    },
    []
  );

  const handleWorkspaceTabDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    if (!draggedWorkspaceTabIdRef.current) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleWorkspaceTabDrop = useCallback(
    (targetTabId: string, targetIndex: number, event: React.DragEvent<HTMLElement>): void => {
      const draggedTabId = draggedWorkspaceTabIdRef.current;

      if (!draggedTabId) {
        return;
      }

      event.preventDefault();
      handledWorkspaceTabDropRef.current = true;
      draggedWorkspaceTabIdRef.current = null;

      if (draggedTabId === targetTabId) {
        return;
      }

      void handleReorderWorkspaceTab(draggedTabId, targetIndex);
    },
    [handleReorderWorkspaceTab]
  );

  const handleWorkspaceTabDragEnd = useCallback(
    (tabId: string): void => {
      const shouldDetach =
        draggedWorkspaceTabIdRef.current === tabId && !handledWorkspaceTabDropRef.current;

      draggedWorkspaceTabIdRef.current = null;
      handledWorkspaceTabDropRef.current = false;

      if (shouldDetach) {
        void handleDetachWorkspaceTab(tabId);
      }
    },
    [handleDetachWorkspaceTab]
  );

  const handleExternalMarkdownFileChanged = useEffectEvent(
    (event: ExternalMarkdownFileChangedEvent): void => {
      clearAutosaveTimer();
      pendingAutosaveReplayRef.current = false;

      applyState((current) => applyExternalMarkdownFileChanged(current, event));
    }
  );

  function handleKeepExternalFileMemoryVersion(): void {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    applyState((current) => keepExternalMarkdownMemoryVersion(current));
  }

  function handleDismissExternalFileConflict(): void {
    applyState((current) => clearExternalMarkdownFileState(current));
  }

  async function handleReloadExternalFile(): Promise<void> {
    const activeDocument = getActiveDocument(stateRef.current);

    if (!activeDocument?.path) {
      return;
    }

    applyState((current) => startOpeningMarkdownFile(current));
    resetAutosaveRuntime();

    try {
      const snapshot = await fishmark.reloadWorkspaceTabFromPath({
        tabId: activeDocument.tabId,
        targetPath: activeDocument.path
      });
      applyWorkspaceWindowSnapshot(snapshot, { clearExternalFileConflict: true });
      setShellMode("reading");
    } catch (error) {
      applyState((current) => ({
        ...current,
        openState: "idle"
      }));
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

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

    const targetPaths = getDroppedMarkdownPaths(fishmark, event.dataTransfer);

    if (targetPaths.length === 0) {
      return;
    }

    void fishmark
      .handleDroppedMarkdownFile({
        targetPaths,
        hasOpenDocument: getActiveDocument(stateRef.current) !== null
      })
      .then(async (result) => {
        if (result.disposition === "open-in-place") {
          for (const targetPath of targetPaths) {
            await handleOpenMarkdownFromPath(targetPath);
          }
        }
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

  async function handleSaveMarkdown(): Promise<void> {
    const currentDocument = getActiveDocument(stateRef.current);

    if (!currentDocument) {
      return;
    }

    const currentPath = currentDocument.path;
    const shouldForceSaveAs = isExternalFileConflictActive(stateRef.current);

    if (!currentPath || shouldForceSaveAs) {
      await runManualSave(() =>
        fishmark.saveMarkdownFileAs({
          tabId: currentDocument.tabId,
          currentPath,
          content: getEditorContent()
        })
      );
      return;
    }

    await runManualSave(() =>
      fishmark.saveMarkdownFile({
        tabId: currentDocument.tabId,
        path: currentPath,
        content: getEditorContent()
      })
    );
  }

  async function handleSaveMarkdownAs(): Promise<void> {
    const currentDocument = getActiveDocument(stateRef.current);

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      fishmark.saveMarkdownFileAs({
        tabId: currentDocument.tabId,
        currentPath: currentDocument.path,
        content: getEditorContent()
      })
    );
  }

  async function handleImportClipboardImage(
    input: { documentPath: string | null }
  ): Promise<string | null> {
    const result = await fishmark.importClipboardImage({
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
        getSelection: () =>
          editorRef.current?.getSelection() ?? {
            anchor: 0,
            head: 0
          },
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
        },
        pressBackspace: () => {
          editorRef.current?.pressBackspace();
        },
        pressTab: (shiftKey?: boolean) => {
          editorRef.current?.pressTab(shiftKey);
        },
        pressArrowUp: () => {
          editorRef.current?.pressArrowUp();
        },
        pressArrowDown: () => {
          editorRef.current?.pressArrowDown();
        }
      },
      setEditorContentSnapshot: (content: string) => {
        editorContentRef.current = content;
      },
      openWorkspaceFileFromPath: (targetPath: string) => fishmark.openWorkspaceFileFromPath(targetPath),
      saveMarkdownFile: (input) => fishmark.saveMarkdownFile(input)
    });

    try {
      const result = await driver.run(payload.command);
      await fishmark.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await fishmark.completeEditorTestCommand({
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
    return fishmark.onMenuCommand((command) => {
      handleAppMenuCommand(command);
    });
  }, [fishmark]);

  useEffect(() => {
    return fishmark.onOpenWorkspacePath((payload) => {
      void handleOpenMarkdownFromPath(payload.targetPath);
    });
  }, [fishmark, handleOpenMarkdownFromPath]);

  useEffect(() => {
    return fishmark.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [fishmark]);

  useEffect(() => {
    return fishmark.onExternalMarkdownFileChanged((event) => {
      handleExternalMarkdownFileChanged(event);
    });
  }, [fishmark]);

  useEffect(() => {
    void fishmark.syncWatchedMarkdownFile({
      tabId: activeDocument?.tabId ?? null
    });
  }, [activeDocument?.path, activeDocument?.tabId, fishmark]);

  useEffect(() => {
    let isCancelled = false;

    void fishmark
      .getWorkspaceSnapshot()
      .then(async (snapshot) => {
        if (isCancelled) {
          return;
        }

        applyWorkspaceWindowSnapshot(snapshot);

        const startupOpenPath = startupOpenPathRef.current;

        if (!startupOpenPath) {
          return;
        }

        startupOpenPathRef.current = null;
        await handleOpenMarkdownFromPath(startupOpenPath);
      })
      .catch(() => {
        // Keep the local empty state if the workspace snapshot is temporarily unavailable.
      });

    return () => {
      isCancelled = true;
    };
  }, [applyWorkspaceWindowSnapshot, fishmark, handleOpenMarkdownFromPath]);

  useEffect(() => {
    let isCancelled = false;

    void fishmark
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

    void fishmark
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

    const detach = fishmark.onPreferencesChanged((nextPreferences) => {
      handlePreferencesSync(nextPreferences);
    });

    return () => {
      isCancelled = true;
      detach();
    };
  }, [fishmark]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void handleLoadFontFamilies();
  }, [isSettingsOpen]);

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

  useEffect(() => {
    const handleResize = () => syncThemeRuntimeEnv();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    syncThemeRuntimeEnv(resolvedThemeMode);
  }, [currentDocumentWordCount, isDocumentReadingMode, resolvedThemeMode]);

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (!editorContainer) {
      return undefined;
    }

    const handleMouseDownCapture = (event: MouseEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        if (event.button !== 0) {
          lastEditorPointerIntentRef.current = null;
          return;
        }

        const isEditingContentClick = isEditingContentPointerEvent(event, editorContainer);
        lastEditorPointerIntentRef.current = isEditingContentClick ? "editing" : "blank";

        if (!isEditingContentClick) {
          event.preventDefault();
          enterReadingMode();
        }
      }
    };

    const clearLastPointerIntent = () => {
      lastEditorPointerIntentRef.current = null;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        const pointerIntent = lastEditorPointerIntentRef.current;
        lastEditorPointerIntentRef.current = null;
        setIsEditorFocused(true);

        if (pointerIntent !== "editing") {
          return;
        }

        if (getActiveDocument(stateRef.current)) {
          enterEditingMode();
        }
      }
    };

    const handleFocusOut = () => {
      const activeElement = document.activeElement;
      setIsEditorFocused(activeElement instanceof Node && editorContainer.contains(activeElement));
    };

    editorContainer.addEventListener("mousedown", handleMouseDownCapture, true);
    editorContainer.addEventListener("focusin", handleFocusIn);
    editorContainer.addEventListener("focusout", handleFocusOut);
    window.addEventListener("mouseup", clearLastPointerIntent);

    return () => {
      editorContainer.removeEventListener("mousedown", handleMouseDownCapture, true);
      editorContainer.removeEventListener("focusin", handleFocusIn);
      editorContainer.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("mouseup", clearLastPointerIntent);
    };
  }, [enterEditingMode, enterReadingMode, isDocumentOpen, state.editorLoadRevision]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      const wasHeld = pressedShortcutModifiersRef.current.size > 0;
      pressedShortcutModifiersRef.current.add(modifierId);

      if (wasHeld || shortcutHintHoldTimerRef.current !== null) {
        return;
      }

      shortcutHintHoldTimerRef.current = window.setTimeout(() => {
        shortcutHintHoldTimerRef.current = null;

        if (
          pressedShortcutModifiersRef.current.size > 0 &&
          isDocumentOpen &&
          isEditorFocused
        ) {
          setIsShortcutHintArmed(true);
        }
      }, SHORTCUT_HINT_HOLD_DELAY_MS);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      pressedShortcutModifiersRef.current.delete(modifierId);

      if (pressedShortcutModifiersRef.current.size === 0) {
        clearShortcutHintHoldTimer();
        setIsShortcutHintArmed(false);
      }
    };

    const handleWindowBlur = () => {
      clearShortcutHintHoldTimer();
      pressedShortcutModifiersRef.current.clear();
      setIsEditorFocused(false);
      setIsShortcutHintArmed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      clearShortcutHintHoldTimer();
    };
  }, [isDocumentOpen, isEditorFocused, shortcutHintModifierKey]);

  useEffect(() => {
    if (isDocumentOpen) {
      return;
    }

    clearShortcutHintHoldTimer();
    pressedShortcutModifiersRef.current.clear();
    setIsEditorFocused(false);
    setIsShortcutHintArmed(false);
  }, [isDocumentOpen]);

  useEffect(() => {
    const themePackageRuntime =
      themePackageRuntimeRef.current ?? createThemePackageRuntime(document);
    themePackageRuntimeRef.current = themePackageRuntime;

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);
      const activeThemePackages = themePackages.map(normalizeThemePackageDescriptor);
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
  }, [activeThemeParameterOverrides, preferences, resolvedThemeMode, themePackages]);

  useEffect(() => {
    return fishmark.onAppUpdateState((nextState) => {
      setAppUpdateState(nextState);
    });
  }, [fishmark]);

  useEffect(() => {
    return fishmark.onAppNotification((nextNotification) => {
      showNotification(nextNotification);
    });
  }, [showNotification, fishmark]);

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
    if (!isDocumentOpen) {
      return;
    }

    if (shellMode !== "editing") {
      return;
    }

    const frame = requestAnimationFrame(() => {
      editorRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeDocument?.path, isDocumentOpen, shellMode, state.editorLoadRevision]);

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
    if (!isDocumentOpen || isSettingsOpen || isSettingsClosing) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && shellMode === "editing") {
        enterReadingMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enterReadingMode, isDocumentOpen, isSettingsClosing, isSettingsOpen, shellMode]);

  useEffect(
    () => () => {
      clearAutosaveTimer();
      clearOutlineCloseTimer();
      clearSettingsCloseTimer();
      clearNotificationTimers();
      themePackageRuntimeRef.current?.clear();
      clearThemeDynamicModeFromDocument(document.documentElement);
      clearThemeRuntimeEnv(document.documentElement);
      clearDocumentPreferences(document.documentElement);
    },
    [clearAutosaveTimer, clearNotificationTimers]
  );

  return (
    <main
      className="app-shell"
      data-fishmark-shell-mode={shellMode}
      style={
        {
          "--fishmark-titlebar-height": controlledTitlebarEnabled ? `${titlebarLayout.height}px` : "0px"
        } as CSSProperties
      }
    >
      {controlledTitlebarEnabled ? (
        <TitlebarHost
          platform={fishmark.platform}
          layout={titlebarLayout}
          title={headerTitle}
          isDirty={activeDocument?.isDirty ?? false}
          themeMode={resolvedThemeMode}
          runtimeEnv={themeRuntimeEnv}
          effectsMode={preferences.theme.effectsMode}
          titlebarSurface={activeTitlebarSurface}
          onTitlebarSurfaceRuntimeModeChange={handleTitlebarSurfaceRuntimeModeChange}
        />
      ) : null}
      <div
        className="app-layout"
        data-fishmark-shell-mode={shellMode}
        data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
      >
        {activeWorkbenchSurface ? (
          <ThemeSurfaceHost
            surface="workbenchBackground"
            descriptor={activeWorkbenchSurface}
            themeMode={resolvedThemeMode}
            runtimeEnv={themeRuntimeEnv}
            effectsMode={preferences.theme.effectsMode}
            onRuntimeModeChange={handleWorkbenchSurfaceRuntimeModeChange}
          />
        ) : null}
        <aside
          className="app-rail"
          data-fishmark-layout="rail"
          data-fishmark-rail-mode={activeShortcutGroup.id}
          data-visibility={isDocumentOpen && isReadingMode ? "collapsed" : "visible"}
        >
          <div className="app-rail-brand">
            <p className="app-name">FishMark</p>
            <p className="app-subtitle">Desktop editor</p>
          </div>
          <div className="app-rail-content">
            <div
              className="app-rail-mode-group app-rail-mode-group-default"
              data-state={activeShortcutGroup.id === "default-text" ? "open" : "closing"}
              aria-hidden={activeShortcutGroup.id !== "default-text"}
            >
              <div
                className="app-rail-spacer"
                aria-hidden="true"
              />
            </div>
            <div
              className="app-rail-mode-group app-rail-mode-group-table"
              data-state={activeShortcutGroup.id === "table-editing" ? "open" : "closing"}
              aria-hidden={activeShortcutGroup.id !== "table-editing"}
            >
              <div className="table-tool-strip" data-fishmark-region="table-tool-strip">
                {tableToolActions.map((action) => {
                  const Icon = action.icon;
                  const isTooltipVisible = activeTableToolId === action.id;

                  return (
                    <button
                      key={action.id}
                      type="button"
                      className="table-tool-button"
                      data-tone={action.tone}
                      data-fishmark-region="table-tool-button"
                      aria-label={action.label}
                      onClick={action.onClick}
                      onMouseEnter={() => setActiveTableToolId(action.id)}
                      onMouseLeave={() => {
                        setActiveTableToolId((current) => (current === action.id ? null : current));
                      }}
                      onFocus={() => setActiveTableToolId(action.id)}
                      onBlur={() => {
                        setActiveTableToolId((current) => (current === action.id ? null : current));
                      }}
                    >
                      <Icon className="table-tool-button-icon" />
                      {isTooltipVisible ? (
                        <span
                          className="table-tool-tooltip"
                          data-fishmark-region="table-tool-tooltip"
                          role="tooltip"
                        >
                          {action.label}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
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
          data-fishmark-layout="workspace"
          data-fishmark-shell-mode={shellMode}
          data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
          onMouseDownCapture={handleAppWorkspaceMouseDownCapture}
        >
          {notification && notificationState !== "hidden" ? (
            <div
              className={`app-notification-banner is-${notification.kind}`}
              data-fishmark-region="app-notification-banner"
              data-state={notificationState}
              role="status"
              aria-live="polite"
            >
              <p className="app-notification-message">
                {notification.kind === "loading" ? (
                  <span
                    className="app-notification-spinner"
                    data-fishmark-region="app-notification-spinner"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{notification.message}</span>
              </p>
            </div>
          ) : null}
          {state.externalFileState.status !== "idle" ? (
            <section
              className="external-file-conflict-banner"
              data-fishmark-region="external-file-conflict-banner"
              data-status={state.externalFileState.status}
              role="status"
              aria-live="polite"
            >
              <p className="external-file-conflict-message">{externalFileConflictMessage}</p>
              <div className="external-file-conflict-actions">
                <button
                  type="button"
                  className="external-file-conflict-button"
                  onClick={() => {
                    void handleReloadExternalFile();
                  }}
                >
                  重载磁盘版本
                </button>
                {state.externalFileState.status === "pending" ? (
                  <button
                    type="button"
                    className="external-file-conflict-button"
                    onClick={handleKeepExternalFileMemoryVersion}
                  >
                    保留当前编辑
                  </button>
                ) : null}
                <button
                  type="button"
                  className="external-file-conflict-button"
                  onClick={() => {
                    void handleSaveMarkdownAs();
                  }}
                >
                  另存为新文件
                </button>
                {state.externalFileState.status === "keeping-memory" ? (
                  <button
                    type="button"
                    className="external-file-conflict-button is-secondary"
                    onClick={handleDismissExternalFileConflict}
                  >
                    关闭提示
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
          {workspaceTabs.length > 0 ? (
            <nav
              className="workspace-tab-strip"
              data-fishmark-region="workspace-tab-strip"
              data-visibility={isReadingMode && isDocumentOpen ? "collapsed" : "visible"}
              aria-label="Open documents"
            >
              <div className="workspace-tab-strip-scroll">
                {workspaceTabs.map((tab, index) => {
                  const isActive = tab.tabId === activeTabId;
                  const tooltip = tab.path ?? tab.name;

                  return (
                    <div
                      key={tab.tabId}
                      className={`workspace-tab-shell ${isActive ? "is-active" : ""}`}
                      data-fishmark-region="workspace-tab-shell"
                      data-active={isActive ? "true" : "false"}
                      data-dirty={tab.isDirty ? "true" : "false"}
                    >
                      <button
                        type="button"
                        className={`workspace-tab ${isActive ? "is-active" : ""}`}
                        data-fishmark-region="workspace-tab"
                        data-active={isActive ? "true" : "false"}
                        data-dirty={tab.isDirty ? "true" : "false"}
                        title={tooltip}
                        draggable
                        onClick={() => {
                          void handleActivateWorkspaceTab(tab.tabId);
                        }}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleCloseWorkspaceTab(tab.tabId);
                          }
                        }}
                        onDragStart={(event) => {
                          handleWorkspaceTabDragStart(tab.tabId, event);
                        }}
                        onDragOver={handleWorkspaceTabDragOver}
                        onDrop={(event) => {
                          handleWorkspaceTabDrop(tab.tabId, index, event);
                        }}
                        onDragEnd={() => {
                          handleWorkspaceTabDragEnd(tab.tabId);
                        }}
                      >
                        <span className="workspace-tab-label">{tab.name}</span>
                        <span
                          className="workspace-tab-dirty-indicator"
                          data-visibility={tab.isDirty ? "visible" : "hidden"}
                          aria-hidden="true"
                        >
                          •
                        </span>
                      </button>
                      <button
                        type="button"
                        className="workspace-tab-close"
                        data-fishmark-region="workspace-tab-close"
                        aria-label={`Close ${tab.name}`}
                        title={`Close ${tab.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleCloseWorkspaceTab(tab.tabId);
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M3 3 L9 9 M9 3 L3 9"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </nav>
          ) : null}
          <header
            className="app-header workspace-header"
            data-fishmark-region="workspace-header"
            data-visibility={isReadingMode ? "collapsed" : "visible"}
          >
            <div className="workspace-title-group">
              <p className="workspace-kicker">{headerEyebrow}</p>
              <h1 className="workspace-title">{headerTitle}</h1>
              <p className="workspace-detail">{headerDetail}</p>
            </div>
            {!isDocumentOpen ? <p className="app-hint">{hintText}</p> : null}
          </header>

          <section
            className={`workspace-canvas ${activeDocument ? "is-editor-open" : ""}`}
            data-fishmark-region="workspace-canvas"
            data-fishmark-shell-mode={shellMode}
            data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
          >
            {activeDocument ? (
              <>
                <div
                  data-fishmark-region="shortcut-hint-overlay-shell"
                  className="shortcut-hint-overlay-shell"
                  data-shortcut-hint-state={isShortcutHintVisible ? "visible" : "hidden"}
                >
                  <ShortcutHintOverlay
                    visible={isShortcutHintVisible}
                    platform={fishmark.platform}
                    group={activeShortcutGroup}
                  />
                </div>
                <section className={`workspace-shell ${isOutlineOpen ? "is-outline-open" : ""}`}>
                  <div
                    className="document-canvas"
                    ref={editorContainerRef}
                  >
                    <CodeEditorView
                      ref={editorRef}
                      initialContent={activeDocument.content}
                      documentPath={activeDocument.path}
                      loadRevision={state.editorLoadRevision}
                      importClipboardImage={handleImportClipboardImage}
                      onActiveBlockChange={(nextActiveBlockState) => {
                        activeBlockStateRef.current = nextActiveBlockState;
                        setActiveShortcutGroupId(
                          resolveEditorShortcutGroup(nextActiveBlockState).id
                        );
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

                        const draftTabId = nextState.workspace.activeTabId;

                        if (draftTabId) {
                          void fishmark
                            .updateWorkspaceTabDraft({
                              tabId: draftTabId,
                              content: nextContent
                            })
                            .then((snapshot) => {
                              applyWorkspaceWindowSnapshot(snapshot, { syncUi: false });
                            })
                            .catch(() => {
                              // Keep the renderer draft responsive even if workspace sync lags briefly.
                            });
                        }

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
                      data-fishmark-region="outline-panel"
                      data-state={isOutlineOpen ? "open" : "closing"}
                      aria-label="Document outline"
                    >
                      <div
                        className="outline-panel-header"
                        data-fishmark-region="outline-panel-header"
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
                        data-fishmark-region="outline-panel-body"
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
                      data-fishmark-region="outline-toggle"
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
              </>
            ) : (
              <section
                className="empty-workspace"
                data-fishmark-region="empty-state"
              >
                <div className="empty-inner">
                  <p className="empty-kicker">Ready</p>
                  <h1>Open a Markdown document from the File menu.</h1>
                  <p className="empty-copy">
                    FishMark keeps Markdown text as the source of truth and writes it back without
                    reformatting the whole document.
                  </p>
                  <p className="empty-meta">Shortcut: Ctrl/Cmd+O</p>
                </div>
              </section>
            )}
          </section>

          <footer
            className="app-status-bar"
            data-fishmark-region="app-status-bar"
            data-visibility={isReadingMode && isDocumentOpen ? "collapsed" : "visible"}
          >
            <div data-fishmark-region="status-strip">
              {isDocumentOpen ? (
                <>
                  {appUpdateStatusLabel ? (
                    <p className="app-update-status">{appUpdateStatusLabel}</p>
                  ) : null}
                  <p
                    className={`save-status ${activeDocument?.isDirty ? "is-dirty" : "is-clean"}`}
                  >
                    {saveStatusLabel}
                  </p>
                  <p className="document-word-count">
                    字数 {currentDocumentMetrics?.meaningfulCharacterCount ?? 0}
                  </p>
                </>
              ) : (
                <>
                  <p className="app-version-label">{appVersionLabel}</p>
                  {appUpdateStatusLabel ? (
                    <p className="app-update-status">{appUpdateStatusLabel}</p>
                  ) : null}
                </>
              )}
            </div>
          </footer>
        </div>
      </div>

      {isSettingsDrawerVisible ? (
        <div
          data-fishmark-dialog="settings-drawer"
          data-fishmark-overlay-style="floating-drawer"
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
      style={{ "--fishmark-titlebar-height": "0px" } as CSSProperties}
    >
      <div className="app-shell-fallback">
        <p
          className="error-banner"
          role="alert"
        >
          FishMark bridge unavailable. Reload the window or restart the dev shell.
        </p>
      </div>
    </main>
  );
}
