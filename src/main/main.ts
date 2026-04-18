import path from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  protocol,
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
import { createPreferencesService } from "./preferences-service";
import { createFontCatalogService } from "./font-catalog-service";
import { createThemePackageService } from "./theme-package-service";
import { resolveRendererEntry } from "./paths";
import { configureMainProcessRuntime, shouldRequestSingleInstanceLock } from "./runtime-environment";
import { createRuntimeWindowManager, resolveAppRuntimeMode } from "./runtime-windows";
import { resolveWindowIconPath } from "./window-icon";
import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  SCENARIO_RUN_EVENT,
  type ScenarioRunTerminal,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL
} from "../shared/test-run-session";
import {
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL,
  type HandleDroppedMarkdownFileInput,
  type HandleDroppedMarkdownFileResult
} from "../shared/open-markdown-file";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  GET_PREFERENCES_CHANNEL,
  PREFERENCES_CHANGED_EVENT,
  UPDATE_PREFERENCES_CHANNEL,
  type PreferencesUpdate
} from "../shared/preferences";
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
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  CHECK_FOR_APP_UPDATES_CHANNEL,
  type AppNotification,
  type AppUpdateState
} from "../shared/app-update";

const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";
const LIST_FONT_FAMILIES_CHANNEL = "yulora:list-font-families";
const LIST_THEME_PACKAGES_CHANNEL = "yulora:list-theme-packages";
const REFRESH_THEME_PACKAGES_CHANNEL = "yulora:refresh-theme-packages";
const AUTO_UPDATE_STARTUP_DELAY_MS = 5000;
registerPreviewAssetScheme({ protocol });
configureMainProcessRuntime(app, process.env);
const hasSingleInstanceLock = shouldRequestSingleInstanceLock(process.env)
  ? app.requestSingleInstanceLock()
  : true;
const pendingLaunchOpenPaths: string[] = [];

let openEditorWindowForLaunchPath: ((targetPath: string) => void) | null = null;
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

app.whenReady().then(async () => {
  const runtimeMode = resolveAppRuntimeMode(process.env);
  registerPreviewAssetProtocol({ protocol });
  const preferencesService = createPreferencesService({
    userDataDir: app.getPath("userData"),
    onCorruptRecovery: (backupPath) => {
      // Surface the corrupt-file recovery so it shows up in launch logs
      // without crashing startup.
      const target = backupPath ?? "(rename failed)";
      console.warn(`[yulora] preferences file was corrupt; backed up to ${target}`);
    }
  });

  const initialPreferences = await preferencesService.initialize();
  const themePackageService = createThemePackageService({
    userDataDir: app.getPath("userData")
  });
  const fontCatalogService = createFontCatalogService({
    platform: process.platform
  });
  let appUpdaterPromise: Promise<AppUpdaterController> | null = null;

  if (initialPreferences.source === "recovered-from-corrupt") {
    console.warn(
      `[yulora] preferences reset to defaults due to corrupt file at ${initialPreferences.corruptBackupPath ?? "(unknown)"}`
    );
  }

  preferencesService.onChange((preferences) => {
    broadcastToWindows(PREFERENCES_CHANGED_EVENT, preferences);
  });

  const getAppUpdater = async (): Promise<AppUpdaterController> => {
    if (!appUpdaterPromise) {
      appUpdaterPromise = (async () => {
        const [{ autoUpdater }, { createAppUpdater }] = await Promise.all([
          import("electron-updater"),
          import("./app-updater.js")
        ]);

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
  runManualAppUpdateCheck = () => {
    void getAppUpdater().then((controller) => controller.checkForUpdates("manual"));
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
  openEditorWindowForLaunchPath = (targetPath: string) => {
    windowManager.openEditorWindow({ startupOpenPath: targetPath });
  };
  ipcMain.handle(OPEN_MARKDOWN_FILE_CHANNEL, async () => showOpenMarkdownDialog());
  ipcMain.handle(OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, async (_event, input: { targetPath: string }) =>
    openMarkdownFileFromPath(input.targetPath)
  );
  ipcMain.handle(
    HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
    async (
      _event,
      input: HandleDroppedMarkdownFileInput
    ): Promise<HandleDroppedMarkdownFileResult> => {
      if (input.hasOpenDocument) {
        openEditorWindowForLaunchPath?.(input.targetPath);
        return {
          disposition: "opened-in-new-window"
        };
      }

      return {
        disposition: "open-in-place"
      };
    }
  );
  ipcMain.handle(SAVE_MARKDOWN_FILE_CHANNEL, async (_event, input: SaveMarkdownFileInput) =>
    saveMarkdownFileToPath(input)
  );
  ipcMain.handle(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (_event, input: SaveMarkdownFileAsInput) =>
    showSaveMarkdownDialog(input)
  );
  ipcMain.handle(IMPORT_CLIPBOARD_IMAGE_CHANNEL, async (_event, input: ImportClipboardImageInput) =>
    importClipboardImage(input, { clipboard })
  );
  ipcMain.handle(GET_PREFERENCES_CHANNEL, async () => preferencesService.getPreferences());
  ipcMain.handle(UPDATE_PREFERENCES_CHANNEL, async (_event, patch: PreferencesUpdate | undefined) =>
    preferencesService.updatePreferences(patch)
  );
  ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL, async () => fontCatalogService.listFontFamilies());
  ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL, async () =>
    getAppUpdater().then((controller) => controller.checkForUpdates("manual"))
  );
  ipcMain.handle(LIST_THEME_PACKAGES_CHANNEL, async () => themePackageService.listThemePackages());
  ipcMain.handle(REFRESH_THEME_PACKAGES_CHANNEL, async () =>
    themePackageService.refreshThemePackages()
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
      openEditorWindow: () => windowManager.openEditorWindow()
    });

    const cliRunner = createCliProcessRunner({
      cliScriptPath: path.join(__dirname, "../../dist-cli/cli/bin.js"),
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
    void getAppUpdater().then((controller) => controller.checkForUpdates("auto"));
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
