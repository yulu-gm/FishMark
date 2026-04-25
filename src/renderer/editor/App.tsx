import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";

import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP,
  type ActiveBlockState,
  type ShortcutGroup,
  type ShortcutGroupId
} from "@fishmark/editor-core";
import type { AppNotification, AppUpdateState } from "../../shared/app-update";
import type { AppMenuCommand } from "../../shared/menu-command";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesUpdate,
} from "../../shared/preferences";
import type { CodeEditorHandle } from "../code-editor-view";
import { deriveOutlineItems, type OutlineItem } from "../outline";
import { createThemePackageRuntime } from "../theme-package-runtime";
import { getDocumentMetrics } from "../document-metrics";
import {
  applyThemeParameterCssVariables,
  clearThemeParameterCssVariables,
} from "../theme-style-runtime";
import {
  applyThemeRuntimeEnv,
  clearThemeRuntimeEnv,
} from "../theme-runtime-env";
import { EditorTestBridgeHost } from "./editor-test-bridge-host";
import {
  normalizeTitlebarLayout,
  resolveDefaultTitlebarLayout
} from "./titlebar-layout";
import {
  type ThemeDynamicAggregateMode,
  shouldWarnForThemeDynamicFallback,
} from "./theme-dynamic-mode";
import { type ExternalMarkdownFileState } from "./editor-shell-state";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";
import { WorkspaceShell } from "./WorkspaceShell";
import { useEditorApplicationController } from "./useEditorApplicationController";
import { useSettingsController } from "./useSettingsController";
import {
  resolveActiveThemePackageManifest,
  useThemeController,
  type ResolvedThemeMode
} from "./useThemeController";

const EXTERNAL_FILE_MODIFIED_PENDING_MESSAGE =
  "当前文件已被外部修改。请先决定是重载磁盘版本，还是保留当前编辑并另存为。";
const EXTERNAL_FILE_DELETED_PENDING_MESSAGE =
  "当前文件已在磁盘上被删除或移走。你可以重载、保留当前编辑，或另存为新文件。";
const EXTERNAL_FILE_KEEPING_MEMORY_MESSAGE =
  "正在保留当前内存版本，autosave 已暂停。请另存为新文件，避免覆盖外部变化。";
const THEME_ATTRIBUTE = "data-fishmark-theme";
const UI_FONT_FAMILY_CSS_VAR = "--fishmark-ui-font-family";
const UI_FONT_SIZE_CSS_VAR = "--fishmark-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--fishmark-document-font-family";
const DOCUMENT_CJK_FONT_FAMILY_CSS_VAR = "--fishmark-document-cjk-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--fishmark-document-font-size";
const THEME_DYNAMIC_MODE_ATTRIBUTE = "data-fishmark-theme-dynamic-mode";
const OUTLINE_EXIT_ANIMATION_MS = 180;
const SETTINGS_DRAWER_EXIT_ANIMATION_MS = 180;

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

export function isFocusedEditorInteractiveElement(editorContainer: HTMLElement | null): boolean {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof Element) || !editorContainer?.contains(activeElement)) {
    return false;
  }

  return Boolean(activeElement.closest(EDITOR_INTERACTIVE_TARGET_SELECTOR));
}

function supportsControlledTitlebar(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
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

export default function EditorApp() {
  const fishmark = window.fishmark;

  if (!fishmark) {
    return <BridgeUnavailableApp />;
  }

  return (
    <EditorShell
      fishmark={fishmark}
      fishmarkTest={window.fishmarkTest}
    />
  );
}

function EditorShell({
  fishmark,
  fishmarkTest
}: {
  fishmark: Window["fishmark"];
  fishmarkTest?: Window["fishmarkTest"];
}) {
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isOutlineClosing, setIsOutlineClosing] = useState(false);
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
  const preferencesRef = useRef<Preferences>(DEFAULT_PREFERENCES);
  const settingsEntryRef = useRef<HTMLButtonElement | null>(null);
  const themePackageRuntimeRef = useRef<ReturnType<typeof createThemePackageRuntime> | null>(null);
  const outlineCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutHintHoldTimerRef = useRef<number | null>(null);
  const lastEditorPointerIntentRef = useRef<"editing" | "blank" | null>(null);
  const pendingEditorOpenBlurTokenRef = useRef(0);
  const lastThemeNotificationKeyRef = useRef<string | null>(null);
  const lastThemeDynamicNotificationKeyRef = useRef<string | null>(null);
  const fontFamilyLoadStateRef = useRef<"idle" | "loading" | "loaded">("idle");
  const pressedShortcutModifiersRef = useRef<Set<string>>(new Set());
  const draggedWorkspaceTabIdRef = useRef<string | null>(null);
  const handledWorkspaceTabDropRef = useRef(false);
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

  const getEditorContent = useCallback((): string => {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }, []);

  const editorApplicationController = useEditorApplicationController({
    fishmark,
    getEditorContent,
    setEditorContentSnapshot: (content) => {
      editorContentRef.current = content;
    },
    updateOutline: (content) => {
      setOutlineItems(deriveOutlineItems(content));
    },
    autosaveDelayMs: preferences.autosave.idleDelayMs,
    showNotification
  });
  const workspaceController = editorApplicationController.workspace;
  const saveController = editorApplicationController.save;
  const externalConflictController = editorApplicationController.externalConflict;
  const editorWorkflowController = editorApplicationController.editorWorkflow;
  const editorCommands = editorApplicationController.commands;
  const {
    handleEditorContentChange,
    handleEditorBlur,
    activateWorkspaceTab: activateWorkspaceTabWorkflow,
    closeWorkspaceTab: closeWorkspaceTabWorkflow,
    detachWorkspaceTab: detachWorkspaceTabWorkflow
  } = editorWorkflowController;
  const {
    state,
    activeDocument,
    openState,
    editorLoadRevision,
    getActiveDocument: getWorkspaceActiveDocument,
    reorderWorkspaceTab,
    loadInitialWorkspaceSnapshot,
    applyState: applyWorkspaceState,
    getState: getWorkspaceState
  } = workspaceController;
  const {
    resetAutosaveRuntime,
    scheduleAutosave,
    getEffectiveSaveState
  } = saveController;
  const effectiveSaveState = getEffectiveSaveState(activeDocument);
  const currentDocumentContent = activeDocument
    ? (editorContentRef.current || activeDocument.content)
    : "";
  const currentDocumentMetrics = activeDocument ? getDocumentMetrics(currentDocumentContent) : null;
  const currentDocumentWordCount = currentDocumentMetrics?.meaningfulCharacterCount ?? 0;
  const settingsController = useSettingsController({
    activeDocument,
    editorContainerRef,
    editorRef,
    settingsEntryRef,
    exitAnimationMs: SETTINGS_DRAWER_EXIT_ANIMATION_MS,
    onOpenWithActiveDocument: () => {
      setShellMode("editing");
    }
  });
  const {
    captureSettingsOpenOrigin,
    clearSettingsCloseTimer,
    closeSettingsDrawer,
    isSettingsClosing,
    isSettingsOpen,
    isSettingsDrawerVisible,
    openSettingsDrawer
  } = settingsController;
  const isDocumentOpen = activeDocument !== null;
  const isReadingMode = shellMode === "reading";
  const isDocumentReadingMode = isDocumentOpen && isReadingMode;
  const isOutlinePanelVisible = isOutlineOpen || isOutlineClosing;
  const hintText =
    openState === "opening"
      ? "Opening document..."
      : "Use File > Open... to load a Markdown document.";
  const headerEyebrow = isDocumentOpen ? "Current document" : "FishMark";
  const headerTitle = isDocumentOpen
    ? activeDocument?.name ?? "Untitled"
    : "Local-first Markdown writing";
  const headerDetail =
    openState === "opening"
      ? "Opening document..."
      : isDocumentOpen
        ? activeDocument?.path ?? "Not saved yet."
        : "Markdown remains the source of truth, and the writing canvas stays calm and stable.";
  const saveStatusLabel =
    effectiveSaveState === "manual-saving"
      ? "Saving changes..."
      : effectiveSaveState === "autosaving"
        ? "Autosaving..."
        : activeDocument && !activeDocument.path && !activeDocument.isDirty
          ? "Not saved yet"
        : activeDocument?.isDirty
          ? "Unsaved changes"
          : "All changes saved";
  const externalFileConflictMessage = getExternalFileConflictMessage(
    externalConflictController.externalFileState
  );
  const appUpdateStatusLabel = appUpdateState.kind === "downloading"
    ? `正在下载更新${Number.isFinite(appUpdateState.percent) ? ` ${Math.round(appUpdateState.percent)}%` : "…"}`
    : null;
  const appVersionLabel = `FishMark v${__FISHMARK_APP_VERSION__}`;
  const controlledTitlebarEnabled = supportsControlledTitlebar(fishmark.platform);
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

  const syncThemeRuntimeEnv = useEffectEvent((themeMode: ResolvedThemeMode = resolvedThemeMode): void => {
    applyThemeRuntimeEnv(document.documentElement, createThemeRuntimeEnv(themeMode));
  });

  useEffect(() => {
    editorContentRef.current = activeDocument?.content ?? "";
    activeBlockStateRef.current = null;
    setOutlineItems(activeDocument ? deriveOutlineItems(activeDocument.content) : []);
    setActiveHeadingId(null);
    setActiveShortcutGroupId("default-text");
    setActiveTableToolId(null);
  }, [activeDocument, editorLoadRevision]);

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

  function clearOutlineCloseTimer(): void {
    if (outlineCloseTimerRef.current !== null) {
      clearTimeout(outlineCloseTimerRef.current);
      outlineCloseTimerRef.current = null;
    }
  }

  const enterEditingMode = useCallback((): void => {
    pendingEditorOpenBlurTokenRef.current += 1;
    setShellMode("editing");
  }, []);

  const blurFocusedEditorElement = useCallback((): void => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && editorContainerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, []);

  const cancelPendingEditorOpenBlur = useCallback((): void => {
    pendingEditorOpenBlurTokenRef.current += 1;
  }, []);

  const blurFocusedEditorElementAfterOpen = useCallback((): void => {
    const blurToken = pendingEditorOpenBlurTokenRef.current + 1;
    pendingEditorOpenBlurTokenRef.current = blurToken;
    blurFocusedEditorElement();
    requestAnimationFrame(() => {
      if (pendingEditorOpenBlurTokenRef.current !== blurToken) {
        return;
      }

      blurFocusedEditorElement();
      requestAnimationFrame(() => {
        if (pendingEditorOpenBlurTokenRef.current !== blurToken) {
          return;
        }

        blurFocusedEditorElement();
      });
    });
  }, [blurFocusedEditorElement]);

  const enterReadingMode = useCallback((): void => {
    if (
      !activeDocument ||
      isSettingsOpen ||
      isSettingsClosing
    ) {
      return;
    }

    setShellMode("reading");
    blurFocusedEditorElement();
  }, [
    activeDocument,
    blurFocusedEditorElement,
    isSettingsClosing,
    isSettingsOpen
  ]);

  const handleAppWorkspaceMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      if (event.button !== 0 || !activeDocument) {
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
    [activeDocument, enterReadingMode]
  );

  function clearShortcutHintHoldTimer(): void {
    if (shortcutHintHoldTimerRef.current !== null) {
      clearTimeout(shortcutHintHoldTimerRef.current);
      shortcutHintHoldTimerRef.current = null;
    }
  }

  const handlePreferencesSync = useEffectEvent((nextPreferences: Preferences): void => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    scheduleAutosave();
  });

  const handleWorkspaceWindowCloseRequest = useEffectEvent(async (): Promise<boolean> => {
    return editorCommands.confirmWorkspaceWindowClose();
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
    scheduleAutosave();
    return result;
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
    const result = await editorCommands.openMarkdown();

    if (result === "opened") {
      setShellMode("reading");
      blurFocusedEditorElementAfterOpen();
    }
  }

  async function handleNewMarkdown(): Promise<void> {
    const created = await editorCommands.createUntitledMarkdown();

    if (created) {
      setShellMode("editing");
    }
  }

  const handleOpenMarkdownFromPath = useCallback(async (targetPath: string): Promise<void> => {
    const opened = await editorCommands.openMarkdownFromPath(targetPath);

    if (opened) {
      setShellMode("reading");
      blurFocusedEditorElementAfterOpen();
    }
  }, [
    blurFocusedEditorElementAfterOpen,
    editorCommands
  ]);

  async function handleActivateWorkspaceTab(tabId: string): Promise<void> {
    await activateWorkspaceTabWorkflow(tabId);
  }

  const handleCloseWorkspaceTab = useCallback(async (tabId: string): Promise<void> => {
    await closeWorkspaceTabWorkflow(tabId);
  }, [
    closeWorkspaceTabWorkflow
  ]);

  const handleReorderWorkspaceTab = useCallback(
    async (tabId: string, toIndex: number): Promise<void> => {
      await reorderWorkspaceTab(tabId, toIndex);
    },
    [reorderWorkspaceTab]
  );

  const handleDetachWorkspaceTab = useCallback(async (tabId: string): Promise<void> => {
    await detachWorkspaceTabWorkflow(tabId);
  }, [
    detachWorkspaceTabWorkflow
  ]);

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
        hasOpenDocument: getWorkspaceActiveDocument() !== null
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
    await editorCommands.saveMarkdown();
  }

  async function handleSaveMarkdownAs(): Promise<void> {
    await editorCommands.saveMarkdownAs();
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

  const editorTestBridge = useMemo(
    () => ({
      getState: getWorkspaceState,
      applyState: applyWorkspaceState,
      resetAutosaveRuntime,
      editor: {
        getContent: getEditorContent,
        setContent: (content: string) => {
          editorRef.current?.setContent(content);
        },
        insertText: (text: string) => {
          editorRef.current?.insertText(text);
        },
        getSelection: () =>
          editorRef.current?.getSelection() ?? {
            anchor: 0,
            head: 0
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
      openWorkspaceFileFromPath: (targetPath: string) =>
        fishmark.openWorkspaceFileFromPath(targetPath),
      saveMarkdownFile: (input: { tabId: string; path: string }) => fishmark.saveMarkdownFile(input),
      updateWorkspaceTabDraft: (input: { tabId: string; content: string }) =>
        fishmark.updateWorkspaceTabDraft(input),
      getWorkspaceSnapshot: () => fishmark.getWorkspaceSnapshot()
    }),
    [
      fishmark,
      getEditorContent,
      applyWorkspaceState,
      getWorkspaceState,
      resetAutosaveRuntime
    ]
  );

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
    return fishmark.onWorkspaceWindowCloseRequest(() => handleWorkspaceWindowCloseRequest());
  }, [fishmark]);

  useEffect(() => {
    void fishmark.syncWatchedMarkdownFile({
      tabId: activeDocument?.tabId ?? null
    });
  }, [activeDocument?.path, activeDocument?.tabId, fishmark]);

  useEffect(() => {
    let isCancelled = false;

    void loadInitialWorkspaceSnapshot().then(async () => {
      if (isCancelled) {
        return;
      }

      const startupOpenPath = startupOpenPathRef.current;

      if (!startupOpenPath) {
        return;
      }

      startupOpenPathRef.current = null;
      await handleOpenMarkdownFromPath(startupOpenPath);
    });

    return () => {
      isCancelled = true;
    };
  }, [handleOpenMarkdownFromPath, loadInitialWorkspaceSnapshot]);

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

        if (isEditingContentClick) {
          if (getWorkspaceActiveDocument()) {
            enterEditingMode();
          }
          return;
        }

        event.preventDefault();
        enterReadingMode();
      }
    };

    const clearLastPointerIntent = () => {
      lastEditorPointerIntentRef.current = null;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        cancelPendingEditorOpenBlur();
        const pointerIntent = lastEditorPointerIntentRef.current;
        lastEditorPointerIntentRef.current = null;
        setIsEditorFocused(true);

        if (pointerIntent !== "editing") {
          return;
        }

        if (getWorkspaceActiveDocument()) {
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
  }, [
    cancelPendingEditorOpenBlur,
    enterEditingMode,
    enterReadingMode,
    getWorkspaceActiveDocument,
    isDocumentOpen,
    state.editorLoadRevision
  ]);

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
      if (isFocusedEditorInteractiveElement(editorContainerRef.current)) {
        return;
      }

      editorRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeDocument?.path, isDocumentOpen, shellMode, state.editorLoadRevision]);

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
    if (
      !isDocumentOpen ||
      isSettingsOpen ||
      isSettingsClosing
    ) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && shellMode === "editing") {
        enterReadingMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enterReadingMode,
    isDocumentOpen,
    isSettingsClosing,
    isSettingsOpen,
    shellMode
  ]);

  useEffect(
    () => () => {
      resetAutosaveRuntime();
      clearOutlineCloseTimer();
      clearSettingsCloseTimer();
      clearNotificationTimers();
      themePackageRuntimeRef.current?.clear();
      clearThemeDynamicModeFromDocument(document.documentElement);
      clearThemeRuntimeEnv(document.documentElement);
      clearDocumentPreferences(document.documentElement);
    },
    [clearNotificationTimers, clearSettingsCloseTimer, resetAutosaveRuntime]
  );

  const handleActiveBlockChange = useCallback((nextActiveBlockState: ActiveBlockState): void => {
    activeBlockStateRef.current = nextActiveBlockState;
    setActiveShortcutGroupId(resolveEditorShortcutGroup(nextActiveBlockState).id);
    setActiveHeadingId(
      nextActiveBlockState.activeBlock?.type === "heading"
        ? nextActiveBlockState.activeBlock.id
        : null
    );
  }, []);

  const handleReloadExternalFile = useCallback((): void => {
    void externalConflictController.reloadFromDisk().then(() => {
      setShellMode("reading");
    });
  }, [externalConflictController]);

  function handleSaveMarkdownAsCommand(): void {
    void handleSaveMarkdownAs();
  }

  const handleNavigateToOutlineItem = useCallback((startOffset: number): void => {
    editorRef.current?.navigateToOffset(startOffset);
  }, []);

  const handleTableToolHoverChange = useCallback((toolId: string | null): void => {
    setActiveTableToolId((current) => (current === toolId ? current : toolId));
  }, []);

  return (
    <>
      <EditorTestBridgeHost
        fishmarkTest={fishmarkTest}
        getState={editorTestBridge.getState}
        applyState={editorTestBridge.applyState}
        resetAutosaveRuntime={editorTestBridge.resetAutosaveRuntime}
        editor={editorTestBridge.editor}
        setEditorContentSnapshot={editorTestBridge.setEditorContentSnapshot}
        openWorkspaceFileFromPath={editorTestBridge.openWorkspaceFileFromPath}
        saveMarkdownFile={editorTestBridge.saveMarkdownFile}
        updateWorkspaceTabDraft={editorTestBridge.updateWorkspaceTabDraft}
        getWorkspaceSnapshot={editorTestBridge.getWorkspaceSnapshot}
      />
      <WorkspaceShell
        workspaceSnapshot={state.workspaceSnapshot}
        activeHeadingId={activeHeadingId}
        activeShortcutGroup={activeShortcutGroup}
        activeTableToolId={activeTableToolId}
        activeTitlebarSurface={activeTitlebarSurface}
        activeWorkbenchSurface={activeWorkbenchSurface}
        appUpdateStatusLabel={appUpdateStatusLabel}
        appVersionLabel={appVersionLabel}
        controlledTitlebarEnabled={controlledTitlebarEnabled}
        currentDocumentMetrics={currentDocumentMetrics}
        effectiveSaveState={effectiveSaveState}
        editorContainerRef={editorContainerRef}
        editorLoadRevision={state.editorLoadRevision}
        editorRef={editorRef}
        externalFileConflictMessage={externalFileConflictMessage}
        externalFileState={externalConflictController.externalFileState}
        fishmarkPlatform={fishmark.platform}
        fontFamilies={fontFamilies}
        headerDetail={headerDetail}
        headerEyebrow={headerEyebrow}
        headerTitle={headerTitle}
        hintText={hintText}
        isDocumentOpen={isDocumentOpen}
        isOutlineOpen={isOutlineOpen}
        isOutlinePanelVisible={isOutlinePanelVisible}
        isReadingMode={isReadingMode}
        isRefreshingThemePackages={isRefreshingThemePackages}
        isSettingsDrawerVisible={isSettingsDrawerVisible}
        isSettingsOpen={isSettingsOpen}
        isShortcutHintVisible={isShortcutHintVisible}
        notification={notification}
        notificationState={notificationState}
        outlineItems={outlineItems}
        preferences={preferences}
        preferencesThemeEffectsMode={preferences.theme.effectsMode}
        resolvedThemeMode={resolvedThemeMode}
        saveStatusLabel={saveStatusLabel}
        settingsEntryRef={settingsEntryRef}
        shellMode={shellMode}
        themePackages={themePackages}
        themeRuntimeEnv={themeRuntimeEnv}
        titlebarHeight={titlebarLayout.height}
        titlebarLayout={titlebarLayout}
        onActiveBlockChange={handleActiveBlockChange}
        onAppWorkspaceMouseDownCapture={handleAppWorkspaceMouseDownCapture}
        onCaptureSettingsOpenOrigin={captureSettingsOpenOrigin}
        onCloseOutlinePanel={closeOutlinePanel}
        onCloseSettingsDrawer={closeSettingsDrawer}
        onCloseWorkspaceTab={(tabId) => {
          void handleCloseWorkspaceTab(tabId);
        }}
        onDismissExternalFileConflict={externalConflictController.dismissConflict}
        onDraftChange={handleEditorContentChange}
        onEditorBlur={handleEditorBlur}
        onImportClipboardImage={handleImportClipboardImage}
        onInsertTableColumnLeft={insertTableColumnLeft}
        onInsertTableColumnRight={insertTableColumnRight}
        onInsertTableRowAbove={insertTableRowAbove}
        onInsertTableRowBelow={insertTableRowBelow}
        onDeleteTable={deleteTable}
        onDeleteTableColumn={deleteTableColumn}
        onDeleteTableRow={deleteTableRow}
        onKeepMemoryVersion={externalConflictController.keepMemoryVersion}
        onNavigateToOutlineItem={handleNavigateToOutlineItem}
        onOpenOutlinePanel={openOutlinePanel}
        onReloadExternalFile={handleReloadExternalFile}
        onRefreshThemePackages={handleRefreshThemePackages}
        onSaveAs={handleSaveMarkdownAsCommand}
        onSettingsOpen={openSettingsDrawer}
        onTableToolHoverChange={handleTableToolHoverChange}
        onTabActivate={(tabId) => {
          void handleActivateWorkspaceTab(tabId);
        }}
        onTabDragEnd={handleWorkspaceTabDragEnd}
        onTabDragOver={handleWorkspaceTabDragOver}
        onTabDragStart={handleWorkspaceTabDragStart}
        onTabDrop={handleWorkspaceTabDrop}
        onTitlebarSurfaceRuntimeModeChange={handleTitlebarSurfaceRuntimeModeChange}
        onUpdatePreferences={handleUpdatePreferences}
        onWorkbenchSurfaceRuntimeModeChange={handleWorkbenchSurfaceRuntimeModeChange}
      />
    </>
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
