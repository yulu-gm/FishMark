import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeWindowManager,
  resolveAppRuntimeMode,
  RUNTIME_MODE_ARGUMENT_PREFIX,
  PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX,
  formatStartupOpenPathArgument,
  type RuntimeMode
} from "./runtime-windows";

type TestWindow = {
  loadURL: () => void;
  loadFile: () => void;
  once: (event: "ready-to-show", callback: () => void) => void;
  show: () => void;
  webContents: {
    on: (event: "will-navigate", callback: (event: { preventDefault: () => void }, url: string) => void) => void;
    setWindowOpenHandler: (handler: (details: unknown) => { action: "deny" | "allow" }) => {
      action: "deny" | "allow";
    };
  };
};

describe("resolveAppRuntimeMode", () => {
  it("defaults to editor mode", () => {
    expect(resolveAppRuntimeMode({})).toBe("editor");
  });

  it("starts the test workbench when requested by env", () => {
    expect(resolveAppRuntimeMode({ FISHMARK_START_MODE: "test-workbench" })).toBe("test-workbench");
  });
});

describe("createRuntimeWindowManager", () => {
  it("creates the test workbench as the primary window in test mode", () => {
    const harness = createWindowHarness("test-workbench");

    harness.manager.openPrimaryWindow();

    expect(harness.createWindow).toHaveBeenCalledTimes(1);
    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FishMark Test Workbench",
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        webPreferences: expect.objectContaining({
          preload: "D:/app/dist-electron/preload/preload.js",
          contextIsolation: true,
          nodeIntegration: false,
          additionalArguments: [
            `${RUNTIME_MODE_ARGUMENT_PREFIX}test-workbench`,
            `${PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX}test-workbench`
          ]
        })
      })
    );
    expect(harness.loadRenderer).toHaveBeenCalledWith(harness.window, "test-workbench");
  });

  it("passes the configured window icon path into BrowserWindow creation", () => {
    const harness = createWindowHarness("editor", {
      windowIconPath: "C:/Program Files/FishMark/resources/icons/icon.ico"
    });

    harness.manager.openPrimaryWindow();

    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: "C:/Program Files/FishMark/resources/icons/icon.ico"
      })
    );
  });

  it("passes the startup markdown path through additional arguments", () => {
    const harness = createWindowHarness("editor");

    harness.manager.openPrimaryWindow({
      startupOpenPath: "C:/notes/startup.md"
    });

    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          additionalArguments: [
            `${RUNTIME_MODE_ARGUMENT_PREFIX}editor`,
            formatStartupOpenPathArgument("C:/notes/startup.md")
          ]
        })
      })
    );
  });

  it("creates an editor window when the workbench asks to open a test editor", () => {
    const harness = createWindowHarness("test-workbench");

    harness.manager.openEditorWindow({
      preloadBridgeMode: "editor-test"
    });

    expect(harness.createWindow).toHaveBeenCalledTimes(1);
    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FishMark",
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: expect.objectContaining({
          additionalArguments: [
            `${RUNTIME_MODE_ARGUMENT_PREFIX}editor`,
            `${PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX}editor-test`
          ]
        })
      })
    );
    expect(harness.loadRenderer).toHaveBeenCalledWith(harness.window, "editor");
  });

  it("configures macOS editor windows for the controlled title bar host", () => {
    const harness = createWindowHarness("editor", {
      platform: "darwin"
    });

    harness.manager.openPrimaryWindow();

    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        titleBarStyle: "hiddenInset"
      })
    );
  });

  it("keeps Windows editor windows on native chrome until controlled actions exist", () => {
    const harness = createWindowHarness("editor", {
      platform: "win32"
    });

    harness.manager.openPrimaryWindow();

    expect(harness.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "FishMark",
        width: 1200,
        height: 800
      })
    );
    expect(harness.createWindow.mock.calls[0]?.[0]).not.toHaveProperty("frame");
    expect(harness.createWindow.mock.calls[0]?.[0]).not.toHaveProperty("titleBarStyle");
    expect(harness.createWindow.mock.calls[0]?.[0]).not.toHaveProperty("titleBarOverlay");
  });

  it("reopens the primary window only when every window has been closed", () => {
    const harness = createWindowHarness("test-workbench");

    harness.getAllWindows.mockReturnValue([harness.window]);
    harness.manager.reopenPrimaryWindowIfNeeded();

    expect(harness.createWindow).not.toHaveBeenCalled();

    harness.getAllWindows.mockReturnValue([]);
    harness.manager.reopenPrimaryWindowIfNeeded();

    expect(harness.createWindow).toHaveBeenCalledTimes(1);
  });

  it("shows editor windows immediately when configured for immediate display", () => {
    const harness = createWindowHarness("editor", {
      showStrategy: "immediate"
    });

    harness.manager.openPrimaryWindow();

    expect(harness.window.show).toHaveBeenCalledTimes(1);
    expect(harness.readyToShowCallback).not.toBeNull();
  });

  it("keeps workbench windows gated on ready-to-show when configured for deferred display", () => {
    const harness = createWindowHarness("test-workbench", {
      showStrategy: "ready-to-show"
    });

    harness.manager.openPrimaryWindow();

    expect(harness.window.show).not.toHaveBeenCalled();
    expect(harness.readyToShowCallback).not.toBeNull();

    harness.readyToShowCallback?.();

    expect(harness.window.show).toHaveBeenCalledTimes(1);
  });

  it("guards editor windows against unexpected browser-style navigations", () => {
    const harness = createWindowHarness("editor");

    harness.manager.openPrimaryWindow();

    expect(harness.window.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    expect(harness.window.webContents.on).toHaveBeenCalledWith("will-navigate", expect.any(Function));

    const preventDefault = vi.fn();
    harness.willNavigateHandler?.(
      {
        preventDefault
      },
      "file:///C:/notes/dropped.md"
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(harness.window.webContents.setWindowOpenHandler).toHaveReturnedWith({
      action: "deny"
    });
  });
});

function createWindowHarness(
  runtimeMode: RuntimeMode,
  options?: {
    windowIconPath?: string;
    platform?: NodeJS.Platform;
    showStrategy?: "ready-to-show" | "immediate";
  }
) {
  let readyToShowCallback: (() => void) | null = null;
  let willNavigateHandler:
    | ((event: { preventDefault: () => void }, url: string) => void)
    | null = null;
  const setWindowOpenHandler = vi.fn<
    (handler: (details: unknown) => { action: "deny" | "allow" }) => { action: "deny" | "allow" }
  >((handler) => handler({}));
  const webContents = {
    on: vi.fn<
      (event: "will-navigate", callback: (event: { preventDefault: () => void }, url: string) => void) => void
    >((event, callback) => {
      if (event === "will-navigate") {
        willNavigateHandler = callback;
      }
    }),
    setWindowOpenHandler
  };
  const window: TestWindow = {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    once: vi.fn((event: "ready-to-show", callback: () => void) => {
      if (event === "ready-to-show") {
        readyToShowCallback = callback;
      }
    }),
    show: vi.fn(),
    webContents
  };

  const createWindow = vi.fn<(_: unknown) => TestWindow>(() => window);
  const getAllWindows = vi.fn<() => TestWindow[]>(() => []);
  const loadRenderer = vi.fn();

  const manager = createRuntimeWindowManager<TestWindow>({
    runtimeMode,
    platform: options?.platform,
    preloadPath: "D:/app/dist-electron/preload/preload.js",
    windowIconPath: options?.windowIconPath,
    showStrategy: options?.showStrategy,
    createWindow,
    getAllWindows,
    loadRenderer
  });

  return {
    manager,
    window,
    get readyToShowCallback() {
      return readyToShowCallback;
    },
    get willNavigateHandler() {
      return willNavigateHandler;
    },
    createWindow,
    getAllWindows,
    loadRenderer
  };
}
