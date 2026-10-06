import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { IMPORT_CLIPBOARD_IMAGE_CHANNEL, type ImportClipboardImageInput, type ImportClipboardImageResult } from "../../shared/clipboard-image-import";

export function registerClipboardHandlers({ ipc, authorize, importImage }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  importImage(input: ImportClipboardImageInput): Promise<ImportClipboardImageResult>;
}): void {
  ipc.handle(IMPORT_CLIPBOARD_IMAGE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.nullableString(value.documentPath);
    const result = await importImage({ documentPath: value.documentPath });
    check();
    return result;
  });
}
