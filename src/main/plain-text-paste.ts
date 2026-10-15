import type { BrowserWindow, Menu, MenuItemConstructorOptions, WebContents } from "electron";
import type { PlainTextPasteInput } from "../shared/plain-text-paste";

export function createPlainTextPasteRequester(deps: {
  resolveWindow(sender: WebContents): BrowserWindow | null;
  isActiveTab(windowId: string, tabId: string): boolean;
  readText(): string;
  createMenu(template: MenuItemConstructorOptions[]): Menu;
  platform: NodeJS.Platform;
}) {
  return async (input: PlainTextPasteInput, sender: WebContents, check: () => void): Promise<string | null> => {
    check();
    const owner = deps.resolveWindow(sender);
    const active = () => owner !== null && !owner.isDestroyed() && !sender.isDestroyed() &&
      owner.webContents === sender && deps.resolveWindow(sender) === owner && deps.isActiveTab(String(owner.id), input.tabId);
    const read = () => { check(); return active() ? deps.readText() : null; };
    if (!owner || !active()) return null;
    if (input.source === "shortcut") return read();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (text: string | null) => {
        if (settled) return;
        settled = true; owner.removeListener("closed", closed); resolve(text);
      };
      const menu = deps.createMenu([
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { label: "仅粘贴文本", accelerator: deps.platform === "darwin" ? "Cmd+Alt+Shift+V" : "Ctrl+Shift+V", registerAccelerator: false,
          click: () => {
            try { finish(read()); }
            catch (error) { if (!settled) { settled = true; owner.removeListener("closed", closed); reject(error); } }
          } },
        { type: "separator" }, { role: "selectAll" }
      ]);
      const closed = () => {
        if (settled) return;
        settled = true; owner.removeListener("closed", closed);
        try { menu.closePopup(owner); resolve(null); } catch (error) { reject(error); }
      };
      owner.once("closed", closed);
      try { menu.popup({ window: owner, callback: () => finish(null) }); }
      catch (error) { settled = true; owner.removeListener("closed", closed); reject(error); }
    });
  };
}
