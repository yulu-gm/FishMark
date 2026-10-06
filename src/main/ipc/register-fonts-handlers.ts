import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { LIST_FONT_FAMILIES_CHANNEL } from "../../shared/font-families";
import type { createFontCatalogService } from "../font-catalog-service";

export function registerFontsHandlers({ ipc, authorize, service }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  service: Pick<ReturnType<typeof createFontCatalogService>, "listFontFamilies">;
}): void {
  ipc.handle(LIST_FONT_FAMILIES_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    request.noArguments(args);
    const result = await service.listFontFamilies();
    check();
    return result;
  });
}
