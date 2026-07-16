import path from "node:path";
import {
  createWorkspaceState,
  type WorkspaceWindowProjection
} from "@fishmark/workspace-domain";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions
} from "electron";
import { createApplicationMenuTemplate } from "./application-menu";
import { importClipboardImage } from "./clipboard-image-import";
import { resolveMarkdownLaunchPathFromArgv } from "./launch-open-path";
import { openMarkdownFileFromPath, showOpenMarkdownDialog } from "./open-markdown-file";
import {
  registerPreviewAssetProtocol,
  registerPreviewAssetScheme
} from "./preview-asset-protocol";
import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";
import { showExportHtmlDialog } from "./export-html-file";
import { createPreferencesService } from "./preferences-service";
import { createRecentFilesService } from "./recent-files-service";
import { createFontCatalogService } from "./font-catalog-service";
import { openThemesDirectory } from "./open-themes-directory";
import { resolveTemporaryImageDirectory, selectTemporaryImageDirectory } from "./temporary-image-directory";
import {
  createThemePackageService,
  resolveBuiltinThemePackagesDir
} from "./theme-package-service";
import { resolveRendererEntry } from "./paths";
import { configureMainProcessRuntime, shouldRequestSingleInstanceLock } from "./runtime-environment";
import { createRuntimeWindowManager, resolveAppRuntimeMode } from "./runtime-windows";
import { resolveWindowIconPath } from "./window-icon";
import { createAppUpdateCheckRunner } from "./app-update-check-runner";
import { resolveAutoUpdaterModule } from "./resolve-auto-updater-module";
import { createExternalFileWatchService } from "./external-file-watch-service";
import { createWorkspaceApplication } from "./workspace-application";
import {
  createWorkspaceCloseCoordinator,
  type WorkspaceWindowCloseConfirmation
} from "./workspace-close-coordinator";
import { createWorkspaceDetachApplication } from "./workspace-detach-application";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceFileOperations } from "./workspace-file-operations";
import { createWorkspaceReloadApplication } from "./workspace-reload-application";
import { createWorkspaceWindowCloseApplication } from "./workspace-window-close-application";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";
import {
  toWorkspaceMoveTabResult,
  toWorkspaceWindowSnapshot
} from "./workspace-ipc-projection";
import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  OPEN_EDITOR_TEST_WINDOW_CHANNEL,
  type RunnerEventEnvelope,
  SCENARIO_RUN_EVENT,
  type ScenarioRunTerminal,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL
} from "../shared/test-run-session";
import {
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
  type HandleDroppedMarkdownFileInput,
  type HandleDroppedMarkdownFileResult
} from "../shared/open-markdown-file";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  GET_PREFERENCES_CHANNEL,
  PREFERENCES_CHANGED_EVENT,
  SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL,
  UPDATE_PREFERENCES_CHANNEL,
  type PreferencesUpdate
} from "../shared/preferences";
import {
  CLEAR_RECENT_FILE_CHANNEL,
  GET_RECENT_FILES_CHANNEL,
  RECENT_FILES_CHANGED_EVENT,
  type ClearRecentFileInput
} from "../shared/recent-files";
import { LIST_FONT_FAMILIES_CHANNEL } from "../shared/font-families";
import {
  IMPORT_CLIPBOARD_IMAGE_CHANNEL,
  type ImportClipboardImageInput
} from "../shared/clipboard-image-import";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileInput
} from "../shared/save-markdown-file";
import {
  EXPORT_HTML_FILE_CHANNEL,
  type ExportHtmlFileInput
} from "../shared/export-html-file";
import {
  SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
  type SyncWatchedMarkdownFileInput
} from "../shared/external-file-change";
import {
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  CHECK_FOR_APP_UPDATES_CHANNEL,
  type AppNotification,
  type AppUpdateState
} from "../shared/app-update";
import {
  LIST_THEME_PACKAGES_CHANNEL,
  OPEN_THEMES_DIRECTORY_CHANNEL,
  REFRESH_THEME_PACKAGES_CHANNEL
} from "../shared/theme-package";
import {
  OPEN_EXTERNAL_LINK_CHANNEL,
  type OpenExternalLinkInput
} from "../shared/external-link";
import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  OPEN_WORKSPACE_PATH_EVENT,
  RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT,
  UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL,
  type ActivateWorkspaceTabInput,
  type CloseWorkspaceTabInput,
  type CompleteWorkspaceWindowCloseInput,
  type CreateWorkspaceTabInput,
  type DetachWorkspaceTabToNewWindowInput,
  type MoveWorkspaceTabToWindowInput,
  type OpenWorkspacePathRequest,
  type OpenWorkspaceFileFromPathResult,
  type OpenWorkspaceFileResult,
  type ReloadWorkspaceTabFromPathInput,
  type ReorderWorkspaceTabInput,
  type UpdateWorkspaceTabDraftInput,
  type WorkspaceWindowCloseRequest
} from "../shared/workspace";

const AUTO_UPDATE_STARTUP_DELAY_MS = 5000;
const WORKSPACE_DETACH_READY_TIMEOUT_MS = 15_000;
const WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS = 15_000;
registerPreviewAssetScheme({ protocol });
configureMainProcessRuntime(app, process.env);
const hasSingleInstanceLock = shouldRequestSingleInstanceLock(process.env)
  ? app.requestSingleInstanceLock()
  : true;
const pendingLaunchOpenPaths: string[] = [];

let openEditorWindowForLaunchPath: ((targetPath: string) => void) | null = null;
let openEmptyEditorWindow: (() => void) | null = null;
let runManualAppUpdateCheck: (() => void) | null = null;

type AppUpdaterController = {
  checkForUpdates: (source: "auto" | "manual") => Promise<void>;
  getState: () => AppUpdateState;
};

type EditorTestSessionsController = {
  ensureSession: () => { sessionId: string };
  dispatchCommand: (input: {
    sessionId: string;
    command: import("../shared/editor-test-command").EditorTestCommand;
    signal?: AbortSignal;
  }) => Promise<import("../shared/editor-test-command").EditorTestCommandResult>;
  completeCommand: (payload: EditorTestCommandResultEnvelope) => boolean;
};

type TestRunSessionsController = {
  onRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => () => void;
  onRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => () => void;
  startScenarioRun: (input: { scenarioId: string }) => Promise<{ runId: string }>;
  interruptScenarioRun: (input: { runId: string }) => boolean;
};

function enqueueLaunchOpenPath(targetPath: string): void {
  pendingLaunchOpenPaths.push(targetPath);
}

function handleLaunchOpenPath(targetPath: string): void {
  if (openEditorWindowForLaunchPath) {
    openEditorWindowForLaunchPath(targetPath);
  } else {
    enqueueLaunchOpenPath(targetPath);
  }
}

function handleLaunchOpenFromArgv(argv: string[]): boolean {
  const launchPath = resolveMarkdownLaunchPathFromArgv(argv);

  if (!launchPath) {
    return false;
  }

  handleLaunchOpenPath(launchPath);
  return true;
}

if (!hasSingleInstanceLock) {
  void app.quit();
} else {
  void handleLaunchOpenFromArgv(process.argv);

  app.on("second-instance", (_event, argv) => {
    void handleLaunchOpenFromArgv(argv);
  });

  app.on("open-file", (event, targetPath) => {
    event.preventDefault();
    handleLaunchOpenPath(targetPath);
  });
}

function dispatchMenuCommand(command: AppMenuCommand): void {
  if (command === "check-for-updates") {
    runManualAppUpdateCheck?.();
    return;
  }

  if (command === "new-editor-window") {
    openEmptyEditorWindow?.();
    return;
  }

  const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

  targetWindow?.webContents.send(APP_MENU_COMMAND_EVENT, command);
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate({ dispatchCommand: dispatchMenuCommand });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template as MenuItemConstructorOptions[]));
}

function loadRenderer(window: BrowserWindow, runtimeMode: "editor" | "test-workbench"): void {
  const rendererEntry = resolveRendererEntry(
    path.join(__dirname, "../../dist"),
    process.env.VITE_DEV_SERVER_URL,
    runtimeMode
  );

  void window.loadURL(rendererEntry);
}

function broadcastToWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function isSafeExternalLinkProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
}

function resolveSafeExternalLinkHref(input: OpenExternalLinkInput | undefined): string {
  const rawHref = typeof input?.href === "string" ? input.href.trim() : "";

  if (!rawHref) {
    throw new Error("External link is empty.");
  }

  let url: URL;

  try {
    url = new URL(rawHref);
  } catch {
    throw new Error(`Unsupported external link: ${rawHref}`);
  }

  if (!isSafeExternalLinkProtocol(url.protocol)) {
    throw new Error(`Unsupported external link protocol: ${url.protocol}`);
  }

  return url.toString();
}

app.whenReady().then(async () => {
  const runtimeMode = resolveAppRuntimeMode(process.env);
  registerPreviewAssetProtocol({ protocol });
  const preferencesService = createPreferencesService({
    userDataDir: app.getPath("userData"),
    onCorruptRecovery: (backupPath) => {
      // Surface the corrupt-file recovery so it shows up in launch logs
      // without crashing startup.
      const target = backupPath ?? "(rename failed)";
      console.warn(`[fishmark] preferences file was corrupt; backed up to ${target}`);
    }
  });

  const initialPreferences = await preferencesService.initialize();
  const recentFilesService = createRecentFilesService({
    userDataDir: app.getPath("userData"),
    getPreferences: () => preferencesService.getPreferences()
  });
  await recentFilesService.initialize();
  const themePackageService = createThemePackageService({
    userDataDir: app.getPath("userData"),
    builtinPackagesDir: resolveBuiltinThemePackagesDir({ isPackaged: app.isPackaged })
  });
  const fontCatalogService = createFontCatalogService({
    platform: process.platform
  });
  const externalFileWatchService = createExternalFileWatchService();
  const workspaceState = createWorkspaceState();
  const workspaceDocumentOperations = createWorkspaceDocumentOperationCoordinator();
  const workspaceApplication = createWorkspaceApplication({
    workspace: workspaceState
  });
  const workspaceCloseCoordinator = createWorkspaceCloseCoordinator({
    workspace: workspaceState,
    documentOperations: workspaceDocumentOperations,
    promptToSaveWorkspaceTab: async (tab) => {
      const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: "Unsaved Changes",
        message: `${tab.name} has unsaved changes.`,
        detail: "Do you want to save your changes before closing?"
      });

      switch (result.response) {
        case 0:
          return "save";
        case 1:
          return "discard";
        default:
          return "cancel";
      }
    },
    saveMarkdownFileToPath,
    showSaveMarkdownDialog
  });
  const workspaceWindowCloseRequestBroker =
    createWorkspaceWindowCloseRequestBroker<WorkspaceWindowCloseConfirmation>({
      scheduleTimeout: (listener) => {
        const timeout = setTimeout(
          listener,
          WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS
        );
        return () => clearTimeout(timeout);
      }
    });
  const workspaceWindowCloseApplication =
    createWorkspaceWindowCloseApplication<BrowserWindow>({
      workspace: workspaceState,
      documentOperations: workspaceDocumentOperations,
      requestWorkspaceWindowClose: async (ownerWindow) => {
        if (ownerWindow.webContents.isDestroyed()) {
          return Promise.resolve(null);
        }

        const windowId = String(ownerWindow.id);
        const handle = workspaceWindowCloseRequestBroker.request({
          windowId,
          sendRequest: (requestId) => {
            ownerWindow.webContents.send(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT, {
              requestId
            } satisfies WorkspaceWindowCloseRequest);
          },
          bindAbort: (listener) => {
            const abort = () => listener();
            ownerWindow.webContents.on("render-process-gone", abort);
            ownerWindow.webContents.on("destroyed", abort);
            return () => {
              ownerWindow.webContents.removeListener("render-process-gone", abort);
              ownerWindow.webContents.removeListener("destroyed", abort);
            };
          }
        });
        try {
          return await handle.result;
        } finally {
          await handle.drained;
        }
      }
    });
  const workspaceWindowBindings = new Set<string>();
  const pendingWorkspaceWindowCloseIds = new Set<string>();
  const heldWorkspaceWindowCloseReleases = new Map<string, () => void>();
  let appUpdaterPromise: Promise<AppUpdaterController> | null = null;

  if (initialPreferences.source === "recovered-from-corrupt") {
    console.warn(
      `[fishmark] preferences reset to defaults due to corrupt file at ${initialPreferences.corruptBackupPath ?? "(unknown)"}`
    );
  }

  preferencesService.onChange((preferences) => {
    broadcastToWindows(PREFERENCES_CHANGED_EVENT, preferences);
    void recentFilesService.applyMaxEntries(preferences.recentFiles.maxEntries);
  });
  recentFilesService.onChange((snapshot) => {
    broadcastToWindows(RECENT_FILES_CHANGED_EVENT, snapshot);
  });

  const getAppUpdater = async (): Promise<AppUpdaterController> => {
    if (!appUpdaterPromise) {
      appUpdaterPromise = (async () => {
        const [autoUpdaterModule, { createAppUpdater }] = await Promise.all([
          import("electron-updater"),
          import("./app-updater.js")
        ]);
        const autoUpdater = resolveAutoUpdaterModule(autoUpdaterModule);

        return createAppUpdater({
          app,
          autoUpdater,
          broadcast: (state: AppUpdateState) => {
            broadcastToWindows(APP_UPDATE_STATE_EVENT, state);
          },
          dialog,
          logger: {
            info: (message: string) => console.info(message),
            warn: (message: string) => console.warn(message),
            error: (message: string) => console.error(message)
          },
          notify: (notification: AppNotification) => {
            broadcastToWindows(APP_NOTIFICATION_EVENT, notification);
          },
          platform: process.platform,
          runtimeMode
        });
      })();
    }

    return appUpdaterPromise;
  };
  const runAppUpdateCheck = createAppUpdateCheckRunner({
    getController: getAppUpdater,
    logger: {
      error: (message: string) => console.error(message)
    },
    notify: (notification: AppNotification) => {
      broadcastToWindows(APP_NOTIFICATION_EVENT, notification);
    }
  });
  runManualAppUpdateCheck = () => {
    void runAppUpdateCheck("manual");
  };

  const windowManager = createRuntimeWindowManager({
    runtimeMode,
    preloadPath: path.join(__dirname, "../preload/preload.js"),
    windowIconPath: resolveWindowIconPath(),
    showStrategy: app.isPackaged ? "immediate" : "ready-to-show",
    createWindow: (input) =>
      new BrowserWindow({
        ...input,
        show: false
      }),
    getAllWindows: () => BrowserWindow.getAllWindows(),
    loadRenderer
  });
  openEmptyEditorWindow = () => {
    windowManager.openEditorWindow();
  };

  function resolveWorkspaceWindowId(sender: Electron.WebContents): string {
    const ownerWindow = BrowserWindow.fromWebContents(sender);
    return String(ownerWindow?.id ?? sender.id);
  }

  function ensureWorkspaceWindow(sender: Electron.WebContents): string {
    const windowId = resolveWorkspaceWindowId(sender);
    workspaceDetachApplication.markWindowReady(windowId);
    workspaceState.registerWindow(windowId);

    if (!workspaceWindowBindings.has(windowId)) {
      const ownerWindow = BrowserWindow.fromWebContents(sender);
      if (!ownerWindow) {
        workspaceWindowBindings.add(windowId);
        return windowId;
      }

      ownerWindow.on("focus", () => {
        workspaceState.focusWindow(windowId);
      });
      ownerWindow.on("close", (event) => {
        if (pendingWorkspaceWindowCloseIds.has(windowId)) {
          pendingWorkspaceWindowCloseIds.delete(windowId);
          return;
        }

        event.preventDefault();

        if (workspaceWindowCloseRequestBroker.hasPending(windowId)) {
          return;
        }

        void (async () => {
          try {
            const heldLease = await workspaceWindowCloseApplication.requestWindowClose({
              windowId,
              ownerWindow
            });

            if (heldLease === null) {
              return;
            }

            heldWorkspaceWindowCloseReleases.set(windowId, heldLease.release);
            pendingWorkspaceWindowCloseIds.add(windowId);
            try {
              ownerWindow.close();
            } catch (error) {
              pendingWorkspaceWindowCloseIds.delete(windowId);
              heldWorkspaceWindowCloseReleases.delete(windowId);
              heldLease.release();
              throw error;
            }
          } catch (error) {
            try {
              await dialog.showMessageBox({
                type: "error",
                buttons: ["OK"],
                defaultId: 0,
                title: "Unable to close window",
                message: error instanceof Error ? error.message : String(error)
              });
            } catch (reportingError) {
              console.error(
                "[fishmark] unable to report workspace window close failure.",
                error,
                reportingError
              );
            }
          }
        })();
      });
      ownerWindow.once("closed", () => {
        pendingWorkspaceWindowCloseIds.delete(windowId);
        workspaceWindowCloseRequestBroker.abortWindow(windowId);
        workspaceWindowBindings.delete(windowId);
        const heldRelease = heldWorkspaceWindowCloseReleases.get(windowId);
        try {
          workspaceState.unregisterWindow(windowId);
        } finally {
          heldWorkspaceWindowCloseReleases.delete(windowId);
          heldRelease?.();
        }
      });
      workspaceWindowBindings.add(windowId);
    }

    workspaceState.focusWindow(windowId);
    return windowId;
  }

  function getWorkspaceWindowById(windowId: string): BrowserWindow | null {
    return BrowserWindow.getAllWindows().find((window) => String(window.id) === windowId) ?? null;
  }

  function getPreferredWorkspaceWindow(): BrowserWindow | null {
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (focusedWindow && workspaceWindowBindings.has(String(focusedWindow.id))) {
      return focusedWindow;
    }

    const lastFocusedWindowId = workspaceState.getLastFocusedWindowId();

    if (lastFocusedWindowId) {
      const lastFocusedWindow = getWorkspaceWindowById(lastFocusedWindowId);

      if (lastFocusedWindow) {
        return lastFocusedWindow;
      }
    }

    for (const windowId of workspaceWindowBindings) {
      const window = getWorkspaceWindowById(windowId);

      if (window) {
        return window;
      }
    }

    return null;
  }

  function requestWorkspacePathOpen(window: BrowserWindow, targetPath: string): void {
    window.webContents.send(OPEN_WORKSPACE_PATH_EVENT, {
      targetPath
    } satisfies OpenWorkspacePathRequest);
    window.focus();
  }

  function openPathInWorkspace(targetPath: string): void {
    const existingWindow = getPreferredWorkspaceWindow();

    if (existingWindow) {
      requestWorkspacePathOpen(existingWindow, targetPath);
      return;
    }

    windowManager.openEditorWindow({ startupOpenPath: targetPath });
  }

  openEditorWindowForLaunchPath = (targetPath: string) => {
    openPathInWorkspace(targetPath);
  };

  async function syncWorkspaceWatch(
    sender: Electron.WebContents,
    projection: WorkspaceWindowProjection
  ): Promise<ReturnType<typeof toWorkspaceWindowSnapshot>> {
    await externalFileWatchService.syncDocumentPath(
      sender,
      workspaceState.getTabPath(projection.activeTabId)
    );
    return toWorkspaceWindowSnapshot(projection);
  }

  async function recordRecentFilePath(targetPath: string | null): Promise<void> {
    if (!targetPath) {
      return;
    }

    try {
      await recentFilesService.recordFile(targetPath);
    } catch (error) {
      console.warn(
        `[fishmark] recent file list could not be updated: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const workspaceReloadApplication = createWorkspaceReloadApplication({
    workspace: workspaceState,
    documentOperations: workspaceDocumentOperations,
    openMarkdownFileFromPath,
    recordRecentFilePath
  });
  const workspaceFileOperations = createWorkspaceFileOperations({
    workspace: workspaceState,
    documentOperations: workspaceDocumentOperations,
    saveMarkdownFileToPath,
    showSaveMarkdownDialog,
    beginInternalWrite: externalFileWatchService.beginInternalWrite,
    completeInternalWrite: externalFileWatchService.completeInternalWrite,
    syncDocumentPath: externalFileWatchService.syncDocumentPath,
    recordRecentFilePath,
    reportCleanupError: (error) => {
      console.error(
        "[fishmark] workspace file operation cleanup failed.",
        error
      );
    }
  });
  const workspaceDetachApplication = createWorkspaceDetachApplication({
    workspace: workspaceState,
    openWindow: () => windowManager.openEditorWindow(),
    scheduleReadyTimeout: (listener) => {
      const timeout = setTimeout(listener, WORKSPACE_DETACH_READY_TIMEOUT_MS);
      return () => clearTimeout(timeout);
    },
    lifecycle: {
      getWindowId: (window) => String(window.id),
      destroyWindow: (window) => {
        if (!window.isDestroyed()) {
          window.destroy();
        }
      },
      bindClosed: (window, listener) => {
        window.once("closed", listener);
      },
      bindLoadFailure: (window, listener) => {
        window.webContents.on(
          "did-fail-load",
          (_event, _errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
            if (isMainFrame) {
              listener();
            }
          }
        );
      }
    }
  });

  ipcMain.handle(GET_WORKSPACE_SNAPSHOT_CHANNEL, async (event) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    return syncWorkspaceWatch(
      event.sender,
      workspaceState.getWindowProjection(windowId)
    );
  });
  ipcMain.handle(CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL, async (event) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    const identity = workspaceWindowCloseRequestBroker.getPendingIdentity(
      windowId
    );
    if (identity === null) {
      return false;
    }
    const scope = workspaceWindowCloseRequestBroker.beginConfirmation(identity);
    if (scope === null) {
      return false;
    }
    try {
      const confirmation = await workspaceCloseCoordinator.confirmWindowClose({
        windowId,
        isActive: scope.isActive
      });
      return confirmation !== null &&
        workspaceWindowCloseRequestBroker.setConfirmation({
          ...identity,
          confirmation
        });
    } finally {
      scope.finish();
    }
  });
  ipcMain.handle(
    COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
    async (event, input: CompleteWorkspaceWindowCloseInput) => {
      const windowId = ensureWorkspaceWindow(event.sender);

      workspaceWindowCloseRequestBroker.complete(
        input.requestId,
        windowId,
        input.shouldClose
      );
    }
  );
  ipcMain.handle(CREATE_WORKSPACE_TAB_CHANNEL, async (event, input: CreateWorkspaceTabInput) => {
    const windowId = ensureWorkspaceWindow(event.sender);

    if (input.kind !== "untitled") {
      throw new Error(`Unsupported workspace tab kind: ${String((input as { kind?: unknown }).kind)}`);
    }

    return syncWorkspaceWatch(event.sender, workspaceState.createUntitledTab(windowId));
  });
  ipcMain.handle(OPEN_WORKSPACE_FILE_CHANNEL, async (event) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    const result = await showOpenMarkdownDialog();

    if (result.status !== "success") {
      if (result.status === "cancelled") {
        return { kind: "cancelled" } satisfies OpenWorkspaceFileResult;
      }

      return {
        kind: "error",
        error: {
          code: result.error.code,
          message: result.error.message
        }
      } satisfies OpenWorkspaceFileResult;
    }

    await recordRecentFilePath(result.document.path);

    return {
      kind: "success",
      snapshot: await syncWorkspaceWatch(
        event.sender,
        workspaceState.openDocument(windowId, result.document)
      )
    } satisfies OpenWorkspaceFileResult;
  });
  ipcMain.handle(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, async (event, input: { targetPath: string }) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    const result = await openMarkdownFileFromPath(input.targetPath);

    if (result.status !== "success") {
      if (result.status === "cancelled") {
        return {
          kind: "error",
          error: {
            code: "read-failed",
            message: `Unable to open Markdown file '${input.targetPath}'.`
          }
        } satisfies OpenWorkspaceFileFromPathResult;
      }

      return {
        kind: "error",
        error: {
          code: result.error.code,
          message: result.error.message
        }
      } satisfies OpenWorkspaceFileFromPathResult;
    }

    await recordRecentFilePath(result.document.path);

    return {
      kind: "success",
      snapshot: await syncWorkspaceWatch(
        event.sender,
        workspaceState.openDocument(windowId, result.document)
      )
    } satisfies OpenWorkspaceFileFromPathResult;
  });
  ipcMain.handle(
    RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
    async (event, input: ReloadWorkspaceTabFromPathInput) => {
      const windowId = ensureWorkspaceWindow(event.sender);
      const projection = await workspaceReloadApplication.reloadTab({
        tabId: input.tabId,
        expectedWindowId: windowId,
        targetPath: input.targetPath
      });
      return syncWorkspaceWatch(
        event.sender,
        projection
      );
    }
  );
  ipcMain.handle(ACTIVATE_WORKSPACE_TAB_CHANNEL, async (event, input: ActivateWorkspaceTabInput) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    return syncWorkspaceWatch(
      event.sender,
      workspaceState.activateTab(windowId, input.tabId)
    );
  });
  ipcMain.handle(CLOSE_WORKSPACE_TAB_CHANNEL, async (event, input: CloseWorkspaceTabInput) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    const checkpoint = workspaceState.getTabSession(input.tabId);
    if (checkpoint.windowId !== windowId) {
      throw new Error(
        `Workspace tab '${input.tabId}' does not belong to window '${windowId}'.`
      );
    }
    const result = await workspaceCloseCoordinator.closeTab({
      tabId: input.tabId,
      expectedWindowId: windowId,
      expectedRevision: checkpoint.revision
    });
    return syncWorkspaceWatch(event.sender, result.snapshot);
  });
  ipcMain.handle(REORDER_WORKSPACE_TAB_CHANNEL, async (event, input: ReorderWorkspaceTabInput) => {
    ensureWorkspaceWindow(event.sender);
    return syncWorkspaceWatch(
      event.sender,
      workspaceState.reorderTab(input.tabId, input.toIndex)
    );
  });
  ipcMain.handle(
    MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
    async (_event, input: MoveWorkspaceTabToWindowInput) =>
      toWorkspaceMoveTabResult(workspaceState.moveTabToWindow(input))
  );
  ipcMain.handle(
    DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
    async (event, input: DetachWorkspaceTabToNewWindowInput) => {
      const windowId = ensureWorkspaceWindow(event.sender);
      const projection = await workspaceDetachApplication.detachTab({
        tabId: input.tabId,
        expectedWindowId: windowId
      });
      return syncWorkspaceWatch(
        event.sender,
        projection.sourceWindowSnapshot
      );
    }
  );
  ipcMain.handle(UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL, async (_event, input: UpdateWorkspaceTabDraftInput) =>
    toWorkspaceWindowSnapshot(workspaceApplication.updateDraft(input))
  );
  ipcMain.handle(
    HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
    async (
      _event,
      input: HandleDroppedMarkdownFileInput
    ): Promise<HandleDroppedMarkdownFileResult> => {
      if (input.targetPaths.length === 0) {
        throw new Error("Dropped Markdown payload did not include any file paths.");
      }

      return {
        disposition: "open-in-place"
      };
    }
  );
  ipcMain.handle(SAVE_MARKDOWN_FILE_CHANNEL, async (event, input: SaveMarkdownFileInput) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    return workspaceFileOperations.save({
      sender: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId,
      path: input.path
    });
  });
  ipcMain.handle(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (event, input: SaveMarkdownFileAsInput) => {
    const windowId = ensureWorkspaceWindow(event.sender);
    return workspaceFileOperations.saveAs({
      sender: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId,
      currentPath: input.currentPath
    });
  });
  ipcMain.handle(EXPORT_HTML_FILE_CHANNEL, async (_event, input: ExportHtmlFileInput) =>
    showExportHtmlDialog(input)
  );
  ipcMain.handle(
    SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
    async (event, input: SyncWatchedMarkdownFileInput) =>
      externalFileWatchService.syncDocumentPath(
        event.sender,
        workspaceState.getTabPath(input.tabId)
      )
  );
  ipcMain.handle(IMPORT_CLIPBOARD_IMAGE_CHANNEL, async (_event, input: ImportClipboardImageInput) =>
    importClipboardImage(input, {
      clipboard,
      temporaryDirectory: resolveTemporaryImageDirectory(
        app.getPath("userData"),
        preferencesService.getPreferences()
      )
    })
  );
  ipcMain.handle(GET_PREFERENCES_CHANNEL, async () => preferencesService.getPreferences());
  ipcMain.handle(UPDATE_PREFERENCES_CHANNEL, async (_event, patch: PreferencesUpdate | undefined) =>
    preferencesService.updatePreferences(patch)
  );
  ipcMain.handle(SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL, async () =>
    selectTemporaryImageDirectory()
  );
  ipcMain.handle(GET_RECENT_FILES_CHANNEL, async () => recentFilesService.getRecentFiles());
  ipcMain.handle(CLEAR_RECENT_FILE_CHANNEL, async (_event, input: ClearRecentFileInput) =>
    recentFilesService.clearFile(input.path)
  );
  ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL, async () => fontCatalogService.listFontFamilies());
  ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL, async () => runAppUpdateCheck("manual"));
  ipcMain.handle(LIST_THEME_PACKAGES_CHANNEL, async () => themePackageService.listThemePackages());
  ipcMain.handle(REFRESH_THEME_PACKAGES_CHANNEL, async () =>
    themePackageService.refreshThemePackages()
  );
  ipcMain.handle(OPEN_THEMES_DIRECTORY_CHANNEL, async () =>
    openThemesDirectory(app.getPath("userData"))
  );
  ipcMain.handle(OPEN_EXTERNAL_LINK_CHANNEL, async (_event, input: OpenExternalLinkInput | undefined) =>
    shell.openExternal(resolveSafeExternalLinkHref(input))
  );

  if (!app.isPackaged && runtimeMode === "test-workbench") {
    const [
      { createCliProcessRunner },
      { createEditorTestSessions },
      { createTestRunSessions }
    ] = await Promise.all([
      import("./cli-process-runner.js"),
      import("./editor-test-sessions.js"),
      import("./test-run-sessions.js")
    ]);

    const editorTestSessions: EditorTestSessionsController = createEditorTestSessions({
      openEditorWindow: () =>
        windowManager.openEditorWindow({ preloadBridgeMode: "editor-test" })
    });

    const cliRunner = createCliProcessRunner({
      cliScriptPath: path.join(
        __dirname,
        "../../dist-cli/packages/test-harness/src/cli/bin.js"
      ),
      cwd: path.join(__dirname, "../.."),
      ensureEditorSession: async () => editorTestSessions.ensureSession(),
      dispatchEditorCommand: (input: {
        sessionId: import("../shared/editor-test-command").EditorTestCommandEnvelope["sessionId"];
        command: import("../shared/editor-test-command").EditorTestCommandEnvelope["command"];
        signal: AbortSignal;
      }) =>
        editorTestSessions.dispatchCommand({
          sessionId: input.sessionId,
          command: input.command,
          signal: input.signal
        })
    });

    const testRunSessions: TestRunSessionsController = createTestRunSessions({
      startRun: (input: {
        runId: string;
        scenarioId: string;
        signal: AbortSignal;
        onEvent: (payload: RunnerEventEnvelope) => void;
        onTerminal: (payload: ScenarioRunTerminal) => void;
      }) =>
        cliRunner.startRun({
          runId: input.runId,
          scenarioId: input.scenarioId,
          signal: input.signal,
          onEvent: input.onEvent,
          onTerminal: input.onTerminal
        })
    });

    testRunSessions.onRunEvent((payload) => {
      broadcastToWindows(SCENARIO_RUN_EVENT, payload);
    });
    testRunSessions.onRunTerminal((payload) => {
      broadcastToWindows(SCENARIO_RUN_TERMINAL_EVENT, payload);
    });

    ipcMain.handle(OPEN_EDITOR_TEST_WINDOW_CHANNEL, async () => {
      editorTestSessions.ensureSession();
    });
    ipcMain.handle(
      COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
      async (_event, payload: EditorTestCommandResultEnvelope) => {
        editorTestSessions.completeCommand(payload);
      }
    );
    ipcMain.handle(START_SCENARIO_RUN_CHANNEL, async (_event, input: { scenarioId: string }) =>
      testRunSessions.startScenarioRun(input)
    );
    ipcMain.handle(INTERRUPT_SCENARIO_RUN_CHANNEL, async (_event, input: { runId: string }) => {
      testRunSessions.interruptScenarioRun(input);
    });
  }

  installApplicationMenu();
  const startupOpenPath = pendingLaunchOpenPaths.shift();
  windowManager.openPrimaryWindow(
    startupOpenPath
      ? {
          startupOpenPath
        }
      : undefined
  );

  for (const targetPath of pendingLaunchOpenPaths.splice(0)) {
    openEditorWindowForLaunchPath(targetPath);
  }

  setTimeout(() => {
    void runAppUpdateCheck("auto");
  }, AUTO_UPDATE_STARTUP_DELAY_MS);

  app.on("activate", () => {
    windowManager.reopenPrimaryWindowIfNeeded();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
