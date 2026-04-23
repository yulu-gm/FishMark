import { formatStartupOpenPathArgument } from "./launch-open-path";

export const RUNTIME_MODE_ARGUMENT_PREFIX = "--fishmark-runtime-mode=";
export const PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX = "--fishmark-preload-bridge-mode=";
export { formatStartupOpenPathArgument } from "./launch-open-path";

export type RuntimeMode = "editor" | "test-workbench";
export type PreloadBridgeMode = "product" | "editor-test" | "test-workbench";

type WindowLike = {
  once: (event: "ready-to-show", callback: () => void) => unknown;
  show: () => unknown;
  webContents: {
    on: (event: "will-navigate", callback: (event: { preventDefault: () => void }, url: string) => void) => unknown;
    setWindowOpenHandler: (handler: (details: unknown) => { action: "deny" | "allow" }) => unknown;
  };
};

type CreateWindowInput = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  title: string;
  icon?: string;
  frame?: boolean;
  titleBarOverlay?: boolean;
  titleBarStyle?: "default" | "hidden" | "hiddenInset";
  webPreferences: {
    preload: string;
    contextIsolation: true;
    nodeIntegration: false;
    additionalArguments: string[];
  };
};

export function resolveAppRuntimeMode(env: NodeJS.ProcessEnv): RuntimeMode {
  return env.FISHMARK_START_MODE === "test-workbench" ? "test-workbench" : "editor";
}

export function resolveWindowRuntimeMode(argv: string[]): RuntimeMode {
  const runtimeArgument = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX));
  const runtimeValue = runtimeArgument?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);

  return runtimeValue === "test-workbench" ? "test-workbench" : "editor";
}

export function createRuntimeWindowManager<TWindow extends WindowLike>(input: {
  runtimeMode: RuntimeMode;
  platform?: NodeJS.Platform;
  preloadPath: string;
  windowIconPath?: string;
  showStrategy?: "ready-to-show" | "immediate";
  createWindow: (input: CreateWindowInput) => TWindow;
  getAllWindows: () => TWindow[];
  loadRenderer: (window: TWindow, runtimeMode: RuntimeMode) => void;
}) {
  const {
    runtimeMode,
    platform = process.platform,
    preloadPath,
    windowIconPath,
    showStrategy = "ready-to-show",
    createWindow,
    getAllWindows,
    loadRenderer
  } = input;

  function resolveEditorWindowChrome(): Partial<CreateWindowInput> {
    if (platform === "darwin") {
      return {
        titleBarStyle: "hiddenInset"
      };
    }

    return {};
  }

  function openWindow(
    nextRuntimeMode: RuntimeMode,
    options: {
      startupOpenPath?: string;
      preloadBridgeMode?: PreloadBridgeMode;
    } = {}
  ): TWindow {
    const additionalArguments = [`${RUNTIME_MODE_ARGUMENT_PREFIX}${nextRuntimeMode}`];
    const preloadBridgeMode =
      options.preloadBridgeMode ?? (nextRuntimeMode === "test-workbench" ? "test-workbench" : "product");

    if (options.startupOpenPath) {
      additionalArguments.push(formatStartupOpenPathArgument(options.startupOpenPath));
    }

    if (preloadBridgeMode !== "product") {
      additionalArguments.push(`${PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX}${preloadBridgeMode}`);
    }

    const window = createWindow({
      ...(nextRuntimeMode === "test-workbench"
        ? {
            title: "FishMark Test Workbench",
            width: 1400,
            height: 900,
            minWidth: 1100,
            minHeight: 700
          }
        : {
            title: "FishMark",
            width: 1200,
            height: 800,
            minWidth: 900,
            minHeight: 600
          }),
      ...(nextRuntimeMode === "editor" ? resolveEditorWindowChrome() : {}),
      ...(windowIconPath
        ? {
            icon: windowIconPath
          }
        : {}),
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments
      }
    });

    window.webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({
      action: "deny"
    }));

    loadRenderer(window, nextRuntimeMode);
    let hasShown = false;
    const showWindow = () => {
      if (hasShown) {
        return;
      }

      hasShown = true;
      window.show();
    };

    window.once("ready-to-show", showWindow);

    if (showStrategy === "immediate" && nextRuntimeMode === "editor") {
      showWindow();
    }

    return window;
  }

  return {
    openPrimaryWindow(options?: { startupOpenPath?: string }) {
      return openWindow(runtimeMode, options);
    },
    openEditorWindow(options?: { startupOpenPath?: string; preloadBridgeMode?: PreloadBridgeMode }) {
      return openWindow("editor", options);
    },
    reopenPrimaryWindowIfNeeded() {
      if (getAllWindows().length === 0) {
        openWindow(runtimeMode);
      }
    }
  };
}
