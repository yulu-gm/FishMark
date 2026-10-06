import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { GET_RECENT_FILES_CHANNEL, CLEAR_RECENT_FILE_CHANNEL } from "../../shared/recent-files";
import type { createRecentFilesService } from "../recent-files-service";

export function registerRecentFilesHandlers({ ipc, authorize, service }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  service: Pick<ReturnType<typeof createRecentFilesService>, "getRecentFiles" | "clearFile">;
}): void {
  ipc.handle(GET_RECENT_FILES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    request.noArguments(args);
    const result = await service.getRecentFiles();
    check();
    return result;
  });
  ipc.handle(CLEAR_RECENT_FILE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.path);
    const result = await service.clearFile(value.path);
    check();
    return result;
  });
}
