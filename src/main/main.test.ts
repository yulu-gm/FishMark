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

    expect(mainSource).toContain('createAppUpdater({');
    expect(mainSource).toContain('ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL');
    expect(mainSource).toContain('broadcastToWindows(APP_UPDATE_STATE_EVENT, state)');
    expect(mainSource).toContain('setTimeout(() => {');
    expect(mainSource).toContain('void appUpdater.checkForUpdates("auto")');
    expect(mainSource).toContain('if (command === "check-for-updates") {');
  });

  it("registers IPC handlers for fonts, preferences, and themes", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toContain('ipcMain.handle(GET_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(UPDATE_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_THEMES_CHANNEL');
  });
});
