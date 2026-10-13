import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { IMPORT_CLIPBOARD_IMAGE_CHANNEL, type ImportClipboardImageInput, type ImportClipboardImageResult } from "../../shared/clipboard-image-import";

export function registerClipboardHandlers({ ipc, authorize, importImage }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  importImage(input: ImportClipboardImageInput, sender: Electron.WebContents, check: () => void): Promise<ImportClipboardImageResult>;
}): void {
  ipc.handle(IMPORT_CLIPBOARD_IMAGE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.tabId);
    const result = await importImage({ tabId: value.tabId }, event.sender, check);
    check();
    return result;
  });
}
