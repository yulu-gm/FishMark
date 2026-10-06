import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { LIST_THEME_PACKAGES_CHANNEL, REFRESH_THEME_PACKAGES_CHANNEL, OPEN_THEMES_DIRECTORY_CHANNEL } from "../../shared/theme-package";
import type { createThemePackageService } from "../theme-package-service";

export function registerThemesHandlers({ ipc, authorize, service, openDirectory }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  service: Pick<ReturnType<typeof createThemePackageService>, "listThemePackages" | "refreshThemePackages">;
  openDirectory(): Promise<void>;
}): void {
  ipc.handle(LIST_THEME_PACKAGES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await service.listThemePackages();
    check();
    return result;
  });
  ipc.handle(REFRESH_THEME_PACKAGES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await service.refreshThemePackages();
    check();
    return result;
  });
  ipc.handle(OPEN_THEMES_DIRECTORY_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await openDirectory();
    check();
    return result;
  });
}
