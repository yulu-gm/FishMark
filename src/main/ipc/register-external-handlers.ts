import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { OPEN_EXTERNAL_LINK_CHANNEL } from "../../shared/external-link";

export function registerExternalHandlers({ ipc, authorize, openExternal }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  openExternal(href: string): Promise<void>;
}): void {
  ipc.handle(OPEN_EXTERNAL_LINK_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test", "test-workbench"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.href);
    const url = new URL(value.href.trim());
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) request.invalidRequest();
    const result = await openExternal(url.toString());
    check();
    return result;
  });
}
