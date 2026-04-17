export const CHECK_FOR_APP_UPDATES_CHANNEL = "yulora:check-for-app-updates";
export const APP_UPDATE_STATE_EVENT = "yulora:app-update-state";
export const APP_NOTIFICATION_EVENT = "yulora:app-notification";

export type AppNotification = {
  kind: "loading" | "info" | "success" | "warning" | "error";
  message: string;
};

export type AppUpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };
