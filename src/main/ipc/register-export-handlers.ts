import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
import { EXPORT_HTML_FILE_CHANNEL, type ExportHtmlFileInput, type ExportHtmlFileResult } from "../../shared/export-html-file";

export function registerExportHandlers({ ipc, authorize, exportHtml }: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  exportHtml(input: ExportHtmlFileInput): Promise<ExportHtmlFileResult>;
}): void {
  ipc.handle(EXPORT_HTML_FILE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.tabId); request.nullableString(value.currentPath);
    if (typeof value.html !== "string") request.invalidRequest();
    const result = await exportHtml({ tabId: value.tabId, currentPath: value.currentPath, html: value.html });
    check();
    return result;
  });
}
