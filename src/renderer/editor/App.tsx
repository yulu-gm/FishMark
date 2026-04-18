import { Suspense, lazy, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { TEXT_EDITING_SHORTCUTS, type ActiveBlockState } from "@yulora/editor-core";
import type { AppNotification, AppUpdateState } from "../../shared/app-update";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type ThemeMode
} from "../../shared/preferences";
import { CodeEditorView, type CodeEditorHandle } from "../code-editor-view";
import { createEditorTestDriver } from "../editor-test-driver";
import { deriveOutlineItems, type OutlineItem } from "../outline";
import {
  createThemeRuntime,
  resolveBuiltinThemeDescriptor,
  type ThemeDescriptor as RuntimeThemeDescriptor
} from "../theme-runtime";
import { resolveThemeCatalogEntry } from "../theme-catalog";
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
import { ShortcutHintOverlay, ShortcutHintOverlayMeasure } from "./shortcut-hint-overlay";

const SettingsView = lazy(async () => {
  const module = await import("./settings-view");
  return { default: module.SettingsView };
});

type ResolvedThemeMode = Exclude<ThemeMode, "system">;
type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];
type ThemeFallbackReason = "missing-theme" | "unsupported-mode" | null;
type ActiveThemeResolution = {
  requestedThemeId: string | null;
  resolvedMode: ResolvedThemeMode;
  activeThemeId: string;
  activeThemeSource: "builtin" | "community";
  fallbackReason: ThemeFallbackReason;
  descriptor: RuntimeThemeDescriptor;
};

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_ATTRIBUTE = "data-yulora-theme";
const UI_FONT_SIZE_CSS_VAR = "--yulora-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--yulora-document-font-family";
const DOCUMENT_CJK_FONT_FAMILY_CSS_VAR = "--yulora-document-cjk-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--yulora-document-font-size";
const OUTLINE_EXIT_ANIMATION_MS = 180;
const SETTINGS_DRAWER_EXIT_ANIMATION_MS = 180;
const APP_NOTIFICATION_DURATION_MS = 3000;
const APP_NOTIFICATION_EXIT_ANIMATION_MS = 180;
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

function clearDocumentPreferences(root: HTMLElement): void {
  root.removeAttribute(THEME_ATTRIBUTE);
  root.style.removeProperty("color-scheme");
  root.style.removeProperty(UI_FONT_SIZE_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(DOCUMENT_CJK_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_SIZE_CSS_VAR);
}

function toRuntimeThemeDescriptorForMode(
  theme: ThemeCatalogEntry,
  resolvedThemeMode: ResolvedThemeMode
): RuntimeThemeDescriptor {
  return {
    id: theme.id,
    source: theme.source,
    partUrls: theme.modes[resolvedThemeMode].partUrls
  };
}

function resolveActiveThemeResolution(
  preferences: Preferences,
  catalog: ThemeCatalogEntry[],
  resolvedThemeMode: ResolvedThemeMode
): ActiveThemeResolution {
  const selectedId = preferences.theme.selectedId;

  if (!selectedId) {
    return {
      requestedThemeId: null,
      resolvedMode: resolvedThemeMode,
      activeThemeId: "default",
      activeThemeSource: "builtin",
      fallbackReason: null,
      descriptor: resolveBuiltinThemeDescriptor(resolvedThemeMode)
    };
  }

  const selectedTheme = resolveThemeCatalogEntry(catalog, selectedId);

  if (!selectedTheme) {
    return {
      requestedThemeId: selectedId,
      resolvedMode: resolvedThemeMode,
      activeThemeId: "default",
      activeThemeSource: "builtin",
      fallbackReason: "missing-theme",
      descriptor: resolveBuiltinThemeDescriptor(resolvedThemeMode)
    };
  }

  if (!selectedTheme.modes[resolvedThemeMode].available) {
    return {
      requestedThemeId: selectedId,
      resolvedMode: resolvedThemeMode,
      activeThemeId: "default",
      activeThemeSource: "builtin",
      fallbackReason: "unsupported-mode",
      descriptor: resolveBuiltinThemeDescriptor(resolvedThemeMode)
    };
  }

  return {
    requestedThemeId: selectedId,
    resolvedMode: resolvedThemeMode,
    activeThemeId: selectedTheme.id,
    activeThemeSource: selectedTheme.source,
    fallbackReason: null,
    descriptor: toRuntimeThemeDescriptorForMode(selectedTheme, resolvedThemeMode)
  };
}

function resolveThemeWarningMessage(
  resolution: ActiveThemeResolution
): string | null {
  if (resolution.fallbackReason === "unsupported-mode") {
    return `该主题不支持${resolution.resolvedMode === "light" ? "浅色" : "深色"}模式，已回退到 Yulora 默认。`;
  }

  if (resolution.fallbackReason === "missing-theme") {
    return "已配置主题未找到，已回退到 Yulora 默认。";
  }

  return null;
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
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [fontFamilies, setFontFamilies] = useState<string[]>([]);
  const [themes, setThemes] = useState<ThemeCatalogEntry[]>([]);
  const [isRefreshingThemes, setIsRefreshingThemes] = useState(false);
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({
    kind: "idle"
  });
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [notificationState, setNotificationState] = useState<AppNotificationBannerState>("hidden");
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isShortcutModifierHeld, setIsShortcutModifierHeld] = useState(false);
  const [isShortcutHintLaneSafe, setIsShortcutHintLaneSafe] = useState(false);
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
  const themeRuntimeRef = useRef<ReturnType<typeof createThemeRuntime> | null>(null);
  const outlineCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThemeNotificationKeyRef = useRef<string | null>(null);
  const fontFamilyLoadStateRef = useRef<"idle" | "loading" | "loaded">("idle");
  const pressedShortcutModifiersRef = useRef<Set<string>>(new Set());
  const currentDocumentContent = state.currentDocument
    ? (editorContentRef.current || state.currentDocument.content)
    : "";
  const currentDocumentMetrics = state.currentDocument
    ? getDocumentMetrics(currentDocumentContent)
    : null;
  const isDocumentOpen = Boolean(state.currentDocument);
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
  const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);
  const activeThemeResolution = resolveActiveThemeResolution(
    preferences,
    themes,
    resolvedThemeMode
  );
  const themeWarningMessage = resolveThemeWarningMessage(activeThemeResolution);
  const shortcutHintModifierKey: "Control" | "Meta" = yulora.platform === "darwin" ? "Meta" : "Control";
  const isShortcutHintVisible =
    isDocumentOpen && isEditorFocused && isShortcutModifierHeld && isShortcutHintLaneSafe;

  function applyState(updater: (current: AppState) => AppState): void {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }

  function getEditorContent(): string {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }

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

  function clearNotificationTimers(): void {
    if (notificationHideTimerRef.current !== null) {
      clearTimeout(notificationHideTimerRef.current);
      notificationHideTimerRef.current = null;
    }

    if (notificationCloseTimerRef.current !== null) {
      clearTimeout(notificationCloseTimerRef.current);
      notificationCloseTimerRef.current = null;
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
  }, []);

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

  async function handleRefreshThemes(): Promise<void> {
    setIsRefreshingThemes(true);

    try {
      const nextThemes = await yulora.refreshThemes();
      setThemes(nextThemes);
    } finally {
      setIsRefreshingThemes(false);
    }
  }

  function openSettingsDrawer(): void {
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

    const detach = yulora.onPreferencesChanged((nextPreferences) => {
      handlePreferencesSync(nextPreferences);
    });

    return () => {
      isCancelled = true;
      detach();
    };
  }, [yulora]);

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (!editorContainer) {
      return undefined;
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        setIsEditorFocused(true);
      }
    };

    const handleFocusOut = () => {
      const activeElement = document.activeElement;
      setIsEditorFocused(activeElement instanceof Node && editorContainer.contains(activeElement));
    };

    editorContainer.addEventListener("focusin", handleFocusIn);
    editorContainer.addEventListener("focusout", handleFocusOut);

    return () => {
      editorContainer.removeEventListener("focusin", handleFocusIn);
      editorContainer.removeEventListener("focusout", handleFocusOut);
    };
  }, [isDocumentOpen, state.editorLoadRevision]);

  useEffect(() => {
    const syncShortcutModifierState = () => {
      setIsShortcutModifierHeld(pressedShortcutModifiersRef.current.size > 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      pressedShortcutModifiersRef.current.add(modifierId);
      syncShortcutModifierState();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const modifierId = getPrimaryShortcutModifierId(event, shortcutHintModifierKey);

      if (!modifierId) {
        return;
      }

      pressedShortcutModifiersRef.current.delete(modifierId);
      syncShortcutModifierState();
    };

    const handleWindowBlur = () => {
      pressedShortcutModifiersRef.current.clear();
      setIsEditorFocused(false);
      syncShortcutModifierState();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [shortcutHintModifierKey]);

  useEffect(() => {
    if (isDocumentOpen) {
      return;
    }

    pressedShortcutModifiersRef.current.clear();
    setIsEditorFocused(false);
    setIsShortcutModifierHeld(false);
    setIsShortcutHintLaneSafe(false);
  }, [isDocumentOpen]);

  useEffect(() => {
    if (!isDocumentOpen) {
      return;
    }

    const editorContainer = editorContainerRef.current;
    const contentColumn = editorContainer?.querySelector(".cm-content");
    const measureOverlay = editorContainer?.querySelector('[data-yulora-region="shortcut-hint-overlay-measure"]');

    if (
      !(editorContainer instanceof HTMLDivElement) ||
      !(contentColumn instanceof HTMLElement) ||
      !(measureOverlay instanceof HTMLElement)
    ) {
      setIsShortcutHintLaneSafe(false);
      return;
    }

    const syncShortcutHintLaneSafety = () => {
      const containerRect = editorContainer.getBoundingClientRect();
      const contentRect = contentColumn.getBoundingClientRect();
      const measureRect = measureOverlay.getBoundingClientRect();
      const availableLeftLane = contentRect.left - containerRect.left;
      const requiredLeftLane = Math.max(0, measureRect.right - containerRect.left);

      setIsShortcutHintLaneSafe(availableLeftLane >= requiredLeftLane);
    };

    syncShortcutHintLaneSafety();

    if (typeof window.ResizeObserver !== "function") {
      window.addEventListener("resize", syncShortcutHintLaneSafety);
      return () => window.removeEventListener("resize", syncShortcutHintLaneSafety);
    }

    const resizeObserver = new window.ResizeObserver(() => {
      syncShortcutHintLaneSafety();
    });

    resizeObserver.observe(editorContainer);
    resizeObserver.observe(contentColumn);
    resizeObserver.observe(measureOverlay);
    window.addEventListener("resize", syncShortcutHintLaneSafety);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncShortcutHintLaneSafety);
    };
  }, [isDocumentOpen, state.editorLoadRevision]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void handleLoadFontFamilies();
  }, [isSettingsOpen]);

  useEffect(() => {
    const themeRuntime = themeRuntimeRef.current ?? createThemeRuntime(document);
    themeRuntimeRef.current = themeRuntime;

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);
      const activeThemeResolution = resolveActiveThemeResolution(
        preferences,
        themes,
        resolvedThemeMode
      );

      applyPreferencesToDocument(root, preferences, resolvedThemeMode);
      themeRuntime.applyTheme(activeThemeResolution.descriptor);
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
  }, [preferences, themes]);

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

    const notificationKey = `${activeThemeResolution.requestedThemeId ?? "default"}:${activeThemeResolution.resolvedMode}:${activeThemeResolution.fallbackReason ?? "none"}`;

    if (lastThemeNotificationKeyRef.current === notificationKey) {
      return;
    }

    lastThemeNotificationKeyRef.current = notificationKey;
    showNotification({
      kind: "warning",
      message: themeWarningMessage
    });
  }, [
    activeThemeResolution.fallbackReason,
    activeThemeResolution.requestedThemeId,
    activeThemeResolution.resolvedMode,
    showNotification,
    themeWarningMessage
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
      clearNotificationTimers();
      themeRuntimeRef.current?.clear();
      clearDocumentPreferences(document.documentElement);
    },
    []
  );

  return (
    <main className="app-shell">
      <div className="app-layout">
        <aside
          className="app-rail"
          data-yulora-layout="rail"
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
                <div
                  data-yulora-region="shortcut-hint-overlay-shell"
                  className="document-canvas"
                  ref={editorContainerRef}
                  data-shortcut-hint-state={isShortcutHintVisible ? "visible" : "hidden"}
                >
                  <div data-shortcut-hint-shell="true">
                    <ShortcutHintOverlayMeasure
                      platform={yulora.platform}
                      shortcuts={TEXT_EDITING_SHORTCUTS}
                    />
                    <ShortcutHintOverlay
                      visible={isShortcutHintVisible}
                      platform={yulora.platform}
                      shortcuts={TEXT_EDITING_SHORTCUTS}
                    />
                  </div>
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
                themes={themes}
                isRefreshingThemes={isRefreshingThemes}
                onRefreshThemes={handleRefreshThemes}
                onUpdate={(patch) => yulora.updatePreferences(patch)}
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
    <main className="app-shell">
      <p
        className="error-banner"
        role="alert"
      >
        Yulora bridge unavailable. Reload the window or restart the dev shell.
      </p>
    </main>
  );
}
