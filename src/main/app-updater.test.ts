import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import type { AppUpdateState } from "../shared/app-update";
import { createAppUpdater } from "./app-updater";

type FakeAutoUpdater = EventEmitter & {
  autoDownload: boolean;
  checkForUpdates: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  quitAndInstall: ReturnType<typeof vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>>;
};

function createFakeAutoUpdater(): FakeAutoUpdater {
  const emitter = new EventEmitter() as FakeAutoUpdater;
  emitter.autoDownload = false;
  emitter.checkForUpdates = vi.fn(async () => undefined);
  emitter.quitAndInstall = vi.fn();
  return emitter;
}

function createDialog(response = 1) {
  return {
    showMessageBox: vi.fn(async () => ({ response }))
  };
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("createAppUpdater", () => {
  it("does not run update checks when the app is not eligible for auto updates", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog();
    const states: AppUpdateState[] = [];
    const notifications: Array<{ kind: string; message: string }> = [];
    const updater = createAppUpdater({
      app: {
        isPackaged: false,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: (state) => states.push(state),
      dialog,
      logger: createLogger(),
      notify: (notification) => notifications.push(notification),
      platform: "win32",
      runtimeMode: "editor"
    });

    await updater.checkForUpdates("auto");

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(states).toEqual([]);
    expect(notifications).toEqual([]);
    expect(updater.getState()).toEqual({ kind: "idle" });
  });

  it("shows an immediate unavailable notification for manual checks when auto updates are not enabled", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog();
    const notifications: Array<{ kind: string; message: string }> = [];
    const updater = createAppUpdater({
      app: {
        isPackaged: false,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: vi.fn(),
      dialog,
      logger: createLogger(),
      notify: (notification) => notifications.push(notification),
      platform: "win32",
      runtimeMode: "editor"
    });

    await updater.checkForUpdates("manual");

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(notifications).toEqual([
      {
        kind: "warning",
        message: "自动更新仅在已安装的 Windows 版本中可用。"
      }
    ]);
  });

  it("starts downloading when an update is available and forwards progress", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog();
    const states: AppUpdateState[] = [];
    const updater = createAppUpdater({
      app: {
        isPackaged: true,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: (state) => states.push(state),
      dialog,
      logger: createLogger(),
      notify: vi.fn(),
      platform: "win32",
      runtimeMode: "editor"
    });

    await updater.checkForUpdates("auto");
    autoUpdater.emit("checking-for-update");
    autoUpdater.emit("update-available", { version: "0.1.1" });
    autoUpdater.emit("download-progress", { percent: 42.4 });

    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      { kind: "checking" },
      { kind: "downloading", version: "0.1.1", percent: 0 },
      { kind: "downloading", version: "0.1.1", percent: 42.4 }
    ]);
    expect(updater.getState()).toEqual({ kind: "downloading", version: "0.1.1", percent: 42.4 });
  });

  it("prompts to install once the update is downloaded and installs on confirmation", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog(0);
    const updater = createAppUpdater({
      app: {
        isPackaged: true,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: vi.fn(),
      dialog,
      logger: createLogger(),
      notify: vi.fn(),
      platform: "win32",
      runtimeMode: "editor"
    });

    autoUpdater.emit("update-available", { version: "0.1.1" });
    autoUpdater.emit("update-downloaded", { version: "0.1.1" });
    await Promise.resolve();

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(updater.getState()).toEqual({ kind: "downloaded", version: "0.1.1" });
  });

  it("shows a latest-version dialog only for manual checks", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog();
    const notifications: Array<{ kind: string; message: string }> = [];
    const updater = createAppUpdater({
      app: {
        isPackaged: true,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: vi.fn(),
      dialog,
      logger: createLogger(),
      notify: (notification) => notifications.push(notification),
      platform: "win32",
      runtimeMode: "editor"
    });

    await updater.checkForUpdates("manual");

    expect(notifications).toEqual([
      {
        kind: "loading",
        message: "正在检查更新…"
      }
    ]);

    autoUpdater.emit("update-not-available", { version: "0.1.0" });
    await Promise.resolve();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(notifications).toEqual([
      {
        kind: "loading",
        message: "正在检查更新…"
      },
      {
        kind: "info",
        message: "当前已是最新版本。"
      }
    ]);
    expect(updater.getState()).toEqual({ kind: "idle" });
  });

  it("shows an error dialog only for manual checks", async () => {
    const autoUpdater = createFakeAutoUpdater();
    const dialog = createDialog();
    const notifications: Array<{ kind: string; message: string }> = [];
    const updater = createAppUpdater({
      app: {
        isPackaged: true,
        getVersion: () => "0.1.0"
      },
      autoUpdater,
      broadcast: vi.fn(),
      dialog,
      logger: createLogger(),
      notify: (notification) => notifications.push(notification),
      platform: "win32",
      runtimeMode: "editor"
    });

    await updater.checkForUpdates("manual");

    expect(notifications).toEqual([
      {
        kind: "loading",
        message: "正在检查更新…"
      }
    ]);

    autoUpdater.emit("error", new Error("network down"));
    await Promise.resolve();

    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(notifications).toEqual([
      {
        kind: "loading",
        message: "正在检查更新…"
      },
      {
        kind: "error",
        message: "检查更新失败：network down"
      }
    ]);
    expect(updater.getState()).toEqual({ kind: "error", message: "network down" });
  });
});
