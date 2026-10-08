import {
  Component, Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties, type ReactNode
} from "react";
import { useEditorFocusPresentation } from "./useEditorFocusPresentation";
import { useNotificationPresentation } from "./useNotificationPresentation";
import { useShortcutHintPresentation } from "./useShortcutHintPresentation";
import { useThemePresentation } from "./useThemePresentation";
import { useViewContainerPresentation } from "./useViewContainerPresentation";
import { useWorkspaceTabDrag } from "./useWorkspaceTabDrag";

import type {
  EditorViewMode,
  ShortcutGroupId
} from "@fishmark/codemirror-adapter";
import type { ActiveBlockState } from "@fishmark/editor-model";
import type { AppUpdateState } from "../../shared/app-update";
import type { AppMenuCommand } from "../../shared/menu-command";
import {
  DEFAULT_PREFERENCES,
  clampSidePanelWidth,
  type Preferences,
  type PreferencesUpdate,
} from "../../shared/preferences";
import {
  DEFAULT_RECENT_FILES_SNAPSHOT,
  type RecentFilesSnapshot
} from "../../shared/recent-files";
import type { WorkspaceWindowCloseRequest } from "../../shared/workspace";
import type { EditorLoadIdentity } from "../application/editor-load-identity";
import { type ExternalMarkdownFileState } from "../application/editor-shell-state";
import type { CodeEditorHandle } from "../code-editor-view";
import { WorkspaceShell } from "./WorkspaceShell";
import {
  normalizeTitlebarLayout,
  resolveDefaultTitlebarLayout
} from "./titlebar-layout";
import { useDocumentDerivedDataController } from "./useDocumentDerivedDataController";
import { useEditorApplicationController } from "./useEditorApplicationController";
import { useSettingsController } from "./useSettingsController";
import { useWindowMarkdownFileDrop } from "./useWindowMarkdownFileDrop";

const canRenderEditorTestBridge = import.meta.env.DEV || import.meta.env.MODE === "test";
const LazyEditorTestBridgeHost = canRenderEditorTestBridge
  ? lazy(async () => {
    const module = await import("./editor-test-bridge-host");
    return { default: module.EditorTestBridgeHost };
  })
  : null;

const EXTERNAL_FILE_MODIFIED_PENDING_MESSAGE =
  "当前文件已被外部修改。请先决定是重载磁盘版本，还是保留当前编辑并另存为。";
const EXTERNAL_FILE_DELETED_PENDING_MESSAGE =
  "当前文件已在磁盘上被删除或移走。你可以重载、保留当前编辑，或另存为新文件。";
const EXTERNAL_FILE_KEEPING_MEMORY_MESSAGE =
  "正在保留当前内存版本，autosave 已暂停。请另存为新文件，避免覆盖外部变化。";
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

function resolveEditorShortcutGroupId(
  activeBlockState: ActiveBlockState | null
): ShortcutGroupId {
  return activeBlockState?.tableCursor?.mode === "inside"
    ? "table-editing"
    : "default-text";
}

type ShellMode = "reading" | "editing";

function supportsControlledTitlebar(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export default function EditorApp() {
  const fishmark = window.fishmark;

  if (!fishmark) {
    return <BridgeUnavailableApp />;
  }

  return (
    <AppErrorBoundary>
      <EditorShell
        fishmark={fishmark}
        fishmarkTest={window.fishmarkTest}
      />
    </AppErrorBoundary>
  );
}

/** A terminal presentation fallback. Never retries or resets document/application state. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-shell" style={{ "--fishmark-titlebar-height": "0px" } as CSSProperties}>
          <div className="app-shell-fallback">
            <p className="error-banner" role="alert">
              FishMark could not display the workspace. Restart the window to continue.
            </p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function EditorShell({
  fishmark,
  fishmarkTest
}: {
  fishmark: Window["fishmark"];
  fishmarkTest?: Window["fishmarkTest"];
}) {
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const { activeViewContainer, closingViewContainer, toggleViewContainer, closeViewContainer } = useViewContainerPresentation();
  const [shellMode, setShellMode] = useState<ShellMode>("reading");
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("wysiwym");
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [recentFiles, setRecentFiles] = useState<RecentFilesSnapshot>(DEFAULT_RECENT_FILES_SNAPSHOT);
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
  const [isEditorFocused, setIsEditorFocused] = useState(false);
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
  const fontFamilyLoadStateRef = useRef<"idle" | "loading" | "loaded">("idle");
  const { notification, notificationState, showNotification } = useNotificationPresentation();

  const getEditorContent = useCallback((): string => {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }, []);

  const editorApplicationController = useEditorApplicationController({
    fishmark,
    setEditorContentSnapshot: (content) => {
      editorContentRef.current = content;
    },
    autosaveDelayMs: preferences.autosave.idleDelayMs,
    showNotification
  });
  const gateway = editorApplicationController.gateway;
  const workspaceController = editorApplicationController.workspace;
  const saveController = editorApplicationController.save;
  const externalConflictController = editorApplicationController.externalConflict;
  const editorWorkflowController = editorApplicationController.editorWorkflow;
  const editorCommands = editorApplicationController.commands;
  const {
    handleEditorDocumentChangeFrame,
    handleEditorBlur,
    activateWorkspaceTab: activateWorkspaceTabWorkflow,
    closeWorkspaceTab: closeWorkspaceTabWorkflow,
    detachWorkspaceTab: detachWorkspaceTabWorkflow
  } = editorWorkflowController;
  const {
    state,
    activeDocument,
    editorLoadRevision,
    getActiveDocument: getWorkspaceActiveDocument,
    reorderWorkspaceTab,
    loadInitialWorkspaceSnapshot
  } = workspaceController;
  const { handleWorkspaceTabDragStart, handleWorkspaceTabDragOver, handleWorkspaceTabDrop, handleWorkspaceTabDragEnd } = useWorkspaceTabDrag({ reorderWorkspaceTab, detachWorkspaceTab: detachWorkspaceTabWorkflow });
  const activeDocumentTabId = activeDocument?.tabId ?? null;
  const documentIdentity = useMemo<EditorLoadIdentity | null>(
    () => activeDocumentTabId === null ? null : {
      tabId: activeDocumentTabId,
      epoch: state.editorEpoch,
      loadRevision: editorLoadRevision
    },
    [activeDocumentTabId, state.editorEpoch, editorLoadRevision]
  );
  const {
    outlineItems,
    currentDocumentMetrics,
    applyDocumentDerivedDataNow,
    scheduleDocumentDerivedDataUpdate
  } = useDocumentDerivedDataController({ documentIdentity });
  const {
    resetAutosaveRuntime,
    scheduleAutosave,
    getEffectiveSaveState
  } = saveController;
  const effectiveSaveState = getEffectiveSaveState(activeDocument);
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
  const { handleEditorBlurFromShell, blurFocusedEditorElementAfterOpen, handleAppWorkspaceMouseDownCapture } = useEditorFocusPresentation({
    activeDocument, isSettingsOpen, isSettingsClosing, editorContainerRef, editorRef,
    handleEditorBlur, getWorkspaceActiveDocument, isDocumentOpen, editorLoadRevision: state.editorLoadRevision,
    shellMode, setShellMode, setIsEditorFocused
  });
  const headerTitle = isDocumentOpen
    ? activeDocument?.name ?? "Untitled"
    : "Local-first Markdown writing";
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
  const handleWindowBlur = useCallback(() => setIsEditorFocused(false), []);
  const { isShortcutHintVisible } = useShortcutHintPresentation({ platform: fishmark.platform, isDocumentOpen, isEditorFocused, onWindowBlur: handleWindowBlur });
  const controlledTitlebarEnabled = supportsControlledTitlebar(fishmark.platform);
  const { activeTitlebarSurface, activeWorkbenchSurface, resolvedThemeMode, themeRuntimeEnv, handleWorkbenchSurfaceRuntimeModeChange, handleTitlebarSurfaceRuntimeModeChange } = useThemePresentation({ preferences, themePackages, themePackageCatalogState, isRefreshingThemePackages, currentDocumentWordCount, isDocumentReadingMode, controlledTitlebarEnabled, showNotification });
  const titlebarLayout = useMemo(
    () => normalizeTitlebarLayout(resolveDefaultTitlebarLayout(fishmark.platform)),
    [fishmark.platform]
  );
  const readActiveDocumentLoadContent = useEffectEvent(() => activeDocument?.content ?? null);

  useEffect(() => {
    const activeDocumentContent = readActiveDocumentLoadContent();

    editorContentRef.current = activeDocumentContent ?? "";

    // CodeEditorView publishes the new revision snapshot from its child effects.
    // Do not clear it from the parent load effect afterwards. Only the no-document
    // boundary has no replacement snapshot and therefore clears derived UI state.
    if (activeDocumentTabId === null) {
      activeBlockStateRef.current = null;
      applyDocumentDerivedDataNow(null);
      setActiveHeadingId(null);
      setActiveShortcutGroupId("default-text");
      setActiveTableToolId(null);
    }
  }, [activeDocumentTabId, applyDocumentDerivedDataNow, editorLoadRevision]);

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

  useEffect(() => {
    if (!activeDocument) {
      setActiveShortcutGroupId("default-text");
    }
  }, [activeDocument]);

  useEffect(() => {
    if (activeShortcutGroupId !== "table-editing") {
      setActiveTableToolId(null);
    }
  }, [activeShortcutGroupId]);

  const handlePreferencesSync = useEffectEvent((nextPreferences: Preferences): void => {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    scheduleAutosave(nextPreferences.autosave.idleDelayMs);
  });

  const handleRecentFilesSync = useEffectEvent((nextRecentFiles: RecentFilesSnapshot): void => {
    setRecentFiles(nextRecentFiles);
  });

  const handleWorkspaceWindowCloseRequest = useEffectEvent(
    async (input: WorkspaceWindowCloseRequest): Promise<boolean> => {
      return editorCommands.confirmWorkspaceWindowClose(input.requestId);
    }
  );

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
      return;
    }

    if (command === "export-html-file") {
      void handleExportHtml();
    }
  });

  const handleClearRecentFile = useCallback(async (targetPath: string): Promise<void> => {
    const nextRecentFiles = await gateway.clearRecentFile({ path: targetPath });
    if (nextRecentFiles !== null) setRecentFiles(nextRecentFiles);
  }, [gateway]);

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
      const nextThemePackages = await gateway.refreshThemePackages();
      setThemePackages(nextThemePackages);
      setThemePackageCatalogState("loaded");
    } finally {
      setIsRefreshingThemePackages(false);
    }
  }, [gateway]);

  async function handleUpdatePreferences(
    patch: PreferencesUpdate
  ): Promise<Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>>> {
    const result = await gateway.updatePreferences(patch);
    preferencesRef.current = result.preferences;
    setPreferences(result.preferences);
    return result;
  }

  const handleEscapeCloseSettings = useEffectEvent((): void => {
    closeSettingsDrawer();
  });

  /*
   * One shared panel width for every view container. The shell reports the
   * final width once per drag (never per frame); an unchanged width is not
   * written again, and a collapsed panel never reaches this path, so the
   * stored width survives collapsing.
   */
  function handleSidePanelWidthCommit(width: number): void {
    const nextWidth = clampSidePanelWidth(width);

    if (preferencesRef.current.ui.sidePanelWidth === nextWidth) {
      return;
    }

    void handleUpdatePreferences({ ui: { sidePanelWidth: nextWidth } });
  }

  async function handleOpenMarkdown(): Promise<void> {
    const result = await editorCommands.openMarkdown();

    if (result === "opened") {
      setShellMode("reading");
      blurFocusedEditorElementAfterOpen();
    }
  }

  async function handleOpenRecentFile(targetPath: string): Promise<void> {
    const opened = await editorCommands.openRecentMarkdown(targetPath);

    if (opened) {
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
  useWindowMarkdownFileDrop({
    getPathForDroppedFile: fishmark.getPathForDroppedFile,
    dropMarkdownFiles: async (targetPaths) => {
      if (await editorCommands.dropMarkdownFiles(targetPaths)) {
        setShellMode("reading");
        blurFocusedEditorElementAfterOpen();
      }
    }
  });

  async function handleActivateWorkspaceTab(tabId: string): Promise<void> {
    await activateWorkspaceTabWorkflow(tabId);
  }

  const handleCloseWorkspaceTab = useCallback(async (tabId: string): Promise<void> => {
    await closeWorkspaceTabWorkflow(tabId);
  }, [
    closeWorkspaceTabWorkflow
  ]);

  async function handleSaveMarkdown(): Promise<void> {
    await editorCommands.saveMarkdown();
  }

  async function handleSaveMarkdownAs(): Promise<void> {
    await editorCommands.saveMarkdownAs();
  }

  async function handleExportHtml(): Promise<void> {
    await editorCommands.exportHtml();
  }

  async function handleImportClipboardImage(
    input: { documentPath: string | null }
  ): Promise<string | null> {
    return gateway.importClipboardImage(input);
  }

  async function handleOpenExternalLink(href: string): Promise<void> {
    await gateway.openExternalLink(href);
  }

  const editorTestBridge = useMemo(
    () => ({
      workspace: workspaceController.editorTestAdapter,
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
      }
    }),
    [
      getEditorContent,
      resetAutosaveRuntime,
      workspaceController.editorTestAdapter
    ]
  );

  useEffect(() => {
    return fishmark.onMenuCommand((command) => {
      handleAppMenuCommand(command);
    });
  }, [fishmark]);

  useEffect(() => {
    return fishmark.onWorkspaceWindowCloseRequest((input) =>
      handleWorkspaceWindowCloseRequest(input)
    );
  }, [fishmark]);

  useEffect(() => {
    void gateway.syncWatchedMarkdownFile();
  }, [activeDocument?.path, activeDocument?.tabId, gateway]);

  useEffect(() => {
    let isCancelled = false;
    let detachLaunchListener: (() => void) | undefined;

    void loadInitialWorkspaceSnapshot().then(async () => {
      if (isCancelled) {
        return;
      }

      const startupOpenPath = startupOpenPathRef.current;

      if (startupOpenPath) {
        startupOpenPathRef.current = null;
        await handleOpenMarkdownFromPath(startupOpenPath);
      }
      if (isCancelled) return;
      detachLaunchListener = fishmark.onOpenWorkspacePath((payload) =>
        handleOpenMarkdownFromPath(payload.targetPath)
      );
    });

    return () => {
      isCancelled = true;
      detachLaunchListener?.();
    };
  }, [fishmark, handleOpenMarkdownFromPath, loadInitialWorkspaceSnapshot]);

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

    void fishmark
      .getRecentFiles()
      .then((nextRecentFiles) => {
        if (isCancelled) {
          return;
        }

        handleRecentFilesSync(nextRecentFiles);
      })
      .catch(() => {
        // Keep an empty recent list when the bridge is temporarily unavailable.
      });

    const detachPreferences = fishmark.onPreferencesChanged((nextPreferences) => {
      handlePreferencesSync(nextPreferences);
    });
    const detachRecentFiles = fishmark.onRecentFilesChanged((nextRecentFiles) => {
      handleRecentFilesSync(nextRecentFiles);
    });

    return () => {
      isCancelled = true;
      detachPreferences();
      detachRecentFiles();
    };
  }, [gateway, fishmark]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void handleLoadFontFamilies();
  }, [isSettingsOpen]);

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

  useEffect(
    () => () => {
      resetAutosaveRuntime();
      clearSettingsCloseTimer();
    },
    [clearSettingsCloseTimer, resetAutosaveRuntime]
  );

  const handleActiveBlockChange = useCallback((nextActiveBlockState: ActiveBlockState): void => {
    activeBlockStateRef.current = nextActiveBlockState;
    // The controller owns snapshot de-duplication within the current load identity.
    // An epoch-only rebind can publish the same snapshot for a new load boundary.
    scheduleDocumentDerivedDataUpdate(nextActiveBlockState.snapshot);

    setActiveShortcutGroupId(resolveEditorShortcutGroupId(nextActiveBlockState));
    setActiveHeadingId(nextActiveBlockState.activeHeadingId);
  }, [scheduleDocumentDerivedDataUpdate]);

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
      {LazyEditorTestBridgeHost && fishmarkTest ? (
        <Suspense fallback={null}>
          <LazyEditorTestBridgeHost
            fishmarkTest={fishmarkTest}
            workspace={editorTestBridge.workspace}
            resetAutosaveRuntime={editorTestBridge.resetAutosaveRuntime}
            editor={editorTestBridge.editor}
          />
        </Suspense>
      ) : null}
      <WorkspaceShell
        workspaceSnapshot={workspaceController.editorViewSnapshot}
        activeHeadingId={activeHeadingId}
        activeShortcutGroupId={activeShortcutGroupId}
        activeTableToolId={activeTableToolId}
        activeTitlebarSurface={activeTitlebarSurface}
        activeViewContainer={activeViewContainer}
        activeWorkbenchSurface={activeWorkbenchSurface}
        appUpdateStatusLabel={appUpdateStatusLabel}
        appVersionLabel={appVersionLabel}
        closingViewContainer={closingViewContainer}
        controlledTitlebarEnabled={controlledTitlebarEnabled}
        currentDocumentMetrics={currentDocumentMetrics}
        effectiveSaveState={effectiveSaveState}
        editorContainerRef={editorContainerRef}
        editorLoadRevision={state.editorLoadRevision}
        editorEpoch={state.editorEpoch}
        editorTransition={state.editorTransition}
        editorRef={editorRef}
        editorViewMode={editorViewMode}
        externalFileConflictMessage={externalFileConflictMessage}
        externalFileState={externalConflictController.externalFileState}
        fishmarkPlatform={fishmark.platform}
        fontFamilies={fontFamilies}
        headerTitle={headerTitle}
        isDocumentOpen={isDocumentOpen}
        isReadingMode={isReadingMode}
        isRefreshingThemePackages={isRefreshingThemePackages}
        isSettingsDrawerVisible={isSettingsDrawerVisible}
        isSettingsOpen={isSettingsOpen}
        isShortcutHintVisible={isShortcutHintVisible}
        notification={notification}
        notificationState={notificationState}
        outlineItems={outlineItems}
        recentFiles={recentFiles}
        preferences={preferences}
        preferencesThemeEffectsMode={preferences.theme.effectsMode}
        resolvedThemeMode={resolvedThemeMode}
        saveStatusLabel={saveStatusLabel}
        settingsEntryRef={settingsEntryRef}
        shellMode={shellMode}
        sidePanelStoredWidth={preferences.ui.sidePanelWidth}
        themePackages={themePackages}
        themeRuntimeEnv={themeRuntimeEnv}
        titlebarHeight={titlebarLayout.height}
        titlebarLayout={titlebarLayout}
        onActiveBlockChange={handleActiveBlockChange}
        onAppWorkspaceMouseDownCapture={handleAppWorkspaceMouseDownCapture}
        onCaptureSettingsOpenOrigin={captureSettingsOpenOrigin}
        onCloseViewContainer={closeViewContainer}
        onCloseSettingsDrawer={closeSettingsDrawer}
        onCloseWorkspaceTab={(tabId) => {
          void handleCloseWorkspaceTab(tabId);
        }}
        onDismissExternalFileConflict={externalConflictController.dismissConflict}
        onDocumentChangeFrame={handleEditorDocumentChangeFrame}
        onDiscardedDocumentText={workspaceController.recordDiscardedDocumentText}
        onPendingDocumentChangesChange={workspaceController.recordPendingDocumentChanges}
        onEditorBarrierChange={workspaceController.registerEditorBarrier}
        onEditorRemotePatchChange={workspaceController.registerEditorRemotePatch}
        onEditorCanonicalRestoreChange={workspaceController.registerEditorCanonicalRestore}
        onEditorTransitionApplied={workspaceController.acknowledgeEditorTransition}
        onEditorLoadRevisionApplied={workspaceController.acknowledgeEditorLoad}
        onEditorBlur={handleEditorBlurFromShell}
        onEditorViewModeChange={setEditorViewMode}
        onImportClipboardImage={handleImportClipboardImage}
        onOpenExternalLink={(href) => {
          void handleOpenExternalLink(href);
        }}
        onInsertTableColumnLeft={insertTableColumnLeft}
        onInsertTableColumnRight={insertTableColumnRight}
        onInsertTableRowAbove={insertTableRowAbove}
        onInsertTableRowBelow={insertTableRowBelow}
        onDeleteTable={deleteTable}
        onDeleteTableColumn={deleteTableColumn}
        onDeleteTableRow={deleteTableRow}
        onKeepMemoryVersion={externalConflictController.keepMemoryVersion}
        onNavigateToOutlineItem={handleNavigateToOutlineItem}
        onToggleViewContainer={toggleViewContainer}
        onReloadExternalFile={handleReloadExternalFile}
        onRefreshThemePackages={handleRefreshThemePackages}
        onOpenThemesDirectory={gateway.openThemesDirectory}
        onSelectTemporaryImageDirectory={async () => {
          const result = await gateway.selectTemporaryImageDirectory();
          if (result !== null) {
            preferencesRef.current = result.preferences;
            setPreferences(result.preferences);
          }
          return result;
        }}
        onSaveAs={handleSaveMarkdownAsCommand}
        onSettingsOpen={openSettingsDrawer}
        onSidePanelWidthCommit={handleSidePanelWidthCommit}
        onOpenRecentFile={(targetPath) => {
          void handleOpenRecentFile(targetPath);
        }}
        onClearRecentFile={(targetPath) => {
          void handleClearRecentFile(targetPath);
        }}
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
