import { WORKSPACE_TAB_FILE_CHANNEL, type WorkspaceTabFileInput, type WorkspaceTabFileResult } from "../../shared/workspace-tab-file";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";

export function registerWorkspaceTabFileHandlers(ports: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  ensureWindow(sender: Electron.WebContents): Promise<string>;
  execute(input: WorkspaceTabFileInput, windowId: string, sender: Electron.WebContents, check: () => void): Promise<WorkspaceTabFileResult>;
}): void {
  ports.ipc.handle(WORKSPACE_TAB_FILE_CHANNEL, async (event, ...args) => {
    const check = ports.authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.tabId);
    let input: WorkspaceTabFileInput;
    if (value.command === "rename") { request.string(value.name); input = { tabId: value.tabId, command: value.command, name: value.name }; }
    else if (value.command === "copy-path" || value.command === "reveal") input = { tabId: value.tabId, command: value.command };
    else return request.invalidRequest();
    const windowId = await ports.ensureWindow(event.sender);
    check();
    const result = await ports.execute(input, windowId, event.sender, check);
    check();
    return result;
  });
}
