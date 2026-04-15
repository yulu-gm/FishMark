import { formatStartupOpenPathArgument } from "./launch-open-path";

export const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";
export { formatStartupOpenPathArgument } from "./launch-open-path";

export type RuntimeMode = "editor" | "test-workbench";

type WindowLike = {
  once: (event: "ready-to-show", callback: () => void) => unknown;
  show: () => unknown;
};

type CreateWindowInput = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  title: string;
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
  createWindow: (input: CreateWindowInput) => TWindow;
  getAllWindows: () => TWindow[];
  loadRenderer: (window: TWindow, runtimeMode: RuntimeMode) => void;
}) {
  const { runtimeMode, preloadPath, createWindow, getAllWindows, loadRenderer } = input;

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
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments
      }
    });

    loadRenderer(window, nextRuntimeMode);
    window.once("ready-to-show", () => {
      window.show();
    });

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
