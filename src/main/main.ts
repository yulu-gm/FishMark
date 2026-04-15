import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

import { createApplicationMenuTemplate } from "./application-menu";
import { showOpenMarkdownDialog } from "./open-markdown-file";
import { saveMarkdownFileToPath, showSaveMarkdownDialog } from "./save-markdown-file";
import { resolveRendererEntry } from "./paths";
import { OPEN_MARKDOWN_FILE_CHANNEL } from "../shared/open-markdown-file";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileInput
} from "../shared/save-markdown-file";

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererEntry = resolveRendererEntry(
    path.join(__dirname, "../../dist"),
    process.env.VITE_DEV_SERVER_URL
  );

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(rendererEntry);
  } else {
    void window.loadFile(rendererEntry);
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  return window;
}

function dispatchMenuCommand(command: AppMenuCommand): void {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

  targetWindow?.webContents.send(APP_MENU_COMMAND_EVENT, command);
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate({ dispatchCommand: dispatchMenuCommand });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template as MenuItemConstructorOptions[]));
}

app.whenReady().then(() => {
  ipcMain.handle(OPEN_MARKDOWN_FILE_CHANNEL, async () => showOpenMarkdownDialog());
  ipcMain.handle(SAVE_MARKDOWN_FILE_CHANNEL, async (_event, input: SaveMarkdownFileInput) =>
    saveMarkdownFileToPath(input)
  );
  ipcMain.handle(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (_event, input: SaveMarkdownFileAsInput) =>
    showSaveMarkdownDialog(input)
  );

  installApplicationMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
