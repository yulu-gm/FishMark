import path from "node:path";
import { createWorkspaceTabDropRouting } from "./workspace-tab-drop-routing";
import { createWorkspaceTabReceipts } from "./workspace-tab-receipts";
import { REQUEST_WORKSPACE_TAB_RECEIPT_EVENT, COMPLETE_WORKSPACE_TAB_RECEIPT_EVENT } from "../shared/workspace-tab-transfer";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  createWorkspaceState,
  type FileLocationIdentity,
  type FileObjectIdentity
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
  type KeyedOperationLease,
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
  session,
  nativeTheme,
  shell,
  type MenuItemConstructorOptions
} from "electron";
import { createApplicationMenuTemplate } from "./application-menu";
import { activateEditorWindow } from "./activate-editor-window";
import { importClipboardImage } from "./clipboard-image-import";
import { resolveMarkdownLaunchPathsFromArgv } from "./launch-open-path";
import { createLaunchOpenCoordinator } from "./launch-open-coordinator";
import { registerLaunchOpenHandlers } from "./ipc/register-launch-open-handlers";
import { openMarkdownFileFromPath, showOpenMarkdownPathDialog } from "./open-markdown-file";
import { registerPreviewAssetScheme } from "./preview-asset-protocol";
import { createWindowResourceProtocol } from "./window-resource-protocol";
import { showSaveMarkdownPathDialog } from "./save-markdown-file";
import { showExportHtmlDialog } from "./export-html-file";
import { createPreferencesService } from "./preferences-service";
import { createRecentFilesService } from "./recent-files-service";
import { createFontCatalogService } from "./font-catalog-service";
import { openThemesDirectory } from "./open-themes-directory";
import { resolveTemporaryImageDirectory, selectTemporaryImageDirectory, selectAndPersistTemporaryImageDirectory } from "./temporary-image-directory";
import {
  createThemePackageService,
  resolveBuiltinThemePackagesDir
} from "./theme-package-service";
import { resolveRendererEntry, resolveRendererPayloadDirectory } from "./paths";
import { configureMainProcessRuntime, shouldRequestSingleInstanceLock } from "./runtime-environment";
import { createRuntimeWindowManager, resolveAppRuntimeMode } from "./runtime-windows";
import { resolveWindowIconPath } from "./window-icon";
import { createAppUpdateCheckRunner } from "./app-update-check-runner";
import { resolveAutoUpdaterModule } from "./resolve-auto-updater-module";
import { markExternalWorkspaceChange } from "./mark-external-workspace-change";
import { createFileWatchRegistry } from "./infrastructure/file-watch-registry";
import { createDocumentRepository } from "./infrastructure/document-repository";
import { createRecoveryService } from "./infrastructure/recovery-service";
import { restoreWorkspaceRecovery } from "./restore-workspace-recovery";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { filePathIdentity } from "./file-path";
import { createResourceWorkspacePorts } from "./resource-workspace-ports";
import { resolveResourceThemeSelection } from "./resource-theme-policy";
import { createPathAuthority, createClipboardTargetAuthority, denyPathAuthority } from "./path-authority";
import { NATIVE_FILE_TOKEN_ARGUMENT } from "../shared/native-file-path";
import { registerNativeFileHandlers } from "./ipc/register-native-file-handlers";
import { createWorkspaceEditorViewHandoffs } from "./workspace-editor-view-handoffs";
import { createWorkspaceWindowCloseConfirmationHandler } from "./workspace-window-close-confirmation-handler";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";
import { createWindowCloseIntent } from "./window-close-intent";
import { createWorkspaceOwnerTabActivationRequestBroker } from "./workspace-owner-tab-activation-request-broker";
import { createWorkspaceWindowRegistrationApplication } from "./workspace-window-registration-application";
import { registerTestHandlers } from "./ipc/register-test-handlers";
import { createIpcLifecycle } from "./ipc/ipc-lifecycle";
import { createIpcSenderAuthorization } from "./ipc/ipc-sender";
import { registerWorkspaceCommandHandlers } from "./ipc/register-workspace-command-handlers";
import { registerPreferencesHandlers } from "./ipc/register-preferences-handlers";
import { registerRecentFilesHandlers } from "./ipc/register-recent-files-handlers";
import { registerFontsHandlers } from "./ipc/register-fonts-handlers";
import { registerThemesHandlers } from "./ipc/register-themes-handlers";
import { registerUpdatesHandlers } from "./ipc/register-updates-handlers";
import { registerExportHandlers } from "./ipc/register-export-handlers";
import { registerClipboardHandlers } from "./ipc/register-clipboard-handlers";
import { registerExternalHandlers } from "./ipc/register-external-handlers";
import { registerWorkspaceEditHandlers } from "./ipc/register-workspace-edit-handlers";
import {
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import {
  type RunnerEventEnvelope,
  SCENARIO_RUN_EVENT,
  type ScenarioRunTerminal,
  SCENARIO_RUN_TERMINAL_EVENT
} from "../shared/test-run-session";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  PREFERENCES_CHANGED_EVENT
} from "../shared/preferences";
import {
  RECENT_FILES_CHANGED_EVENT
} from "../shared/recent-files";
import {
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  type AppNotification,
  type AppUpdateState
} from "../shared/app-update";
import {
  OPEN_WORKSPACE_PATH_EVENT,
  REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT,
  REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT,
  type WorkspaceWindowCloseRequest
} from "../shared/workspace";

const AUTO_UPDATE_STARTUP_DELAY_MS = 5000;
const WORKSPACE_DETACH_READY_TIMEOUT_MS = 15_000;
const WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS = 15_000;
const WORKSPACE_WINDOW_CLOSE_POST_CONFIRM_WATCHDOG_MS = 15_000;
const WORKSPACE_OWNER_TAB_ACTIVATION_REQUEST_TIMEOUT_MS = 15_000;

registerPreviewAssetScheme({ protocol });
configureMainProcessRuntime(app, process.env);
const hasSingleInstanceLock = shouldRequestSingleInstanceLock(process.env)
  ? app.requestSingleInstanceLock()
  : true;
const pendingLaunchOpenPaths: string[] = [];

let openEditorWindowForLaunchPath: ((targetPath: string) => void) | null = null;
let openEmptyEditorWindow: (() => void) | null = null;
let activateExistingEditorWindow: (() => void) | null = null;
let hasPendingLaunchRequests = () => false;
let quitRequested = false;
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
  ownsSession: (sessionId: string, sender: Electron.WebContents) => boolean;
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

function handleLaunchOpenFromArgv(argv: string[], cwd = process.cwd()): boolean {
  const launchPaths = resolveMarkdownLaunchPathsFromArgv(argv);
  for (const launchPath of launchPaths) handleLaunchOpenPath(path.resolve(cwd, launchPath));
  return launchPaths.length > 0;
}

if (!hasSingleInstanceLock) {
  void app.quit();
} else {
  void handleLaunchOpenFromArgv(process.argv);

  app.on("second-instance", (_event, argv, cwd) => {
    if (!handleLaunchOpenFromArgv(argv, cwd)) {
      activateExistingEditorWindow?.();
    }
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
    resolveRendererPayloadDirectory({ isPackaged: app.isPackaged, appPath: app.getAppPath(), moduleDir: __dirname }),
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

app.whenReady().then(async () => {
  const runtimeMode = app.isPackaged ? "editor" : resolveAppRuntimeMode(process.env);
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
  const editorViewHandoffs = createWorkspaceEditorViewHandoffs({ workspace: workspaceState });
  const fileWatchRegistry = createFileWatchRegistry({
    onExternalChange: (path, kind) => {
      markExternalWorkspaceChange(workspaceState, path, kind);
    }
  });
  const documentRepository = createDocumentRepository();
  const recoveryService = createRecoveryService(app.getPath("userData"));

  const recoveryReport = await restoreWorkspaceRecovery({ workspace: workspaceState, recovery: recoveryService });
  for (const diagnostic of recoveryReport.diagnostics) console.warn(`[fishmark] ${diagnostic}`);
  if (recoveryReport.notification !== null) {
    dialog.showErrorBox(recoveryReport.notification.title, recoveryReport.notification.content);
  }

  const workspaceWatcher = {
    syncWindowPaths: fileWatchRegistry.syncWindowPaths,
    beginInternalWrite: fileWatchRegistry.beginInternalWrite,
    completeInternalWrite: fileWatchRegistry.completeInternalWrite
  };
  const workspaceTabOperations = createKeyedOperationCoordinator<string>();
  const resourceTabEpochs = new Map<string, number>();
  const advanceResourceTab = (tabId: string) => resourceTabEpochs.set(tabId, (resourceTabEpochs.get(tabId) ?? 0) + 1);
  function synchronizeSavedImageBindings(tabId: string) {
    if (recoveryService.getLiveImportedImageTabIds().includes(tabId)) recoveryService.synchronizeLiveImportedImages(workspaceState.exportSnapshot());
  }
  const workspaceFileLocationOperations =
    createKeyedOperationCoordinator<FileLocationIdentity>();
  const workspaceFileObjectOperations =
    createKeyedOperationCoordinator<FileObjectIdentity>();
  const fileIdentityResolver = createFileIdentityResolver();
  const pathAuthority = createPathAuthority({ fileIdentity: fileIdentityResolver, workspace: workspaceState });
  await pathAuthority.syncRecent(recentFilesService.getRecentFiles().entries.map((entry) => entry.path));
  const defaultTemporaryDirectory = path.join(app.getPath("userData"), "temp", "clipboard-images");
  const temporaryDirectories = new Map<string, { path: string; canonicalPath: string }>();
  async function trustTemporaryDirectory(directory: string) {
    const resolved = await fileIdentityResolver.resolveProspective(directory);
    const approval = { path: directory, canonicalPath: resolved.canonicalPath };
    temporaryDirectories.set(directory, approval);
    return approval;
  }
  await trustTemporaryDirectory(defaultTemporaryDirectory);
  const initialTemporaryDirectory = preferencesService.getPreferences().images.temporaryDirectory;
  if (initialTemporaryDirectory !== null) {
    try { await trustTemporaryDirectory(initialTemporaryDirectory); }
    catch { /* Keep the local preference; an unavailable custom directory denies paste, not app startup. */ }
  }
  const withClipboardTarget = createClipboardTargetAuthority({
    workspace: workspaceState, tabOperations: workspaceTabOperations, paths: pathAuthority,
    fileIdentity: fileIdentityResolver,
    getTemporaryDirectory() {
      const directory = resolveTemporaryImageDirectory(app.getPath("userData"), preferencesService.getPreferences());
      return temporaryDirectories.get(directory) ?? denyPathAuthority();
    }
  });
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
    workspace: createResourceWorkspacePorts(workspaceState, advanceResourceTab, synchronizeSavedImageBindings).transfer,
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
  const tabDropRouting = createWorkspaceTabDropRouting({
    hasCandidate: (sourceId, point) => BrowserWindow.getAllWindows().some(window => {
      if (String(window.id) === sourceId || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return false;
      const bounds = window.getBounds();
      return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
    })
  });
  const workspaceWindowCloseLeases = new Map<
    string,
    KeyedOperationLease<string>
  >();
  const workspaceWindowCloseLeaseAcquirers = new Map<
    string, () => Promise<KeyedOperationLease<string> | null>
  >();
  const workspaceWindowCloseApplication =
    createWorkspaceWindowClose<BrowserWindow>({
      workspace: workspaceState,
      documentOperations: workspaceTabOperations,
      requestWorkspaceWindowClose: async (ownerWindow, acquireTabLease) => {
        if (ownerWindow.webContents.isDestroyed()) {
          return Promise.resolve(null);
        }

        const windowId = String(ownerWindow.id);
        workspaceWindowCloseLeaseAcquirers.set(windowId, acquireTabLease);
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
          if (workspaceWindowCloseLeaseAcquirers.get(windowId) === acquireTabLease) {
            workspaceWindowCloseLeaseAcquirers.delete(windowId);
            workspaceWindowCloseLeases.delete(windowId);
          }
        }
      }
    });
  const workspaceWindowBindings = new Set<string>();
  const workspaceWindowCloseIntents = new Map<string, ReturnType<typeof createWindowCloseIntent>>();
  const pendingWorkspaceWindowCloseIds = new Set<string>();
  const heldWorkspaceWindowCloseReleases = new Map<string, () => void>();
  let appUpdaterPromise: Promise<AppUpdaterController> | null = null;
  let resourceThemeVersion = 0;
  const currentResourceTheme = async () => {
    const version = resourceThemeVersion;
    const preferences = preferencesService.getPreferences();
    const packages = await themePackageService.listThemePackages();
    const selection = resolveResourceThemeSelection(preferences.theme, packages, nativeTheme.shouldUseDarkColors);
    const { descriptor } = selection;
    return { version, ...selection,
      collectionRoot: descriptor?.source === "community" ? path.join(app.getPath("userData"), "themes") : resolveBuiltinThemePackagesDir({ isPackaged: app.isPackaged }) };
  };
  nativeTheme.on("updated", () => { if (preferencesService.getPreferences().theme.mode === "system") resourceThemeVersion += 1; });

  if (initialPreferences.source === "recovered-from-corrupt") {
    console.warn(
      `[fishmark] preferences reset to defaults due to corrupt file at ${initialPreferences.corruptBackupPath ?? "(unknown)"}`
    );
  }

  let resourceThemeSelection = preferencesService.getPreferences().theme;
  preferencesService.onChange((preferences) => {
    if (preferences.theme.mode !== resourceThemeSelection.mode || preferences.theme.selectedId !== resourceThemeSelection.selectedId || preferences.theme.effectsMode !== resourceThemeSelection.effectsMode) resourceThemeVersion += 1;
    resourceThemeSelection = preferences.theme;
    broadcastToWindows(PREFERENCES_CHANGED_EVENT, preferences);
    void recentFilesService.applyMaxEntries(preferences.recentFiles.maxEntries);
  });
  recentFilesService.onChange((snapshot) => {
    void pathAuthority.syncRecent(snapshot.entries.map((entry) => entry.path));
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

  const startupWindowPaths = new WeakMap<BrowserWindow, string>();
  const windowManager = createRuntimeWindowManager({
    runtimeMode,
    preloadPath: path.join(__dirname, "../preload/preload.js"),
    windowIconPath: resolveWindowIconPath(),
    showStrategy: app.isPackaged ? "immediate" : "ready-to-show",
    createWindow: (input) => {
      const token = randomBytes(32).toString("hex");
      const resourceSession = session.fromPartition(`fishmark-window-${randomBytes(24).toString("hex")}`);
      const resourceProtocol = createWindowResourceProtocol({
        session: resourceSession,
        distDirectory: resolveRendererPayloadDirectory({ isPackaged: app.isPackaged, appPath: app.getAppPath(), moduleDir: __dirname }),
        workspace: workspaceState, fileIdentity: fileIdentityResolver,
        theme: currentResourceTheme, themeVersion: () => resourceThemeVersion,
        tabEpoch: (tabId) => resourceTabEpochs.get(tabId) ?? 0,
        importedImages: (tabId, documentPath) => recoveryService.getImportedImages(tabId, documentPath).map((record) => ({
          canonicalPath: record.path, identity: record.identity, pathKey: record.identity.location,
          physicalKey: record.identity.object, exists: true
        }))
      });
      const window = new BrowserWindow({
        ...input,
        webPreferences: { ...input.webPreferences, session: resourceSession, additionalArguments: [
          ...(input.webPreferences?.additionalArguments ?? []), `${NATIVE_FILE_TOKEN_ARGUMENT}${token}`
        ] },
        show: false
      });
      const sender = window.webContents;
      resourceProtocol.bind(window);
      const startupArgument = input.webPreferences?.additionalArguments?.find((value) => value.startsWith("--fishmark-startup-open-path="));
      if (startupArgument) startupWindowPaths.set(window, decodeURIComponent(startupArgument.slice("--fishmark-startup-open-path=".length)));
      pathAuthority.bind(sender, String(window.id), token);
      let initialNavigation = true;
      sender.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
        if (!mainFrame) return;
        if (initialNavigation) { initialNavigation = false; return; }
        pathAuthority.invalidate(sender);
        resourceProtocol.invalidate();
      });
      sender.on("render-process-gone", () => { pathAuthority.invalidate(sender); resourceProtocol.invalidate(); });
      sender.on("destroyed", () => { pathAuthority.invalidate(sender, true); resourceProtocol.destroy(); });
      return window;
    },
    getAllWindows: () => BrowserWindow.getAllWindows(),
    loadRenderer: (window, mode) => {
      const targetPath = startupWindowPaths.get(window);
      if (!targetPath) { loadRenderer(window, mode); return; }
      void pathAuthority.grant(window.webContents, targetPath, "startup").then(() => loadRenderer(window, mode)).catch((error) => {
        console.error("[fishmark] startup path authorization failed", error);
        if (!window.isDestroyed()) window.destroy();
      });
    }
  });
  openEmptyEditorWindow = () => {
    windowManager.openEditorWindow();
  };

  function bindWorkspaceWindow(
    ownerWindow: BrowserWindow,
    windowId: string
  ): void {
    if (!workspaceWindowBindings.has(windowId)) {
      ownerWindow.webContents.on("before-mouse-event", (_event, mouse) => {
        tabDropRouting.observe(windowId, mouse);
        if (mouse.type === "mouseDown") { tabDropRouting.abortWindow(windowId); tabReceipts.abortWindow(windowId); }
      });
      const invalidateTransfers = () => { tabDropRouting.abortWindow(windowId); tabReceipts.abortWindow(windowId); };
      ownerWindow.webContents.on("before-input-event", (_event, key) => { if (key.type === "keyDown") invalidateTransfers(); });
      ownerWindow.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => { if (mainFrame) invalidateTransfers(); });
      ownerWindow.webContents.on("render-process-gone", invalidateTransfers);
      ownerWindow.webContents.on("destroyed", invalidateTransfers);
      ownerWindow.on("focus", () => {
        workspaceState.focusWindow(windowId);
      });
      const closeIntent = createWindowCloseIntent({
        attempt: async () => {
          const heldLease = await workspaceWindowCloseApplication.requestWindowClose({
            windowId,
            ownerWindow
          });

          if (heldLease === null) {
            quitRequested = false;
            launchOpenCoordinator.resume();
            return "cancelled";
          }

          if (ownerWindow.isDestroyed()) {
            heldLease.release();
            return "closed";
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
          return "closed";
        },
        reportError: async (error) => {
          quitRequested = false;
          launchOpenCoordinator.resume();
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
      });
      workspaceWindowCloseIntents.set(windowId, closeIntent);
      ownerWindow.on("close", (event) => {
        invalidateTransfers();
        if (pendingWorkspaceWindowCloseIds.has(windowId)) {
          pendingWorkspaceWindowCloseIds.delete(windowId);
          return;
        }
        event.preventDefault();
        void closeIntent.request();
      });
      ownerWindow.once("closed", () => {
        closeIntent.dispose();
        workspaceWindowCloseIntents.delete(windowId);
        pendingWorkspaceWindowCloseIds.delete(windowId);
        workspaceWindowCloseRequestBroker.abortWindow(windowId);
        workspaceOwnerTabActivationRequestBroker.abortWindow(windowId);
        workspaceWindowBindings.delete(windowId);
        const heldRelease = heldWorkspaceWindowCloseReleases.get(windowId);
        try {
          workspaceState.unregisterWindow(windowId);
          editorViewHandoffs.prune();
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

  function getLaunchWindow(): BrowserWindow | null {
    return getPreferredWorkspaceWindow() ?? BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.isDestroyed() && windowManager.getRuntimeMode(candidate) === "editor"
    ) ?? null;
  }

  activateExistingEditorWindow = () => {
    const window = getLaunchWindow();
    if (window) {
      activateEditorWindow(window);
    } else {
      windowManager.openEditorWindow();
    }
  };

  const launchOpenCoordinator = createLaunchOpenCoordinator<BrowserWindow>({
    preferredWindow: getLaunchWindow,
    createWindow: () => windowManager.openEditorWindow(),
    activate: (window) => { activateEditorWindow(window); },
    prepare: (window, payload) => pathAuthority.grant(window.webContents, payload.targetPath, payload.requestId!),
    send: (window, payload) => window.webContents.send(OPEN_WORKSPACE_PATH_EVENT, payload),
    revoke: (window, requestId) => pathAuthority.revokeRequest(window.webContents, requestId),
    watch: (window, lost) => {
      const contents = window.webContents;
      window.on("closed", lost);
      contents.on("render-process-gone", lost);
      contents.on("did-start-loading", lost);
      return () => {
        window.removeListener("closed", lost);
        contents.removeListener("render-process-gone", lost);
        contents.removeListener("did-start-loading", lost);
      };
    },
    schedule: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
    reportFailure: (targetPath, error) => {
      console.error("[fishmark] external open failed", targetPath, error);
      dialog.showErrorBox("Unable to open file", `${targetPath}\n${error instanceof Error ? error.message : String(error)}`);
    }
  });
  hasPendingLaunchRequests = launchOpenCoordinator.hasPending;
  app.on("before-quit", () => {
    quitRequested = true;
    launchOpenCoordinator.suspend();
  });
  openEditorWindowForLaunchPath = (targetPath) => launchOpenCoordinator.enqueue([targetPath]);

  async function recordRecentFilePath(targetPath: string | null): Promise<void> {
    if (!targetPath) {
      return;
    }

    try {
      await recentFilesService.recordFile(targetPath);
      await pathAuthority.syncRecent(recentFilesService.getRecentFiles().entries.map((entry) => entry.path), targetPath);
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

  const workspaceOpenDependencies = {
    workspace: workspaceState,
    tabOperations: workspaceTabOperations,
    fileLocationOperations: workspaceFileLocationOperations,
    fileObjectOperations: workspaceFileObjectOperations,
    fileIdentity: fileIdentityResolver,
    file: { read: openMarkdownFileFromPath },
    ownerActivation: workspaceOwnerTabActivationApplication,
    recentFiles: { record: recordRecentFilePath },
    chooseOpenPath: showOpenMarkdownPathDialog
  };
  const workspaceOpenApplication = {
    async open(input: { windowId: string }) {
      const ownerWindow = getWorkspaceWindowById(input.windowId);
      if (ownerWindow === null) denyPathAuthority();
      const owner = pathAuthority.capture(ownerWindow.webContents);
      const selected = await showOpenMarkdownPathDialog();
      owner.check();
      if (selected.status === "cancelled") return { kind: "cancelled" as const };
      if (selected.status === "error") return { kind: "error" as const, error: selected.error };
      await pathAuthority.grant(ownerWindow.webContents, selected.path, "chooser");
      return this.openPath({ windowId: input.windowId, targetPath: selected.path });
    },
    async openPath(input: { windowId: string; targetPath: string }) {
      const ownerWindow = getWorkspaceWindowById(input.windowId);
      if (ownerWindow === null) denyPathAuthority();
      const permit = pathAuthority.consume(ownerWindow.webContents, input.targetPath);
      const operation = createWorkspaceOpen({ ...workspaceOpenDependencies,
        fileIdentity: permit.fileIdentity,
        file: { read: async (candidate: string) => {
          await permit.beforeRead(candidate);
          return openMarkdownFileFromPath(candidate, {
            stat: async (targetPath) => { await permit.beforeRead(targetPath); return stat(targetPath); },
            readFile: async (targetPath) => { await permit.beforeRead(targetPath); return readFile(targetPath); }
          });
        } }
      });
      try { return await operation.openPath(input); }
      finally { permit.finish(); }
    }
  };

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
    workspace: createResourceWorkspacePorts(workspaceState, advanceResourceTab, synchronizeSavedImageBindings).save,
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
    recentFiles: { record: async (targetPath) => {
      const needsCheckpoint = targetPath !== null && recoveryService.getLiveImportedImageTabIds().some((tabId) => {
        try { const current = workspaceState.getTabSession(tabId).path; return current !== null && filePathIdentity(current, process.platform) === filePathIdentity(targetPath, process.platform); } catch { return false; }
      });
      // This callback runs after main's save commit while its tab lease remains held.
      if (needsCheckpoint) await recoverableEdits.checkpoint();
      await recordRecentFilePath(targetPath);
    } },
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
  const tabReceipts = createWorkspaceTabReceipts({
    workspace: workspaceState,
    send: (windowId, request) => {
      const window = getWorkspaceWindowById(windowId);
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) throw new Error("The target window is unavailable.");
      const zoom = window.webContents.getZoomFactor();
      window.webContents.send(REQUEST_WORKSPACE_TAB_RECEIPT_EVENT, { ...request,
        ...(request.point === undefined ? {} : { point: { x: request.point.x / zoom, y: request.point.y / zoom } }) });
    },
    complete: (windowId, result) => {
      const window = getWorkspaceWindowById(windowId);
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(COMPLETE_WORKSPACE_TAB_RECEIPT_EVENT, result);
    },
    bindAbort: (windowId, abort) => {
      const window = getWorkspaceWindowById(windowId);
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) { abort(); return () => {}; }
      // bindWorkspaceWindow owns one set of lifecycle listeners and synchronously
      // aborts all receipts for this identity, including native close attempts.
      return () => {};
    }
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
        async confirmWindowClose(input) {
          const acquireTabLease = workspaceWindowCloseLeaseAcquirers.get(input.windowId);
          if (acquireTabLease === undefined || !input.isActive()) {
            return Promise.resolve({ status: "cancelled" as const });
          }
          const lease = await acquireTabLease();
          if (lease === null || !input.isActive()) return { status: "cancelled" as const };
          workspaceWindowCloseLeases.set(input.windowId, lease);
          const result = await workspaceApplication.confirmWindowClose(input, lease);
          if (result.status !== "confirmed") workspaceWindowCloseIntents.get(input.windowId)?.cancelQueued();
          return result;
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

  const ipc = createIpcLifecycle(ipcMain);
  const authorize = createIpcSenderAuthorization({
    resolveWindow: (sender) => BrowserWindow.fromWebContents(sender),
    getWindowPolicy: (window) => {
      const mode = windowManager.getPreloadBridgeMode(window);
      const modeRuntime = windowManager.getRuntimeMode(window);
      return mode === undefined || modeRuntime === undefined ? undefined : {
        mode,
        entryUrl: resolveRendererEntry(resolveRendererPayloadDirectory({ isPackaged: app.isPackaged, appPath: app.getAppPath(), moduleDir: __dirname }), process.env.VITE_DEV_SERVER_URL, modeRuntime)
      };
    }
  });
  app.once("quit", () => ipc.dispose());

  registerWorkspaceEditHandlers({
    ipc, authorize,
    ensureWindow: workspaceWindowRegistrationApplication.ensureWindow,
    getWindowId: (sender) => {
      const owner = BrowserWindow.fromWebContents(sender);
      return owner === null ? undefined : String(owner.id);
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
    }
  });

  registerLaunchOpenHandlers({
    ipc, authorize, resolveWindow: (sender) => BrowserWindow.fromWebContents(sender),
    setReady: launchOpenCoordinator.setReady,
    complete: launchOpenCoordinator.complete
  });
  registerWorkspaceCommandHandlers({
    ipc, authorize, ensureWindow: workspaceWindowRegistrationApplication.ensureWindow,
    requireOpenPath: pathAuthority.requirePath,
    workspaceApplication, workspaceState, documentRepository, resolveExternalChange, editorViewHandoffs,
    workspaceOwnerTabActivationRequestBroker, workspaceWindowCloseRequestBroker,
    handleWorkspaceWindowCloseConfirmation, tabDropRouting, tabReceipts
  });
  registerPreferencesHandlers({ ipc, authorize, service: preferencesService, selectTemporaryDirectory: async (check, sender) => {
    const owner = pathAuthority.capture(sender);
    return selectAndPersistTemporaryImageDirectory({ select: selectTemporaryImageDirectory, fileIdentity: fileIdentityResolver,
      check: () => { check(); owner.check(); }, service: preferencesService,
      commit: (directory) => { temporaryDirectories.set(directory, { path: directory, canonicalPath: directory }); }
    });
  } });
  registerRecentFilesHandlers({ ipc, authorize, service: recentFilesService });
  registerFontsHandlers({ ipc, authorize, service: fontCatalogService });
  registerThemesHandlers({ ipc, authorize, service: {
    listThemePackages: themePackageService.listThemePackages,
    refreshThemePackages: async () => { resourceThemeVersion += 1; return themePackageService.refreshThemePackages(); }
  }, openDirectory: () => openThemesDirectory(app.getPath("userData")) });
  registerUpdatesHandlers({ ipc, authorize, checkForUpdates: () => runAppUpdateCheck("manual") });
  registerExportHandlers({ ipc, authorize, exportHtml: showExportHtmlDialog });
  registerNativeFileHandlers({ ipc, authorize, paths: pathAuthority });
  registerClipboardHandlers({ ipc, authorize, importImage: (input, sender, check) =>
    withClipboardTarget(sender, input.tabId, check, async (target) => {
      const result = await importClipboardImage({ documentPath: target.documentPath }, { clipboard, ...target });
      if (result.status !== "success" || result.storage !== "temporary") return result;
      await target.beforeWrite(path.dirname(result.filePath));
      const image = await fileIdentityResolver.resolveExisting(result.filePath);
      target.check();
      const approvedDirectory = temporaryDirectories.get(target.temporaryDirectory)?.canonicalPath;
      if (!approvedDirectory) denyPathAuthority();
      const relative = path.relative(approvedDirectory, image.canonicalPath);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) denyPathAuthority();
      if (!/^inode:\d+:[1-9]\d*$/.test(image.identity.object)) denyPathAuthority();
      await recoverableEdits.checkpoint(target.check, (snapshot) => recoveryService.compactWithImportedImage(snapshot,
        { path: image.canonicalPath, identity: image.identity, tabId: input.tabId, documentPaths: [] },
        () => { try { target.check(); return true; } catch { return false; } }, () => workspaceState.exportSnapshot()));
      target.check(); return result;
    }) });
  registerExternalHandlers({ ipc, authorize, openExternal: (href) => shell.openExternal(href) });

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
        windowManager.openEditorWindow({ preloadBridgeMode: "editor-test" }),
      authorizeFixture: (sender, targetPath, requestId) => pathAuthority.grant(sender, targetPath, requestId)
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

    registerTestHandlers({
      ipc, authorize, enabled: !app.isPackaged && runtimeMode === "test-workbench",
      editorSessions: editorTestSessions, runSessions: testRunSessions
    });
  }

  installApplicationMenu();
  windowManager.openPrimaryWindow();
  launchOpenCoordinator.enqueue(pendingLaunchOpenPaths.splice(0));

  setTimeout(() => {
    void runAppUpdateCheck("auto");
  }, AUTO_UPDATE_STARTUP_DELAY_MS);

  app.on("activate", () => {
    windowManager.reopenPrimaryWindowIfNeeded();
  });

  let recoveryShutdownStarted = false;
  let recoveryShutdownFinished = false;
  app.on("will-quit", (event) => {
    launchOpenCoordinator.dispose();
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
  if (process.platform !== "darwin" && (quitRequested || !hasPendingLaunchRequests())) {
    app.quit();
  }
});
