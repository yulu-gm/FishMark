// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function setup(path: string | null = "C:/notes/other.md") {
  const onTabActivate = vi.fn(), onCloseWorkspaceTab = vi.fn(), onSaveWorkspaceTab = vi.fn(async () => {}), onWorkspaceTabFile = vi.fn(async () => {});
  await act(async () => root.render(<WorkspaceTabStrip activeTabId="active" fishmarkPlatform="win32"
    workspaceTabs={[{ tabId: "active", name: "active.md", path: "C:/notes/active.md", isDirty: false, saveState: "idle" },
      { tabId: "other", name: "other.md", path, isDirty: true, saveState: "idle" }]}
    {...{ onTabActivate, onCloseWorkspaceTab, onSaveWorkspaceTab, onWorkspaceTabFile }} onTabReorder={vi.fn()} onTabDetach={vi.fn()} />));
  const trigger = container.querySelector<HTMLButtonElement>('[data-tab-id="other"]')!;
  const open = async () => { await act(async () => trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 30 }))); };
  await open();
  return { trigger, open, onTabActivate, onCloseWorkspaceTab, onSaveWorkspaceTab, onWorkspaceTabFile };
}
const item = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === label)!;
async function click(label: string) { await act(async () => item(label).click()); }

it("右键非活动页签的关闭、保存、路径和定位均使用被点击的 ID", async () => {
  const f = await setup();
  for (const label of ["保存", "复制文件路径", "在资源管理器中打开", "关闭"]) { await click(label); await f.open(); }
  expect(f.onTabActivate).not.toHaveBeenCalled();
  expect(f.onSaveWorkspaceTab).toHaveBeenCalledExactlyOnceWith("other");
  expect(f.onCloseWorkspaceTab).toHaveBeenCalledExactlyOnceWith("other");
  expect(f.onWorkspaceTabFile.mock.calls).toEqual([[{ tabId: "other", command: "copy-path" }], [{ tabId: "other", command: "reveal" }]]);
});

it("未保存文件仅启用保存和关闭", async () => {
  await setup(null);
  expect(item("保存").disabled).toBe(false);
  expect(item("关闭").disabled).toBe(false);
  for (const label of ["重命名…", "复制文件路径", "在资源管理器中打开"]) expect(item(label).disabled).toBe(true);
});

it("支持键盘导航、Escape 关闭、Shift F10 再打开和点击外部关闭", async () => {
  const f = await setup();
  expect(document.activeElement).toBe(item("关闭"));
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.activeElement).toBe(item("保存"));
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(f.trigger);
  await act(async () => f.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("重命名失败保留输入和错误，允许修正后重试", async () => {
  const f = await setup(); f.onWorkspaceTabFile.mockRejectedValueOnce(new Error("已有同名文件"));
  await click("重命名…");
  const input = document.querySelector<HTMLInputElement>('#workspace-tab-name')!;
  expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(5);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "new.md");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = document.querySelector('dialog form')!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("已有同名文件");
  expect(input.value).toBe("new.md");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(f.onWorkspaceTabFile).toHaveBeenLastCalledWith({ tabId: "other", command: "rename", name: "new.md" });
  expect(document.querySelector('dialog')).toBeNull();
});
