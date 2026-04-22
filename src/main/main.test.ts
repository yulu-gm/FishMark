import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("main process window wiring", () => {
  it("passes the resolved window icon path into the runtime window manager", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain("windowIconPath: resolveWindowIconPath()");
  });

  it("configures a dev-specific runtime identity before deciding whether to request the single-instance lock", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('configureMainProcessRuntime(app, process.env)');
    expect(mainSource).toContain('shouldRequestSingleInstanceLock(process.env)');
  });

  it("wires the app updater service, update IPC, and startup auto-check", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('import { createAppUpdateCheckRunner } from "./app-update-check-runner"');
    expect(mainSource).toContain('import("electron-updater")');
    expect(mainSource).toContain('createAppUpdater({');
    expect(mainSource).toContain('const runAppUpdateCheck = createAppUpdateCheckRunner({');
    expect(mainSource).toContain('ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL');
    expect(mainSource).toContain('broadcastToWindows(APP_UPDATE_STATE_EVENT, state)');
    expect(mainSource).toContain('setTimeout(() => {');
    expect(mainSource).toContain('void runAppUpdateCheck("manual")');
    expect(mainSource).toContain('void runAppUpdateCheck("auto")');
    expect(mainSource).toContain('if (command === "check-for-updates") {');
    expect(mainSource).not.toContain('import { autoUpdater } from "electron-updater"');
  });

  it("registers IPC handlers for fonts, preferences, and themes", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('import { createExternalFileWatchService } from "./external-file-watch-service"');
    expect(mainSource).toContain('ipcMain.handle(GET_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(UPDATE_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('SYNC_WATCHED_MARKDOWN_FILE_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_THEME_PACKAGES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(REFRESH_THEME_PACKAGES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(OPEN_THEMES_DIRECTORY_CHANNEL');
    expect(mainSource).toContain('externalFileWatchService.syncDocumentPath(event.sender');
  });

  it("only initializes the scenario runner stack in test-workbench mode", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('if (!app.isPackaged && runtimeMode === "test-workbench") {');
    expect(mainSource).toContain('import("./cli-process-runner.js")');
    expect(mainSource).toContain('import("./editor-test-sessions.js")');
    expect(mainSource).toContain('import("./test-run-sessions.js")');
  });
});
