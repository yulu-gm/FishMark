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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveAutoUpdaterModule(moduleValue: unknown): AutoUpdaterLike {
  if (isRecord(moduleValue) && "autoUpdater" in moduleValue) {
    const autoUpdater = moduleValue.autoUpdater;

    if (isRecord(autoUpdater)) {
      return autoUpdater as AutoUpdaterLike;
    }
  }

  if (isRecord(moduleValue) && "default" in moduleValue && isRecord(moduleValue.default)) {
    const defaultExport = moduleValue.default;

    if ("autoUpdater" in defaultExport && isRecord(defaultExport.autoUpdater)) {
      return defaultExport.autoUpdater as AutoUpdaterLike;
    }
  }

  throw new Error("electron-updater module did not expose autoUpdater");
}
