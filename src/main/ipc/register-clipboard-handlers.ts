import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { IMPORT_CLIPBOARD_IMAGE_CHANNEL, type ImportClipboardImageInput, type ImportClipboardImageResult } from "../../shared/clipboard-image-import";
import { REQUEST_PLAIN_TEXT_PASTE_CHANNEL, type PlainTextPasteInput } from "../../shared/plain-text-paste";

export function registerClipboardHandlers({ ipc, authorize, importImage, requestPlainTextPaste }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  importImage(input: ImportClipboardImageInput, sender: Electron.WebContents, check: () => void): Promise<ImportClipboardImageResult>;
  requestPlainTextPaste(input: PlainTextPasteInput, sender: Electron.WebContents, check: () => void): Promise<string | null>;
}): void {
  ipc.handle(REQUEST_PLAIN_TEXT_PASTE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.tabId);
    if (value.source !== "shortcut" && value.source !== "context-menu") throw new Error("Invalid paste source.");
    const result = await requestPlainTextPaste({ tabId: value.tabId, source: value.source }, event.sender, check);
    // Cancellation carries no clipboard data, including when the menu's owner
    // has closed. Text responses still require the original live frame.
    if (result !== null) check();
    return result;
  });
  ipc.handle(IMPORT_CLIPBOARD_IMAGE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.tabId);
    const result = await importImage({ tabId: value.tabId }, event.sender, check);
    check();
    return result;
  });
}
