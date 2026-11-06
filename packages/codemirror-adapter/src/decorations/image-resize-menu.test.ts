// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeImageResizeMenu, showImageResizeMenu } from "./image-resize-menu";

afterEach(() => document.body.replaceChildren());
describe("image resize menu", () => {
  it("selects a scale and closes", () => {
    const host = document.createElement("div"); document.body.append(host);
    const select = vi.fn(); showImageResizeMenu(host, 1, 1, select);
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect([...items].map(item => item.textContent)).toEqual(["原图 25%", "原图 50%", "原图 75%", "原图 100%"]);
    items[1]?.click(); expect(select).toHaveBeenCalledWith(0.5); expect(host.querySelector('[role="menu"]')).toBeNull();
  });
  it("cancels with Escape or an outside pointer without changing size", () => {
    const host = document.createElement("div"); document.body.append(host); const select = vi.fn();
    showImageResizeMenu(host, 1, 1, select);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    showImageResizeMenu(host, 1, 1, select);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(host.querySelector('[role="menu"]')).toBeNull(); expect(select).not.toHaveBeenCalled();
    closeImageResizeMenu(host);
  });
});
