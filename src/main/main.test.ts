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
    expect(mainSource).toContain('workspaceService.getTabPath(input.tabId)');
    expect(mainSource).toContain('externalFileWatchService.syncDocumentPath(');
  });

  it("wires the tabbed workspace service and its IPC handlers", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('import { createWorkspaceApplication } from "./workspace-application"');
    expect(mainSource).toContain('import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator"');
    expect(mainSource).toContain('import { createWorkspaceService } from "./workspace-service"');
    expect(mainSource).toContain("GET_WORKSPACE_SNAPSHOT_CHANNEL");
    expect(mainSource).toContain("CREATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("OPEN_WORKSPACE_FILE_CHANNEL");
    expect(mainSource).toContain("OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL");
    expect(mainSource).toContain("ACTIVATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("CLOSE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL");
    expect(mainSource).toContain("const workspaceService = createWorkspaceService()");
    expect(mainSource).toContain("const workspaceApplication = createWorkspaceApplication({");
    expect(mainSource).toContain("const workspaceCloseCoordinator = createWorkspaceCloseCoordinator({");
    expect(mainSource).toContain("ipcMain.handle(GET_WORKSPACE_SNAPSHOT_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(CREATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(OPEN_WORKSPACE_FILE_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(ACTIVATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(CLOSE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL");
    expect(mainSource).toContain('ownerWindow.on("close", (event) => {');
    expect(mainSource).toContain("workspaceCloseCoordinator.confirmWindowClose(windowId)");
    expect(mainSource).toContain("workspaceCloseCoordinator.closeTab(input.tabId)");
    expect(mainSource).toContain("workspaceApplication.updateDraft(input)");
    expect(mainSource).toContain("const result = await workspaceApplication.saveTab(input)");
  });

  it("keeps File > New Window as an explicit main-process window action", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('if (command === "new-editor-window") {');
    expect(mainSource).toContain("openEmptyEditorWindow?.();");
    expect(mainSource).toContain("targetWindow?.webContents.send(APP_MENU_COMMAND_EVENT, command)");
  });

  it("routes external opens back into the workspace flow and keeps dropped files in place", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain("OPEN_WORKSPACE_PATH_EVENT");
    expect(mainSource).toContain("window.webContents.send(OPEN_WORKSPACE_PATH_EVENT");
    expect(mainSource).toContain('disposition: "open-in-place"');
    expect(mainSource).not.toContain('disposition: "opened-in-new-window"');
  });

  it("only initializes the scenario runner stack in test-workbench mode", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('if (!app.isPackaged && runtimeMode === "test-workbench") {');
    expect(mainSource).toContain('import("./cli-process-runner.js")');
    expect(mainSource).toContain('import("./editor-test-sessions.js")');
    expect(mainSource).toContain('import("./test-run-sessions.js")');
    expect(mainSource).toContain('windowManager.openEditorWindow({ preloadBridgeMode: "editor-test" })');
  });
});
