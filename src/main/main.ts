import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

import { createApplicationMenuTemplate } from "./application-menu";
import { showOpenMarkdownDialog } from "./open-markdown-file";
import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";
import { resolveRendererEntry } from "./paths";
import { createRuntimeWindowManager, resolveAppRuntimeMode } from "./runtime-windows";
import { OPEN_MARKDOWN_FILE_CHANNEL } from "../shared/open-markdown-file";
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

  ipcMain.handle(OPEN_MARKDOWN_FILE_CHANNEL, async () => showOpenMarkdownDialog());
  ipcMain.handle(SAVE_MARKDOWN_FILE_CHANNEL, async (_event, input: SaveMarkdownFileInput) =>
    saveMarkdownFileToPath(input)
  );
  ipcMain.handle(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (_event, input: SaveMarkdownFileAsInput) =>
    showSaveMarkdownDialog(input)
  );
  ipcMain.handle(OPEN_EDITOR_TEST_WINDOW_CHANNEL, async () => {
    windowManager.openEditorWindow();
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
