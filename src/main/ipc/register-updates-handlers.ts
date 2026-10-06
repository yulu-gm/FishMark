import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { CHECK_FOR_APP_UPDATES_CHANNEL } from "../../shared/app-update";

export function registerUpdatesHandlers({ ipc, authorize, checkForUpdates }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  checkForUpdates(): Promise<void>;
}): void {
  ipc.handle(CHECK_FOR_APP_UPDATES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    request.noArguments(args);
    const result = await checkForUpdates();
    check();
    return result;
  });
}
