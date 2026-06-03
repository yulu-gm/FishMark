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

type ReleaseNoteInfoLike = {
  note?: unknown;
  version?: unknown;
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
const MAX_RELEASE_NOTES_DETAIL_LENGTH = 2000;

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanMarkdownReleaseNotes(markdown: string): string | null {
  const cleaned = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/<\/?[^>]+>/g, "")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/`([^`]+)`/g, "$1")
        .trimEnd()
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length === 0) {
    return null;
  }

  if (cleaned.length <= MAX_RELEASE_NOTES_DETAIL_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_RELEASE_NOTES_DETAIL_LENGTH).trimEnd()}\n...`;
}

function resolveReleaseNoteEntryText(entry: ReleaseNoteInfoLike): string | null {
  if (typeof entry.note !== "string") {
    return null;
  }

  const note = cleanMarkdownReleaseNotes(entry.note);

  if (!note) {
    return null;
  }

  if (typeof entry.version === "string" && entry.version.trim().length > 0) {
    return `${entry.version.trim()}\n${note}`;
  }

  return note;
}

function resolveReleaseNotesText(info: unknown): string | null {
  if (!isRecord(info) || !("releaseNotes" in info)) {
    return null;
  }

  const releaseNotes = info.releaseNotes;

  if (typeof releaseNotes === "string") {
    return cleanMarkdownReleaseNotes(releaseNotes);
  }

  if (Array.isArray(releaseNotes)) {
    const notes = releaseNotes
      .map((entry) => (isRecord(entry) ? resolveReleaseNoteEntryText(entry) : null))
      .filter((entry): entry is string => entry !== null);

    if (notes.length === 0) {
      return null;
    }

    return cleanMarkdownReleaseNotes(notes.join("\n\n"));
  }

  return null;
}

function createInstallDialogDetail(version: string, releaseNotes: string | null): string {
  const baseDetail = `FishMark ${version} \u5df2\u51c6\u5907\u597d\u5b89\u88c5\u3002`;

  if (!releaseNotes) {
    return baseDetail;
  }

  const releaseNotesHasHeading = /^(?:\u672c\u6b21\u66f4\u65b0|\u66f4\u65b0\u5185\u5bb9)\b/m.test(
    releaseNotes
  );
  const releaseNotesDetail = releaseNotesHasHeading
    ? releaseNotes
    : `\u672c\u6b21\u66f4\u65b0\uff1a\n${releaseNotes}`;

  return `${baseDetail}\n\n${releaseNotesDetail}`;
}

export function createAppUpdater(options: CreateAppUpdaterOptions): AppUpdaterController {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const isEnabled =
    options.platform === "win32" && options.app.isPackaged && options.runtimeMode === "editor";
  let state: AppUpdateState = { kind: "idle" };
  let lastCheckSource: CheckSource = "auto";
  let activeVersion = options.app.getVersion();
  let activeReleaseNotes: string | null = null;
  let isChecking = false;

  const setState = (nextState: AppUpdateState): void => {
    state = nextState;
    options.broadcast(nextState);
  };

  const handleUpdateFailure = (error: unknown): void => {
    const message = resolveErrorMessage(error);
    isChecking = false;
    logger.error(`[fishmark] auto update failed: ${message}`);
    setState({ kind: "error", message });

    if (lastCheckSource === "manual") {
      options.notify({
        kind: "error",
        message: `\u68c0\u67e5\u66f4\u65b0\u5931\u8d25\uff1a${message}`
      });
    }
  };

  const showInstallDialog = async (): Promise<void> => {
    const result = await options.dialog.showMessageBox({
      type: "info",
      buttons: ["\u7acb\u5373\u91cd\u542f\u66f4\u65b0", "\u7a0d\u540e"],
      defaultId: 0,
      cancelId: 1,
      title: "\u5b89\u88c5\u66f4\u65b0",
      message: "\u65b0\u7248\u672c\u5df2\u4e0b\u8f7d\u5b8c\u6210\u3002",
      detail: createInstallDialogDetail(activeVersion, activeReleaseNotes)
    });

    if (result.response === 0) {
      options.autoUpdater.quitAndInstall(true, true);
    }
  };

  if (isEnabled) {
    options.autoUpdater.autoDownload = true;

    options.autoUpdater.on("checking-for-update", () => {
      logger.info("[fishmark] checking for updates");
      setState({ kind: "checking" });
    });

    options.autoUpdater.on("update-available", (info) => {
      const nextVersion =
        typeof info === "object" && info !== null && "version" in info && typeof info.version === "string"
          ? info.version
          : options.app.getVersion();
      activeVersion = nextVersion;
      activeReleaseNotes = resolveReleaseNotesText(info);
      logger.info(`[fishmark] update available: ${nextVersion}`);
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
      logger.info("[fishmark] no update available");
      isChecking = false;
      setState({ kind: "idle" });

      if (lastCheckSource === "manual") {
        options.notify({
          kind: "info",
          message: "\u5f53\u524d\u5df2\u662f\u6700\u65b0\u7248\u672c\u3002"
        });
      }
    });

    options.autoUpdater.on("update-downloaded", (info) => {
      const nextVersion =
        typeof info === "object" && info !== null && "version" in info && typeof info.version === "string"
          ? info.version
          : activeVersion;
      activeVersion = nextVersion;
      activeReleaseNotes = resolveReleaseNotesText(info) ?? activeReleaseNotes;
      isChecking = false;
      logger.info(`[fishmark] update downloaded: ${nextVersion}`);
      setState({ kind: "downloaded", version: nextVersion });
      void showInstallDialog();
    });

    options.autoUpdater.on("error", (error) => {
      handleUpdateFailure(error);
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
            message: "\u81ea\u52a8\u66f4\u65b0\u4ec5\u5728\u5df2\u5b89\u88c5\u7684 Windows \u7248\u672c\u4e2d\u53ef\u7528\u3002"
          });
        }

        return;
      }

      lastCheckSource = source;
      isChecking = true;

      if (source === "manual") {
        options.notify({
          kind: "loading",
          message: "\u6b63\u5728\u68c0\u67e5\u66f4\u65b0\u2026"
        });
      }

      try {
        await options.autoUpdater.checkForUpdates();
      } catch (error) {
        if (isChecking) {
          handleUpdateFailure(error);
        }
      }
    },
    getState(): AppUpdateState {
      return state;
    }
  };
}
