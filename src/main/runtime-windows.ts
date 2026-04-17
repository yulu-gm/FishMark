import { formatStartupOpenPathArgument } from "./launch-open-path";

export const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";
export { formatStartupOpenPathArgument } from "./launch-open-path";

export type RuntimeMode = "editor" | "test-workbench";

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
  webPreferences: {
    preload: string;
    contextIsolation: true;
    nodeIntegration: false;
    additionalArguments: string[];
  };
};

export function resolveAppRuntimeMode(env: NodeJS.ProcessEnv): RuntimeMode {
  return env.YULORA_START_MODE === "test-workbench" ? "test-workbench" : "editor";
}

export function resolveWindowRuntimeMode(argv: string[]): RuntimeMode {
  const runtimeArgument = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX));
  const runtimeValue = runtimeArgument?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);

  return runtimeValue === "test-workbench" ? "test-workbench" : "editor";
}

export function createRuntimeWindowManager<TWindow extends WindowLike>(input: {
  runtimeMode: RuntimeMode;
  preloadPath: string;
  windowIconPath?: string;
  showStrategy?: "ready-to-show" | "immediate";
  createWindow: (input: CreateWindowInput) => TWindow;
  getAllWindows: () => TWindow[];
  loadRenderer: (window: TWindow, runtimeMode: RuntimeMode) => void;
}) {
  const {
    runtimeMode,
    preloadPath,
    windowIconPath,
    showStrategy = "ready-to-show",
    createWindow,
    getAllWindows,
    loadRenderer
  } = input;

  function openWindow(
    nextRuntimeMode: RuntimeMode,
    options: {
      startupOpenPath?: string;
    } = {}
  ): TWindow {
    const additionalArguments = [`${RUNTIME_MODE_ARGUMENT_PREFIX}${nextRuntimeMode}`];

    if (options.startupOpenPath) {
      additionalArguments.push(formatStartupOpenPathArgument(options.startupOpenPath));
    }

    const window = createWindow({
      ...(nextRuntimeMode === "test-workbench"
        ? {
            title: "Yulora Test Workbench",
            width: 1400,
            height: 900,
            minWidth: 1100,
            minHeight: 700
          }
        : {
            title: "Yulora",
            width: 1200,
            height: 800,
            minWidth: 900,
            minHeight: 600
          }),
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
    openEditorWindow(options?: { startupOpenPath?: string }) {
      return openWindow("editor", options);
    },
    reopenPrimaryWindowIfNeeded() {
      if (getAllWindows().length === 0) {
        openWindow(runtimeMode);
      }
    }
  };
}
