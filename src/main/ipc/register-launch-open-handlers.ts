import type { WebContents } from "electron";
import { LAUNCH_OPEN_CONTROL_CHANNEL } from "../../shared/workspace";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";

export function registerLaunchOpenHandlers<TWindow>(input: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  resolveWindow(sender: WebContents): TWindow | null;
  setReady(window: TWindow, ready: boolean): void;
  complete(window: TWindow, requestId: string, success: boolean): boolean;
}) {
  input.ipc.handle(LAUNCH_OPEN_CONTROL_CHANNEL, (event, ...args) => {
    input.authorize(event, ["product", "editor-test"]);
    const value = request.oneArgument(args);
    request.record(value);
    const window = input.resolveWindow(event.sender);
    if (!window) throw new Error("Launch renderer has no live owner.");
    if (value.kind === "ready") {
      request.boolean(value.ready);
      input.setReady(window, value.ready);
    } else if (value.kind === "complete") {
      request.string(value.requestId);
      request.boolean(value.success);
      return input.complete(window, value.requestId, value.success);
    } else {
      request.invalidRequest();
    }
  });
}
