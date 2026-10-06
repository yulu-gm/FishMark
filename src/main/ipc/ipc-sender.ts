import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import type { PreloadBridgeMode } from "../../shared/preload-bridge-mode";

export type AuthorizeIpcSender = (
  event: IpcMainInvokeEvent,
  modes: readonly PreloadBridgeMode[]
) => () => void;

/** The mode and entry URL come from main's window construction, never an IPC payload. */
export function createIpcSenderAuthorization(input: {
  resolveWindow(sender: WebContents): BrowserWindow | null;
  getWindowPolicy(window: BrowserWindow): { mode: PreloadBridgeMode; entryUrl: string } | undefined;
}): AuthorizeIpcSender {
  return (event, modes) => {
    const sender = event.sender;
    const frame = event.senderFrame;
    const owner = input.resolveWindow(sender);
    const check = () => {
      if (!owner || owner.isDestroyed() || sender.isDestroyed() ||
          owner.webContents !== sender || input.resolveWindow(sender) !== owner ||
          !frame || frame !== sender.mainFrame || frame.detached) {
        throw new Error("Untrusted IPC sender.");
      }
      const policy = input.getWindowPolicy(owner);
      const actualUrl = withoutHash(frame.url);
      if (!policy || !modes.includes(policy.mode) || actualUrl === null ||
          actualUrl !== withoutHash(policy.entryUrl)) {
        throw new Error("IPC runtime is not permitted.");
      }
    };
    check();
    return check;
  };
}

function withoutHash(value: string): string | null {
  try { const url = new URL(value); url.hash = ""; return url.toString(); }
  catch { return null; }
}
