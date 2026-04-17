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
import { autoUpdater } from "electron-updater";

import { createAppUpdater } from "./app-updater";
import { createApplicationMenuTemplate } from "./application-menu";
import { createCliProcessRunner } from "./cli-process-runner";
import { importClipboardImage } from "./clipboard-image-import";
import { resolveMarkdownLaunchPathFromArgv } from "./launch-open-path";
import { openMarkdownFileFromPath, showOpenMarkdownDialog } from "./open-markdown-file";
import {
  registerPreviewAssetProtocol,
  registerPreviewAssetScheme
} from "./preview-asset-protocol";
import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";
import { createEditorTestSessions } from "./editor-test-sessions";
import { createPreferencesService } from "./preferences-service";
import { createFontCatalogService } from "./font-catalog-service";
import { createThemeService } from "./theme-service";
import { createTestRunSessions } from "./test-run-sessions";
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
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL
} from "../shared/test-run-session";
import {
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL
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
  CHECK_FOR_APP_UPDATES_CHANNEL
} from "../shared/app-update";

const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";
const LIST_FONT_FAMILIES_CHANNEL = "yulora:list-font-families";
const LIST_THEMES_CHANNEL = "yulora:list-themes";
const REFRESH_THEMES_CHANNEL = "yulora:refresh-themes";
const AUTO_UPDATE_STARTUP_DELAY_MS = 5000;
registerPreviewAssetScheme({ protocol });
registerPreviewAssetScheme({ protocol });
configureMainProcessRuntime(app, process.env);
const hasSingleInstanceLock = shouldRequestSingleInstanceLock(process.env)
  ? app.requestSingleInstanceLock()
  : true;
const pendingLaunchOpenPaths: string[] = [];

let openEditorWindowForLaunchPath: ((targetPath: string) => void) | null = null;
let runManualAppUpdateCheck: (() => void) | null = null;

function enqueueLaunchOpenPath(targetPath: string): void {
  pendingLaunchOpenPaths.push(targetPath);
}

function handleLaunchOpenFromArgv(argv: string[]): boolean {
  const launchPath = resolveMarkdownLaunchPathFromArgv(argv);

  if (!launchPath) {
    return false;
  }

  if (openEditorWindowForLaunchPath) {
    openEditorWindowForLaunchPath(launchPath);
    return true;
  }

  enqueueLaunchOpenPath(launchPath);
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
    void handleLaunchOpenFromArgv(["yulora", targetPath]);
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
  const themeService = createThemeService({
    userDataDir: app.getPath("userData")
  });
  const fontCatalogService = createFontCatalogService({
    platform: process.platform
  });
  await themeService.listThemes();

  if (initialPreferences.source === "recovered-from-corrupt") {
    console.warn(
      `[yulora] preferences reset to defaults due to corrupt file at ${initialPreferences.corruptBackupPath ?? "(unknown)"}`
    );
  }

  preferencesService.onChange((preferences) => {
    broadcastToWindows(PREFERENCES_CHANGED_EVENT, preferences);
  });

  const appUpdater = createAppUpdater({
    app,
    autoUpdater,
    broadcast: (state) => {
      broadcastToWindows(APP_UPDATE_STATE_EVENT, state);
    },
    dialog,
    logger: {
      info: (message) => console.info(message),
      warn: (message) => console.warn(message),
      error: (message) => console.error(message)
    },
    notify: (notification) => {
      broadcastToWindows(APP_NOTIFICATION_EVENT, notification);
    },
    platform: process.platform,
    runtimeMode
  });
  runManualAppUpdateCheck = () => {
    void appUpdater.checkForUpdates("manual");
  };

  const windowManager = createRuntimeWindowManager({
    runtimeMode,
    preloadPath: path.join(__dirname, "../preload/preload.js"),
    windowIconPath: resolveWindowIconPath(),
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
  const cliRunner = createCliProcessRunner({
    cliScriptPath: path.join(__dirname, "../../dist-cli/cli/bin.js"),
    cwd: path.join(__dirname, "../.."),
    ensureEditorSession: async () => editorTestSessions.ensureSession(),
    dispatchEditorCommand: ({ sessionId, command, signal }) =>
      editorTestSessions.dispatchCommand({
        sessionId,
        command,
        signal
      })
  });
  const editorTestSessions = createEditorTestSessions({
    openEditorWindow: () => windowManager.openEditorWindow()
  });
  const testRunSessions = createTestRunSessions({
    startRun: ({ runId, scenarioId, signal, onEvent, onTerminal }) =>
      cliRunner.startRun({
        runId,
        scenarioId,
        signal,
        onEvent,
        onTerminal
      })
  });

  testRunSessions.onRunEvent((payload) => {
    broadcastToWindows(SCENARIO_RUN_EVENT, payload);
  });
  testRunSessions.onRunTerminal((payload) => {
    broadcastToWindows(SCENARIO_RUN_TERMINAL_EVENT, payload);
  });

  ipcMain.handle(OPEN_MARKDOWN_FILE_CHANNEL, async () => showOpenMarkdownDialog());
  ipcMain.handle(OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, async (_event, input: { targetPath: string }) =>
    openMarkdownFileFromPath(input.targetPath)
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
  ipcMain.handle(OPEN_EDITOR_TEST_WINDOW_CHANNEL, async () => {
    editorTestSessions.ensureSession();
  });
  ipcMain.handle(
    COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
    async (_event, payload: EditorTestCommandResultEnvelope) => {
      editorTestSessions.completeCommand(payload);
    }
  );
  ipcMain.handle(GET_PREFERENCES_CHANNEL, async () => preferencesService.getPreferences());
  ipcMain.handle(UPDATE_PREFERENCES_CHANNEL, async (_event, patch: PreferencesUpdate | undefined) =>
    preferencesService.updatePreferences(patch)
  );
  ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL, async () => fontCatalogService.listFontFamilies());
  ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL, async () => appUpdater.checkForUpdates("manual"));
  ipcMain.handle(LIST_THEMES_CHANNEL, async () => themeService.listThemes());
  ipcMain.handle(REFRESH_THEMES_CHANNEL, async () => themeService.refreshThemes());
  ipcMain.handle(START_SCENARIO_RUN_CHANNEL, async (_event, input: { scenarioId: string }) =>
    testRunSessions.startScenarioRun(input)
  );
  ipcMain.handle(INTERRUPT_SCENARIO_RUN_CHANNEL, async (_event, input: { runId: string }) => {
    testRunSessions.interruptScenarioRun(input);
  });

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
    void appUpdater.checkForUpdates("auto");
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
