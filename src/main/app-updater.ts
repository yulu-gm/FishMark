import type { AppNotification, AppUpdateState } from "../shared/app-update";

type RuntimeMode = "editor" | "test-workbench";
type CheckSource = "auto" | "manual";

type AppLike = {
  isPackaged: boolean;
  getVersion: () => string;
};

type DialogLike = {
  showMessageBox: (options: {
    type: "info" | "error";
    buttons: string[];
    title: string;
    message: string;
    detail?: string;
    cancelId?: number;
    defaultId?: number;
  }) => Promise<{ response: number }>;
};

type AutoUpdaterLike = {
  autoDownload: boolean;
  checkForUpdates: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (
    event:
      | "checking-for-update"
      | "update-available"
      | "download-progress"
      | "update-not-available"
      | "update-downloaded"
      | "error",
    listener: (...args: unknown[]) => void
  ) => unknown;
};

type LoggerLike = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type CreateAppUpdaterOptions = {
  app: AppLike;
  autoUpdater: AutoUpdaterLike;
  broadcast: (state: AppUpdateState) => void;
  dialog: DialogLike;
  logger?: LoggerLike;
  notify: (notification: AppNotification) => void;
  platform: NodeJS.Platform;
  runtimeMode: RuntimeMode;
};

export type AppUpdaterController = {
  checkForUpdates: (source: CheckSource) => Promise<void>;
  getState: () => AppUpdateState;
};

const DEFAULT_LOGGER: LoggerLike = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

export function createAppUpdater(options: CreateAppUpdaterOptions): AppUpdaterController {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const isEnabled =
    options.platform === "win32" && options.app.isPackaged && options.runtimeMode === "editor";
  let state: AppUpdateState = { kind: "idle" };
  let lastCheckSource: CheckSource = "auto";
  let activeVersion = options.app.getVersion();
  let isChecking = false;

  const setState = (nextState: AppUpdateState): void => {
    state = nextState;
    options.broadcast(nextState);
  };

  const showInstallDialog = async (): Promise<void> => {
    const result = await options.dialog.showMessageBox({
      type: "info",
      buttons: ["立即重启更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
      title: "安装更新",
      message: "新版本已下载完成。",
      detail: `Yulora ${activeVersion} 已准备好安装。`
    });

    if (result.response === 0) {
      options.autoUpdater.quitAndInstall(true, true);
    }
  };

  if (isEnabled) {
    options.autoUpdater.autoDownload = true;

    options.autoUpdater.on("checking-for-update", () => {
      logger.info("[yulora] checking for updates");
      setState({ kind: "checking" });
    });

    options.autoUpdater.on("update-available", (info) => {
      const nextVersion =
        typeof info === "object" && info !== null && "version" in info && typeof info.version === "string"
          ? info.version
          : options.app.getVersion();
      activeVersion = nextVersion;
      logger.info(`[yulora] update available: ${nextVersion}`);
      setState({ kind: "downloading", version: nextVersion, percent: 0 });
    });

    options.autoUpdater.on("download-progress", (progress) => {
      const percent =
        typeof progress === "object" &&
        progress !== null &&
        "percent" in progress &&
        typeof progress.percent === "number"
          ? progress.percent
          : 0;
      setState({ kind: "downloading", version: activeVersion, percent });
    });

    options.autoUpdater.on("update-not-available", () => {
      logger.info("[yulora] no update available");
      isChecking = false;
      setState({ kind: "idle" });

      if (lastCheckSource === "manual") {
        options.notify({
          kind: "info",
          message: "当前已是最新版本。"
        });
      }
    });

    options.autoUpdater.on("update-downloaded", (info) => {
      const nextVersion =
        typeof info === "object" && info !== null && "version" in info && typeof info.version === "string"
          ? info.version
          : activeVersion;
      activeVersion = nextVersion;
      isChecking = false;
      logger.info(`[yulora] update downloaded: ${nextVersion}`);
      setState({ kind: "downloaded", version: nextVersion });
      void showInstallDialog();
    });

    options.autoUpdater.on("error", (error) => {
      const message = resolveErrorMessage(error);
      isChecking = false;
      logger.error(`[yulora] auto update failed: ${message}`);
      setState({ kind: "error", message });

      if (lastCheckSource === "manual") {
        options.notify({
          kind: "error",
          message: `检查更新失败：${message}`
        });
      }
    });
  }

  return {
    async checkForUpdates(source: CheckSource): Promise<void> {
      if (isChecking) {
        return;
      }

      if (!isEnabled) {
        if (source === "manual") {
          options.notify({
            kind: "warning",
            message: "自动更新仅在已安装的 Windows 版本中可用。"
          });
        }

        return;
      }

      lastCheckSource = source;
      isChecking = true;

      if (source === "manual") {
        options.notify({
          kind: "loading",
          message: "正在检查更新…"
        });
      }

      await options.autoUpdater.checkForUpdates();
    },
    getState(): AppUpdateState {
      return state;
    }
  };
}
