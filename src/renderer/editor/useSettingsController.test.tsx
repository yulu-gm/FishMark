// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CodeEditorHandle } from "../code-editor-view";
import { useSettingsController } from "./useSettingsController";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function Harness() {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const settingsEntryRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef({ focus: () => editorContainerRef.current?.querySelector("input")?.focus() } as CodeEditorHandle);
  const settings = useSettingsController({ editorContainerRef, settingsEntryRef, editorRef, exitAnimationMs: 200 });
  return <>
    <div ref={editorContainerRef}><input aria-label="editor" /></div>
    <input aria-label="search" />
    <button ref={settingsEntryRef} onMouseDown={settings.captureSettingsOpenOrigin} onClick={settings.openSettingsDrawer}>open</button>
    {settings.isSettingsDrawerVisible && <button onClick={settings.closeSettingsDrawer}>close</button>}
  </>;
}
beforeEach(async () => {
  vi.useFakeTimers();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
function button(text: string) { return [...host.querySelectorAll("button")].find(node => node.textContent === text)!; }
function input(label: string) { return host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; }
async function open(fromEditor = false) {
  if (fromEditor) {
    input("editor").focus();
    await act(async () => button("open").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  }
  button("open").focus(); await act(async () => button("open").click());
}
async function close() { button("close").focus(); await act(async () => button("close").click()); }
async function finishAnimation() { await act(async () => vi.advanceTimersByTime(200)); }

it.each(["editor", "search"])("关闭动画不抢走用户后来移到 %s 的焦点", async label => {
  await open(); await close(); input(label).focus(); await finishAnimation();
  expect(document.activeElement).toBe(input(label));
});
it.each([false, true])("没有新的聚焦时仍恢复原入口，正文来源=%s", async fromEditor => {
  await open(fromEditor); await close(); await finishAnimation();
  expect(document.activeElement).toBe(fromEditor ? input("editor") : button("open"));
});
it("关闭动画期间重新打开会取消旧的焦点恢复", async () => {
  await open(); await close(); await act(async () => button("open").click());
  button("close").focus(); await finishAnimation();
  expect(document.activeElement).toBe(button("close"));
});
