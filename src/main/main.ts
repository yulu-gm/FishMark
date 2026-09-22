import path from "node:path";
import {
  createWorkspaceState,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceWindowProjection
} from "@fishmark/workspace-domain";
import {
  createApplyDocumentEdits,
  createRecoverableDocumentEdits,
  createFlushDocumentEdits,
  createCloseWorkspace,
  createSaveDocument,
  createWorkspaceApplication,
  createWorkspaceDetach,
  createWorkspaceOpen,
  createWorkspaceOwnerTabActivation,
  createWorkspaceReload,
  createWorkspaceTabReorder,
  createWorkspaceTabTransfer,
  createWorkspaceWindowClose,
  createResolveExternalChange,
  type CloseWorkspaceTabResult,
  type KeyedOperationLease,
  type WorkspaceMoveCommandResult,
  type WorkspaceProjectionCommandResult,
  type WorkspaceProjectionMutationResult,
  type WorkspaceWindowCloseConfirmation
} from "@fishmark/workspace-application";
import { createCodeMirrorTextBuffer } from "@fishmark/workspace-infrastructure";
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
import { openMarkdownFileFromPath, showOpenMarkdownPathDialog } from "./open-markdown-file";
import {
  registerPreviewAssetProtocol,
  registerPreviewAssetScheme
} from "./preview-asset-protocol";
import { showSaveMarkdownPathDialog } from "./save-markdown-file";
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
import { createFileWatchRegistry } from "./infrastructure/file-watch-registry";
import { createDocumentRepository } from "./infrastructure/document-repository";
import { createRecoveryService } from "./infrastructure/recovery-service";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { createWorkspaceWindowCloseConfirmationHandler } from "./workspace-window-close-confirmation-handler";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";
import { createWorkspaceOwnerTabActivationRequestBroker } from "./workspace-owner-tab-activation-request-broker";
import { createWorkspaceWindowRegistrationApplication } from "./workspace-window-registration-application";
import { registerWorkspaceHandlers } from "./ipc/register-workspace-handlers";
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
import { SYNC_WATCHED_MARKDOWN_FILE_CHANNEL } from "../shared/external-file-change";
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
  CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL,
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
  REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT,
  RESOLVE_EXTERNAL_CHANGE_CHANNEL,
  type ActivateWorkspaceTabInput,
  type CloseWorkspaceTabInput,
  type ConfirmWorkspaceOwnerTabActivationInput,
  type CompleteWorkspaceWindowCloseInput,
  type ConfirmWorkspaceWindowCloseInput,
  type ConfirmWorkspaceWindowCloseResult,
  type CreateWorkspaceTabInput,
  type DetachWorkspaceTabToNewWindowInput,
  type MoveWorkspaceTabToWindowInput,
  type OpenWorkspacePathRequest,
  type OpenWorkspaceFileFromPathResult,
  type OpenWorkspaceFileResult,
  type ReloadWorkspaceTabFromPathInput,
  type ReloadWorkspaceTabFromPathResult,
  type ReorderWorkspaceTabInput,
  type ResolveExternalChangeInput,
  type WorkspaceWindowCloseRequest
} from "../shared/workspace";

const AUTO_UPDATE_STARTUP_DELAY_MS = 5000;
const WORKSPACE_DETACH_READY_TIMEOUT_MS = 15_000;
const WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS = 15_000;
const WORKSPACE_WINDOW_CLOSE_POST_CONFIRM_WATCHDOG_MS = 15_000;
const WORKSPACE_OWNER_TAB_ACTIVATION_REQUEST_TIMEOUT_MS = 15_000;

function mapResolveExternalChangeResult(
  result: import("@fishmark/workspace-application").ResolveExternalChangeResult
): import("../shared/workspace").ResolveExternalChangeResult {
  if (result.kind === "resolved" || result.kind === "reloaded" || result.kind === "saved-as") {
    return { kind: "resolved" };
  }
  if (result.kind === "cancelled") {
    return { kind: "cancelled" };
  }
  return { kind: "error", message: "The tab is no longer available." };
}

function requireWorkspaceCommandProjection(
  result: WorkspaceProjectionMutationResult
): WorkspaceWindowProjection;
function requireWorkspaceCommandProjection(
  result: WorkspaceMoveCommandResult
): import("@fishmark/workspace-domain").WorkspaceMoveProjection;
function requireWorkspaceCommandProjection(
  result: CloseWorkspaceTabResult |
    Extract<WorkspaceProjectionCommandResult, { readonly kind: "watch-error" }>
): WorkspaceWindowProjection;
function requireWorkspaceCommandProjection(
  result:
    | WorkspaceProjectionMutationResult
    | WorkspaceMoveCommandResult
    | CloseWorkspaceTabResult
): WorkspaceWindowProjection | import("@fishmark/workspace-domain").WorkspaceMoveProjection {
  if ("status" in result) {
    if (result.status === "error") throw new Error(result.error.message);
    return result.snapshot;
  }
  if (result.kind === "success" || result.kind === "applied") {
    return result.projection;
  }
  if (result.kind === "watch-error") {
    throw new Error(result.error.message);
  }
  const messages = {
    "tab-missing": "The tab no longer exists.",
    "window-missing": "The owner window no longer exists.",
    "window-changed": "The tab moved to another window.",
    "revision-changed": "The document changed before the command could be committed."
  } as const;
  throw new Error(messages[result.reason]);
}
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
  const workspaceState = createWorkspaceState({ createTextBuffer: createCodeMirrorTextBuffer });
  const fileWatchRegistry = createFileWatchRegistry({
    onExternalChange: (path, kind) => {
      const session = workspaceState.exportSnapshot().sessions.find((s) => s.path === path);
      if (session !== undefined) {
        workspaceState.markExternalChange({
          tabId: session.tabId,
          expectedWindowId: session.windowId,
          change: { kind }
        });
      }
    }
  });
  const documentRepository = createDocumentRepository();
  const recoveryService = createRecoveryService(app.getPath("userData"));

  const recovery = await recoveryService.loadRecovery();
  if (recovery.kind === "recovery-available") {
    if (recovery.incompleteTail) {
      console.warn("[fishmark] Recovery journal has an incomplete final write; replaying its valid prefix.");
      dialog.showErrorBox("Recovery incomplete", "The final recovery write was interrupted. Earlier completed edits have been recovered.");
    }
    if (recovery.snapshot !== null) {
      workspaceState.restoreSnapshot(recovery.snapshot);
    }
    for (const batch of recovery.editBatches) {
      try {
        const session = workspaceState.getTabSession(batch.tabId);
        // Snapshot replacement may have completed before journal truncation.
        if (session.revision > batch.baseRevision) continue;
        const result = workspaceState.applyDocumentEdits({
          tabId: batch.tabId,
          expectedWindowId: session.windowId,
          // Client ACK counters are transient and are not part of the workspace snapshot.
          clientId: `recovery:${batch.clientId}:${batch.baseRevision}`,
          clientSequence: 1,
          baseRevision: batch.baseRevision,
          changes: batch.changes
        });
        if (result.kind !== "applied" && result.kind !== "duplicate") {
          throw new Error(`Recovery replay stopped: ${result.kind}`);
        }
      } catch (error) {
        console.error("[fishmark] Recovery replay stopped; original files retained.", error);
        dialog.showErrorBox("Recovery incomplete", "Some recovery entries could not be replayed. The recovered prefix is available.");
        break;
      }
    }
  } else if (recovery.kind === "corrupt") {
    console.error(`[fishmark] recovery data is corrupt at ${recovery.path}; starting fresh.`);
  }

  const workspaceWatcher = {
    syncWindowPaths: fileWatchRegistry.syncWindowPaths,
    beginInternalWrite: fileWatchRegistry.beginInternalWrite,
    completeInternalWrite: fileWatchRegistry.completeInternalWrite
  };
  const workspaceTabOperations = createKeyedOperationCoordinator<string>();
  const workspaceFileLocationOperations =
    createKeyedOperationCoordinator<FileLocationIdentity>();
  const workspaceFileObjectOperations =
    createKeyedOperationCoordinator<FileObjectIdentity>();
  const fileIdentityResolver = createFileIdentityResolver();
  const recoverableEdits = createRecoverableDocumentEdits({
    workspace: workspaceState,
    recovery: recoveryService
  });
  const applyDocumentEditsWithRecovery = createApplyDocumentEdits({
    workspace: recoverableEdits,
    documentOperations: workspaceTabOperations
  });
  const flushDocumentEdits = createFlushDocumentEdits({
    workspace: workspaceState,
    documentOperations: workspaceTabOperations
  });
  const workspaceTabTransferApplication = createWorkspaceTabTransfer({
    workspace: workspaceState,
    documentOperations: workspaceTabOperations
  });
  const workspaceTabReorderApplication = createWorkspaceTabReorder({
    workspace: workspaceState,
    documentOperations: workspaceTabOperations
  });
  const workspaceWindowCloseRequestBroker =
    createWorkspaceWindowCloseRequestBroker<WorkspaceWindowCloseConfirmation>({
      scheduleTimeout: (listener) => {
        const timeout = setTimeout(
          listener,
          WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS
        );
        return () => clearTimeout(timeout);
      },
      schedulePostConfirmationWatchdog: (listener) => {
        const timeout = setTimeout(
          listener,
          WORKSPACE_WINDOW_CLOSE_POST_CONFIRM_WATCHDOG_MS
        );
        return () => clearTimeout(timeout);
      }
    });
  const workspaceOwnerTabActivationRequestBroker =
    createWorkspaceOwnerTabActivationRequestBroker({
      scheduleTimeout: (listener) => {
        const timeout = setTimeout(
          listener,
          WORKSPACE_OWNER_TAB_ACTIVATION_REQUEST_TIMEOUT_MS
        );
        return () => clearTimeout(timeout);
      }
    });
  const workspaceWindowCloseLeases = new Map<
    string,
    KeyedOperationLease<string>
  >();
  const workspaceWindowCloseApplication =
    createWorkspaceWindowClose<BrowserWindow>({
      workspace: workspaceState,
      documentOperations: workspaceTabOperations,
      requestWorkspaceWindowClose: async (ownerWindow, tabLease) => {
        if (ownerWindow.webContents.isDestroyed()) {
          return Promise.resolve(null);
        }

        const windowId = String(ownerWindow.id);
        workspaceWindowCloseLeases.set(windowId, tabLease);
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
          if (workspaceWindowCloseLeases.get(windowId) === tabLease) {
            workspaceWindowCloseLeases.delete(windowId);
          }
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

  function bindWorkspaceWindow(
    ownerWindow: BrowserWindow,
    windowId: string
  ): void {
    if (!workspaceWindowBindings.has(windowId)) {
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
        workspaceOwnerTabActivationRequestBroker.abortWindow(windowId);
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

  const workspaceOwnerTabActivationApplication =
    createWorkspaceOwnerTabActivation<BrowserWindow>({
      workspace: workspaceState,
      tabOperations: workspaceTabOperations,
      activationRequestBroker: workspaceOwnerTabActivationRequestBroker,
      resolveWindow: getWorkspaceWindowById,
      isWindowUnavailable: (window) =>
        window.isDestroyed() || window.webContents.isDestroyed(),
      sendRequest: (window, request) => {
        window.webContents.send(
          REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT,
          request
        );
      },
      bindAbort: (window, listener) => {
        window.webContents.on("render-process-gone", listener);
        window.webContents.on("destroyed", listener);
        return () => {
          window.webContents.removeListener("render-process-gone", listener);
          window.webContents.removeListener("destroyed", listener);
        };
      },
      focusWindow: (window) => window.focus()
    });

  const workspaceOpenApplication = createWorkspaceOpen({
    workspace: workspaceState,
    tabOperations: workspaceTabOperations,
    fileLocationOperations: workspaceFileLocationOperations,
    fileObjectOperations: workspaceFileObjectOperations,
    fileIdentity: fileIdentityResolver,
    file: { read: openMarkdownFileFromPath },
    ownerActivation: workspaceOwnerTabActivationApplication,
    recentFiles: { record: recordRecentFilePath },
    chooseOpenPath: showOpenMarkdownPathDialog
  });

  const workspaceReloadApplication = createWorkspaceReload({
    workspace: workspaceState,
    tabOperations: workspaceTabOperations,
    fileLocationOperations: workspaceFileLocationOperations,
    fileObjectOperations: workspaceFileObjectOperations,
    fileIdentity: fileIdentityResolver,
    file: { read: openMarkdownFileFromPath },
    recentFiles: { record: recordRecentFilePath }
  });
  const workspaceFileOperations = createSaveDocument({
    workspace: workspaceState,
    tabOperations: workspaceTabOperations,
    fileLocationOperations: workspaceFileLocationOperations,
    fileObjectOperations: workspaceFileObjectOperations,
    fileIdentity: fileIdentityResolver,
    disk: {
      readDiskVersion: documentRepository.readDiskVersion,
      writeDocument: documentRepository.writeDocument
    },
    dialog: {
      chooseSavePath: showSaveMarkdownPathDialog
    },
    watcher: workspaceWatcher,
    recentFiles: { record: recordRecentFilePath },
    cleanupReporter: {
      report: (error) => {
        console.error("[fishmark] workspace file operation cleanup failed.", error);
      }
    }
  });
  const closeWorkspace = createCloseWorkspace({
    workspace: workspaceState,
    documentOperations: workspaceTabOperations,
    chooseDirtyTab: async (tab) => {
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
      return result.response === 0 ? "save" : result.response === 1 ? "discard" : "cancel";
    },
    resolveContext: (windowId) => {
      const ownerWindow = getWorkspaceWindowById(windowId);
      return ownerWindow === null || ownerWindow.webContents.isDestroyed()
        ? null
        : ownerWindow.webContents;
    },
    saveDocument: workspaceFileOperations
  });
  const workspaceDetachApplication = createWorkspaceDetach({
    workspace: workspaceState,
    tabTransfer: workspaceTabTransferApplication,
    windowLifecycle: {
      openWindow: () => windowManager.openEditorWindow(),
      scheduleReadyTimeout: (listener) => {
        const timeout = setTimeout(listener, WORKSPACE_DETACH_READY_TIMEOUT_MS);
        return () => clearTimeout(timeout);
      },
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
  const workspaceApplication = createWorkspaceApplication({
    workspace: workspaceState,
    documentOperations: workspaceTabOperations,
    watcher: workspaceWatcher,
    open: workspaceOpenApplication,
    reload: workspaceReloadApplication,
    reorder: workspaceTabReorderApplication,
    transfer: workspaceTabTransferApplication,
    detach: workspaceDetachApplication,
    edits: {
      apply: applyDocumentEditsWithRecovery.apply,
      flush: flushDocumentEdits.flush
    },
    save: workspaceFileOperations,
    close: closeWorkspace
  });
  const resolveExternalChange = createResolveExternalChange<Electron.WebContents>({
    workspace: workspaceState,
    reload: (input) => workspaceApplication.reloadTab(input),
    saveAs: (input) => workspaceFileOperations.saveAs(input)
  });
  const handleWorkspaceWindowCloseConfirmation =
    createWorkspaceWindowCloseConfirmationHandler({
      broker: workspaceWindowCloseRequestBroker,
      closeWorkspace: {
        confirmWindowClose(input) {
          const lease = workspaceWindowCloseLeases.get(input.windowId);
          if (lease === undefined) {
            return Promise.resolve({ status: "cancelled" as const });
          }
          return workspaceApplication.confirmWindowClose(input, lease);
        }
      }
    });

  const workspaceWindowRegistrationApplication =
    createWorkspaceWindowRegistrationApplication<Electron.WebContents, BrowserWindow>({
      isSenderDestroyed: (sender) => sender.isDestroyed(),
      resolveOwnerWindow: (sender) => BrowserWindow.fromWebContents(sender),
      isOwnerWindowDestroyed: (ownerWindow) =>
        ownerWindow.isDestroyed() || ownerWindow.webContents.isDestroyed(),
      isOwnerWindowForSender: (ownerWindow, sender) =>
        ownerWindow.webContents === sender,
      getWindowId: (ownerWindow) => String(ownerWindow.id),
      markWindowReady: workspaceApplication.markWindowReady,
      registerWindow: (windowId) => workspaceState.registerWindow(windowId),
      bindWindow: bindWorkspaceWindow,
      focusWindow: (windowId) => workspaceState.focusWindow(windowId)
    });

  registerWorkspaceHandlers<Electron.WebContents>({
    register: (channel, handler) => {
      ipcMain.handle(channel, handler);
    },
    ensureWindow: workspaceWindowRegistrationApplication.ensureWindow,
    isCurrentSender: (sender, windowId) => {
      if (sender.isDestroyed()) return false;
      const ownerWindow = BrowserWindow.fromWebContents(sender);
      return ownerWindow !== null &&
        !ownerWindow.isDestroyed() &&
        !ownerWindow.webContents.isDestroyed() &&
        ownerWindow.webContents === sender &&
        String(ownerWindow.id) === windowId;
    },
    application: {
      applyDocumentEdits(input, authorize) {
        const closeLease = workspaceWindowCloseLeases.get(input.expectedWindowId);
        return closeLease === undefined
          ? applyDocumentEditsWithRecovery.apply(input, authorize)
          : applyDocumentEditsWithRecovery.applyWithHeldTabLease(
              input,
              authorize,
              closeLease
            );
      },
      flushDocumentEdits(input, authorize) {
        const closeLease = workspaceWindowCloseLeases.get(input.expectedWindowId);
        return closeLease === undefined
          ? flushDocumentEdits.flush(input, authorize)
          : flushDocumentEdits.flushWithHeldTabLease(
              input,
              authorize,
              closeLease
            );
      }
    },
    publish: (sender, channel, payload) => {
      sender.send(channel, payload);
    }
  });

  ipcMain.handle(GET_WORKSPACE_SNAPSHOT_CHANNEL, async (event) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.getSnapshot({ context: event.sender, windowId })
    ));
  });
  ipcMain.handle(
    RESOLVE_EXTERNAL_CHANGE_CHANNEL,
    async (event, input: ResolveExternalChangeInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
      let tab;
      try {
        tab = workspaceState.getTabSession(input.tabId);
      } catch {
        return { kind: "error", message: "The tab no longer exists." };
      }
      if (tab.windowId !== windowId) {
        return { kind: "error", message: "The tab moved to another window." };
      }

      const context = { context: event.sender, tabId: input.tabId, expectedWindowId: windowId };
      if (input.command === "keep-memory") {
        const diskVersion = tab.path === null
          ? null
          : await documentRepository.readDiskVersion(tab.path);
        const result = await resolveExternalChange.resolve(context, {
          kind: "keep-memory",
          diskVersion
        });
        return mapResolveExternalChangeResult(result);
      }
      const result = await resolveExternalChange.resolve(
        context,
        input.command === "reload"
          ? { kind: "reload" }
          : input.command === "save-as"
            ? { kind: "save-as" }
            : { kind: "cancel" }
      );
      return mapResolveExternalChangeResult(result);
    }
  );
  ipcMain.handle(
    CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL,
    async (event, input: ConfirmWorkspaceOwnerTabActivationInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(
        event.sender
      );
      return workspaceOwnerTabActivationRequestBroker.complete({
        ...input,
        windowId
      });
    }
  );
  ipcMain.handle(
    CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
    async (event, input: ConfirmWorkspaceWindowCloseInput):
      Promise<ConfirmWorkspaceWindowCloseResult> => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
      return handleWorkspaceWindowCloseConfirmation({
        windowId,
        requestId: input.requestId
      });
    }
  );
  ipcMain.handle(
    COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
    async (event, input: CompleteWorkspaceWindowCloseInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);

      workspaceWindowCloseRequestBroker.complete(
        input.requestId,
        windowId,
        input.shouldClose
      );
    }
  );
  ipcMain.handle(CREATE_WORKSPACE_TAB_CHANNEL, async (event, input: CreateWorkspaceTabInput) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.createTab({
        context: event.sender,
        windowId,
        kind: input.kind
      })
    ));
  });
  ipcMain.handle(OPEN_WORKSPACE_FILE_CHANNEL, async (event) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    const result = await workspaceApplication.open({ context: event.sender, windowId });
    if (result.kind !== "success") {
      if (result.kind === "watch-error") throw new Error(result.error.message);
      return result satisfies OpenWorkspaceFileResult;
    }
    return {
      kind: "success",
      snapshot: toWorkspaceWindowSnapshot(result.projection)
    } satisfies OpenWorkspaceFileResult;
  });
  ipcMain.handle(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, async (event, input: { targetPath: string }) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    const result = await workspaceApplication.openPath({
      context: event.sender,
      windowId,
      targetPath: input.targetPath
    });
    if (result.kind !== "success") {
      if (result.kind === "watch-error") throw new Error(result.error.message);
      return result satisfies OpenWorkspaceFileFromPathResult;
    }
    return {
      kind: "success",
      snapshot: toWorkspaceWindowSnapshot(result.projection)
    } satisfies OpenWorkspaceFileFromPathResult;
  });
  ipcMain.handle(
    RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
    async (event, input: ReloadWorkspaceTabFromPathInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
      const result = await workspaceApplication.reloadTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId
      });
      if (result.kind !== "success") {
        if (result.kind === "watch-error" || result.kind === "stale") {
          requireWorkspaceCommandProjection(result);
          throw new Error("Workspace command failure mapping returned unexpectedly.");
        }
        if (result.kind === "error") {
          const code = result.error.code;
          if (code === "file-identity-missing") {
            throw new Error(result.error.message);
          }
          return {
            kind: "error",
            error: { code, message: result.error.message }
          } satisfies ReloadWorkspaceTabFromPathResult;
        }
        return result satisfies ReloadWorkspaceTabFromPathResult;
      }

      return {
        kind: "success",
        snapshot: toWorkspaceWindowSnapshot(result.projection)
      } satisfies ReloadWorkspaceTabFromPathResult;
    }
  );
  ipcMain.handle(ACTIVATE_WORKSPACE_TAB_CHANNEL, async (event, input: ActivateWorkspaceTabInput) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.activateTab({
        context: event.sender,
        windowId,
        tabId: input.tabId
      })
    ));
  });
  ipcMain.handle(CLOSE_WORKSPACE_TAB_CHANNEL, async (event, input: CloseWorkspaceTabInput) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    const result = await workspaceApplication.closeTab({
      context: event.sender,
      tabId: input.tabId,
      expectedWindowId: windowId
    });
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(result));
  });
  ipcMain.handle(REORDER_WORKSPACE_TAB_CHANNEL, async (event, input: ReorderWorkspaceTabInput) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.reorderTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId,
        targetIndex: input.toIndex
      })
    ));
  });
  ipcMain.handle(
    MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
    async (event, input: MoveWorkspaceTabToWindowInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
      return toWorkspaceMoveTabResult(
        requireWorkspaceCommandProjection(await workspaceApplication.moveTab({
          context: event.sender,
          tabId: input.tabId,
          expectedWindowId: windowId,
          targetWindowId: input.targetWindowId,
          targetIndex: input.targetIndex
        }))
      );
    }
  );
  ipcMain.handle(
    DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
    async (event, input: DetachWorkspaceTabToNewWindowInput) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
      const result = await workspaceApplication.detachTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId
      });
      return toWorkspaceWindowSnapshot(
        requireWorkspaceCommandProjection(result).sourceWindowSnapshot
      );
    }
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
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    const result = await workspaceApplication.saveDocument({
      context: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId
    });
    if ("kind" in result) throw new Error(result.error.message);
    return result;
  });
  ipcMain.handle(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (event, input: SaveMarkdownFileAsInput) => {
    const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender);
    const result = await workspaceApplication.saveDocumentAs({
      context: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId
    });
    if ("kind" in result) throw new Error(result.error.message);
    return result;
  });
  ipcMain.handle(EXPORT_HTML_FILE_CHANNEL, async (_event, input: ExportHtmlFileInput) =>
    showExportHtmlDialog(input)
  );
  ipcMain.handle(
    SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
    async (event) => {
      const windowId = await workspaceWindowRegistrationApplication.ensureWindow(
        event.sender
      );
      return workspaceApplication.syncWindow({
        context: event.sender,
        windowId
      });
    }
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

  let recoveryShutdownStarted = false;
  let recoveryShutdownFinished = false;
  app.on("will-quit", (event) => {
    if (recoveryShutdownFinished) return;
    event.preventDefault();
    if (recoveryShutdownStarted) return;
    recoveryShutdownStarted = true;
    const timeout = setTimeout(() => {
      console.error("[fishmark] Recovery shutdown timed out; completed journal entries are retained.");
      recoveryShutdownFinished = true;
      app.quit();
    }, 5000);
    void recoverableEdits.shutdown().catch((error: unknown) => {
      console.error("[fishmark] Recovery shutdown failed.", error);
      dialog.showErrorBox("Recovery write failed", "Recovery could not be updated. Previously completed journal entries are retained.");
    }).finally(() => {
      clearTimeout(timeout);
      if (recoveryShutdownFinished) return;
      recoveryShutdownFinished = true;
      app.quit();
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
