import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, Menu, MenuItemConstructorOptions, WebContents } from "electron";
import { createPlainTextPasteRequester } from "./plain-text-paste";

function fixture(platform: NodeJS.Platform = "win32") {
  const sender = { isDestroyed: () => false } as WebContents;
  const owner = Object.assign(new EventEmitter(), { id: 7, webContents: sender, isDestroyed: () => false }) as unknown as BrowserWindow;
  let template: MenuItemConstructorOptions[] = [], callback: () => void = () => {};
  const popup = vi.fn((options: { callback: () => void }) => { callback = options.callback; });
  const closePopup = vi.fn(() => callback());
  const createMenu = vi.fn((items: MenuItemConstructorOptions[]) => { template = items; return { popup, closePopup } as unknown as Menu; });
  const readText = vi.fn(() => "plain fixture");
  const isActiveTab = vi.fn(() => true), resolveWindow = vi.fn(() => owner), check = vi.fn();
  const request = createPlainTextPasteRequester({ resolveWindow, isActiveTab, readText, createMenu, platform });
  return { sender, owner, popup, closePopup, readText, createMenu, isActiveTab, resolveWindow, check, request,
    dismiss: () => callback(), choose: () => template.find(item => item.label === "仅粘贴文本")!.click!(null!, owner, null!), template: () => template };
}

describe("plain text paste boundary", () => {
  it("reads only text for the active original sender and tab", async () => {
    const f = fixture();
    await expect(f.request({ tabId: "a", source: "shortcut" }, f.sender, f.check)).resolves.toBe("plain fixture");
    expect(f.readText).toHaveBeenCalledOnce(); expect(f.createMenu).not.toHaveBeenCalled();
    expect(f.isActiveTab).toHaveBeenCalledWith("7", "a");
  });
  it.each(["win32", "darwin"] as const)("binds native menu to its original window (%s)", async platform => {
    const f = fixture(platform), pending = f.request({ tabId: "a", source: "context-menu" }, f.sender, f.check);
    expect(f.popup).toHaveBeenCalledWith({ window: f.owner, callback: expect.any(Function) });
    expect(f.readText).not.toHaveBeenCalled();
    expect(f.template().find(i => i.label === "仅粘贴文本")).toMatchObject({ accelerator: platform === "darwin" ? "Cmd+Alt+Shift+V" : "Ctrl+Shift+V", registerAccelerator: false });
    expect(f.template().filter(i => i.role).map(i => i.role)).toEqual(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
    f.choose(); f.dismiss(); await expect(pending).resolves.toBe("plain fixture");
    expect(f.owner.listenerCount("closed")).toBe(0);
  });
  it.each(["dismiss", "closed", "changed-tab", "changed-window"])("does not read text after %s", async reason => {
    const f = fixture(), pending = f.request({ tabId: "a", source: "context-menu" }, f.sender, f.check);
    if (reason === "dismiss") f.dismiss();
    if (reason === "closed") f.owner.emit("closed");
    if (reason === "changed-tab") { f.isActiveTab.mockReturnValue(false); f.choose(); }
    if (reason === "changed-window") { f.resolveWindow.mockReturnValue({ ...f.owner } as BrowserWindow); f.choose(); }
    await expect(pending).resolves.toBeNull(); expect(f.readText).not.toHaveBeenCalled();
    expect(f.owner.listenerCount("closed")).toBe(0);
  });
  it("rechecks sender authorization before the menu action reads text", async () => {
    const f = fixture(), pending = f.request({ tabId: "a", source: "context-menu" }, f.sender, f.check);
    f.check.mockImplementation(() => { throw new Error("sender changed"); }); f.choose();
    await expect(pending).rejects.toThrow("sender changed"); expect(f.readText).not.toHaveBeenCalled();
    expect(f.owner.listenerCount("closed")).toBe(0);
  });
  it("settles once and preserves a native popup close failure without escaping the window event", async () => {
    const f = fixture(), pending = f.request({ tabId: "a", source: "context-menu" }, f.sender, f.check);
    f.closePopup.mockImplementation(() => { f.dismiss(); throw new Error("native close failed"); });
    expect(() => f.owner.emit("closed")).not.toThrow();
    await expect(pending).rejects.toThrow("native close failed");
    expect(f.readText).not.toHaveBeenCalled(); expect(f.owner.listenerCount("closed")).toBe(0);
  });
});
