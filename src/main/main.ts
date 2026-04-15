import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

import { createApplicationMenuTemplate } from "./application-menu";
import { createCliProcessRunner } from "./cli-process-runner";
import { openMarkdownFileFromPath, showOpenMarkdownDialog } from "./open-markdown-file";
import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";
import { createEditorTestSessions } from "./editor-test-sessions";
import { createTestRunSessions } from "./test-run-sessions";
import { resolveRendererEntry } from "./paths";
import { createRuntimeWindowManager, resolveAppRuntimeMode } from "./runtime-windows";
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
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileInput
} from "../shared/save-markdown-file";

const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";

function dispatchMenuCommand(command: AppMenuCommand): void {
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

app.whenReady().then(() => {
  const windowManager = createRuntimeWindowManager({
    runtimeMode: resolveAppRuntimeMode(process.env),
    preloadPath: path.join(__dirname, "../preload/preload.js"),
    createWindow: (input) =>
      new BrowserWindow({
        ...input,
        show: false
      }),
    getAllWindows: () => BrowserWindow.getAllWindows(),
    loadRenderer
  });
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

  installApplicationMenu();
  windowManager.openPrimaryWindow();

  app.on("activate", () => {
    windowManager.reopenPrimaryWindowIfNeeded();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
