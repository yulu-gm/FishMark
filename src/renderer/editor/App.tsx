import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { ActiveBlockState } from "@yulora/editor-core";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type ThemeMode
} from "../../shared/preferences";
import { CodeEditorView, type CodeEditorHandle } from "../code-editor-view";
import { createEditorTestDriver } from "../editor-test-driver";
import {
  createThemeRuntime,
  resolveBuiltinThemeDescriptor,
  type ThemeDescriptor as RuntimeThemeDescriptor
} from "../theme-runtime";
import {
  type AppState,
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  createInitialAppState,
  startAutosavingDocument,
  startManualSavingDocument,
  startOpeningMarkdownFile
} from "../document-state";
import { getDocumentMetrics } from "../document-metrics";
import { SettingsView } from "./settings-view";

type ResolvedThemeMode = Exclude<ThemeMode, "system">;
type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_ATTRIBUTE = "data-yulora-theme";
const UI_FONT_SIZE_CSS_VAR = "--yulora-ui-font-size";
const DOCUMENT_FONT_FAMILY_CSS_VAR = "--yulora-document-font-family";
const DOCUMENT_FONT_SIZE_CSS_VAR = "--yulora-document-font-size";
const LEGACY_EDITOR_FONT_FAMILY_CSS_VAR = "--yulora-editor-font-family";
const LEGACY_EDITOR_FONT_SIZE_CSS_VAR = "--yulora-editor-font-size";

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

  if (preferences.ui.fontSize !== null) {
    root.style.setProperty(UI_FONT_SIZE_CSS_VAR, `${preferences.ui.fontSize}px`);
  } else {
    root.style.removeProperty(UI_FONT_SIZE_CSS_VAR);
  }

  if (preferences.document.fontFamily) {
    root.style.setProperty(DOCUMENT_FONT_FAMILY_CSS_VAR, preferences.document.fontFamily);
    root.style.setProperty(LEGACY_EDITOR_FONT_FAMILY_CSS_VAR, preferences.document.fontFamily);
  } else {
    root.style.removeProperty(DOCUMENT_FONT_FAMILY_CSS_VAR);
    root.style.removeProperty(LEGACY_EDITOR_FONT_FAMILY_CSS_VAR);
  }

  if (preferences.document.fontSize !== null) {
    const value = `${preferences.document.fontSize}px`;
    root.style.setProperty(DOCUMENT_FONT_SIZE_CSS_VAR, value);
    root.style.setProperty(LEGACY_EDITOR_FONT_SIZE_CSS_VAR, value);
  } else {
    root.style.removeProperty(DOCUMENT_FONT_SIZE_CSS_VAR);
    root.style.removeProperty(LEGACY_EDITOR_FONT_SIZE_CSS_VAR);
  }
}

function clearDocumentPreferences(root: HTMLElement): void {
  root.removeAttribute(THEME_ATTRIBUTE);
  root.style.removeProperty(UI_FONT_SIZE_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(DOCUMENT_FONT_SIZE_CSS_VAR);
  root.style.removeProperty(LEGACY_EDITOR_FONT_FAMILY_CSS_VAR);
  root.style.removeProperty(LEGACY_EDITOR_FONT_SIZE_CSS_VAR);
}

function toRuntimeThemeDescriptor(theme: ThemeCatalogEntry): RuntimeThemeDescriptor {
  return {
    id: theme.id,
    source: theme.source,
    partUrls: theme.partUrls
  };
}

function resolveActiveThemeDescriptor(
  preferences: Preferences,
  catalog: ThemeCatalogEntry[],
  resolvedThemeMode: ResolvedThemeMode
): RuntimeThemeDescriptor {
  const selectedId = preferences.theme.selectedId;

  if (selectedId) {
    const selectedTheme = catalog.find((theme) => theme.id === selectedId);

    if (selectedTheme) {
      return toRuntimeThemeDescriptor(selectedTheme);
    }
  }

  return resolveBuiltinThemeDescriptor(
    resolvedThemeMode === "dark" ? "default-dark" : "default-light"
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [themes, setThemes] = useState<ThemeCatalogEntry[]>([]);
  const [isRefreshingThemes, setIsRefreshingThemes] = useState(false);
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
  const currentDocumentContent = state.currentDocument
    ? (editorContentRef.current || state.currentDocument.content)
    : "";
  const currentDocumentMetrics = state.currentDocument
    ? getDocumentMetrics(currentDocumentContent)
    : null;
  const saveStatusLabel =
    state.saveState === "manual-saving"
      ? "Saving changes..."
      : state.saveState === "autosaving"
        ? "Autosaving..."
        : state.isDirty
          ? "Unsaved changes"
          : "All changes saved";

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

  function resetAutosaveRuntime(): void {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }

  async function runAutosave(): Promise<void> {
    clearAutosaveTimer();

    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || !snapshot.isDirty || inFlightSaveOriginRef.current) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startAutosavingDocument(current));

    const result = await yulora.saveMarkdownFile({
      path: snapshot.currentDocument.path,
      content: getEditorContent()
    });

    const effectiveResult =
      result.status === "error"
        ? {
            ...result,
            error: {
              ...result.error,
              message: AUTOSAVE_FAILED_MESSAGE
            }
          }
        : result;

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, effectiveResult);

      return effectiveResult.status === "success"
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

    if (!nextState.currentDocument || !nextState.isDirty) {
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

  function syncThemes(nextThemes: ThemeCatalogEntry[]): void {
    setThemes(nextThemes);
  }

  async function handleRefreshThemes(): Promise<void> {
    setIsRefreshingThemes(true);

    try {
      const nextThemes = await yulora.refreshThemes();
      syncThemes(nextThemes);
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
    setIsSettingsOpen(false);

    if (shouldRestoreEditorFocusRef.current) {
      shouldRestoreEditorFocusRef.current = false;
      pendingFocusRestoreRef.current = "editor";
      return;
    }

    pendingFocusRestoreRef.current = "settings-entry";
  }

  const handleOpenMarkdown = useEffectEvent(async (): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFile();

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleOpenMarkdownFromPath = useEffectEvent(async (targetPath: string): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFileFromPath(targetPath);

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleSaveMarkdown = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFile({
        path: currentDocument.path,
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
      if (command === "open-markdown-file") {
        void handleOpenMarkdown();
        return;
      }

      if (command === "save-markdown-file") {
        void handleSaveMarkdown();
        return;
      }

      void handleSaveMarkdownAs();
    });
  }, [yulora]);

  useEffect(() => {
    return yulora.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [yulora]);

  useEffect(() => {
    let isCancelled = false;

    void Promise.all([yulora.getPreferences(), yulora.listThemes()])
      .then(([nextPreferences, nextThemes]) => {
        if (isCancelled) {
          return;
        }

        handlePreferencesSync(nextPreferences);
        syncThemes(nextThemes);
      })
      .catch(() => {
        // Keep defaults when the bridge is temporarily unavailable.
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
    const themeRuntime = themeRuntimeRef.current ?? createThemeRuntime(document);
    themeRuntimeRef.current = themeRuntime;

    const applyCurrentTheme = () => {
      const root = document.documentElement;
      const resolvedThemeMode = resolveThemeMode(preferences.theme.mode);

      applyPreferencesToDocument(root, preferences, resolvedThemeMode);
      themeRuntime.applyTheme(resolveActiveThemeDescriptor(preferences, themes, resolvedThemeMode));
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
    if (isSettingsOpen || pendingFocusRestoreRef.current === null) {
      return;
    }

    if (pendingFocusRestoreRef.current === "editor") {
      editorRef.current?.focus();
    } else {
      settingsEntryRef.current?.focus();
    }

    pendingFocusRestoreRef.current = null;
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettingsDrawer();
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
      themeRuntimeRef.current?.clear();
      clearDocumentPreferences(document.documentElement);
    },
    []
  );

  return (
    <main className="app-shell">
      <>
        <div className="app-layout">
          <aside
            className="app-rail"
            data-yulora-layout="rail"
          >
            <div className="app-rail-brand">
              <p className="app-name">Yulora</p>
              <p className="app-subtitle">Markdown workspace</p>
            </div>
            <div className="app-rail-nav">
              <span className="app-rail-label">Workspace</span>
              <span className="app-rail-label">Outline</span>
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
            data-yulora-layout="workspace"
          >
            <header className="app-header">
              <div className="app-brand">
                <p className="app-name">Yulora</p>
                <p className="app-subtitle">Local-first Markdown writing workspace</p>
              </div>
              <p className="app-hint">
                {state.openState === "opening"
                  ? "Opening document..."
                  : state.currentDocument
                    ? "Use File to open, save, or save as."
                    : "Use File > Open... to load a Markdown document."}
              </p>
            </header>

            {state.errorMessage ? (
              <p
                className="error-banner"
                role="alert"
              >
                {state.errorMessage}
              </p>
            ) : null}

            {state.currentDocument ? (
              <section className="workspace-shell">
                <div
                  className="document-bar"
                  data-yulora-region="document-header"
                >
                  <div className="document-meta">
                    <h1>{state.currentDocument.name}</h1>
                    <p className="document-path">{state.currentDocument.path}</p>
                  </div>
                </div>
                <div
                  className="document-canvas"
                  ref={editorContainerRef}
                >
                  <CodeEditorView
                    ref={editorRef}
                    initialContent={state.currentDocument.content}
                    loadRevision={state.editorLoadRevision}
                    onActiveBlockChange={(nextActiveBlockState) => {
                      activeBlockStateRef.current = nextActiveBlockState;
                    }}
                    onChange={(nextContent) => {
                      editorContentRef.current = nextContent;
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
                <div
                  className="document-status-strip"
                  data-yulora-region="status-strip"
                >
                  <p className={`save-status ${state.isDirty ? "is-dirty" : "is-clean"}`}>
                    {saveStatusLabel}
                  </p>
                  <p className="document-word-count">字数 {currentDocumentMetrics?.meaningfulCharacterCount ?? 0}</p>
                  <p className="document-platform">Bridge: {yulora.platform}</p>
                </div>
              </section>
            ) : (
              <section className="empty-workspace">
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
          </div>
        </div>

        {isSettingsOpen ? (
            <div
              data-yulora-dialog="settings-drawer"
              onClick={closeSettingsDrawer}
            >
              <div onClick={(event) => event.stopPropagation()}>
                <SettingsView
                preferences={preferences}
                  themes={themes}
                  isRefreshingThemes={isRefreshingThemes}
                  onRefreshThemes={handleRefreshThemes}
                  onUpdate={(patch) => yulora.updatePreferences(patch)}
                  onClose={closeSettingsDrawer}
                />
              </div>
            </div>
        ) : null}
      </>
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
