import type { WebContents } from "electron";
import { registerWorkspaceHandlers, type RegisterWorkspaceHandlersInput } from "./register-workspace-handlers";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import { oneArgument } from "./request-validation";

/** Attach invocation identity without changing the proven queued edit/flush protocol. */
export function registerWorkspaceEditHandlers(input: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  ensureWindow(sender: WebContents): Promise<string>;
  getWindowId(sender: WebContents): string | undefined;
  application: RegisterWorkspaceHandlersInput<WebContents>["application"];
}): void {
  registerWorkspaceHandlers<{ contents: WebContents; check: () => void }>({
    register: (channel, handler) => {
      input.ipc.handle(channel, (event, ...args) => {
        const check = input.authorize(event, ["product", "editor-test"]);
        return handler({ sender: { contents: event.sender, check } }, oneArgument(args));
      });
    },
    ensureWindow: (sender) => input.ensureWindow(sender.contents),
    isCurrentSender: (sender, windowId) => {
      try { sender.check(); } catch { return false; }
      return input.getWindowId(sender.contents) === windowId;
    },
    application: input.application,
    publish: (sender, channel, payload) => sender.contents.send(channel, payload)
  });
}
