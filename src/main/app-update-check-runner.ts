import type { AppNotification } from "../shared/app-update";

type CheckSource = "auto" | "manual";

type AppUpdaterController = {
  checkForUpdates: (source: CheckSource) => Promise<void>;
};

type LoggerLike = {
  error: (message: string) => void;
};

type CreateAppUpdateCheckRunnerOptions = {
  getController: () => Promise<AppUpdaterController>;
  logger: LoggerLike;
  notify: (notification: AppNotification) => void;
};

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

export function createAppUpdateCheckRunner({
  getController,
  logger,
  notify
}: CreateAppUpdateCheckRunnerOptions) {
  return async (source: CheckSource): Promise<void> => {
    try {
      const controller = await getController();
      await controller.checkForUpdates(source);
    } catch (error) {
      const message = resolveErrorMessage(error);
      logger.error(`[yulora] failed to initialize app updater: ${message}`);

      if (source === "manual") {
        notify({
          kind: "error",
          message: `\u68c0\u67e5\u66f4\u65b0\u5931\u8d25\uff1a${message}`
        });
      }
    }
  };
}
