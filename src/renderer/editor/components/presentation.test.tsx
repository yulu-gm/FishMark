// @vitest-environment jsdom
import { act, StrictMode, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../../../shared/preferences";
import type { CodeEditorHandle } from "../../code-editor-view";
import { AppErrorBoundary } from "../App";
import { SettingsView } from "../settings-view";
import { useFindReplacePresentation } from "../useFindReplacePresentation";
import { useNotificationPresentation } from "../useNotificationPresentation";
import { useViewContainerPresentation } from "../useViewContainerPresentation";
import { ConflictBanner } from "./ConflictBanner";
import { FindReplacePanel } from "./FindReplacePanel";
import { NotificationHost } from "./NotificationHost";
import { TableToolbar } from "./TableToolbar";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
async function input(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("keeps notification replacement and both timer phases isolated under StrictMode", async () => {
  vi.useFakeTimers();
  function Harness() {
    const state = useNotificationPresentation();
    return <><NotificationHost notification={state.notification} notificationState={state.notificationState} />
      <button onClick={() => state.showNotification({ kind: "success", message: "Saved" })}>saved</button>
      <button onClick={() => state.showNotification({ kind: "loading", message: "Loading" })}>loading</button>
    </>;
  }
  await render(<StrictMode><Harness /></StrictMode>);
  await click("saved");
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(container.querySelector('[role="status"]')?.getAttribute("data-state")).toBe("closing");
  await click("loading");
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTime(180));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading");
  await click("saved");
  await act(async () => vi.advanceTimersByTime(3000));
  expect(vi.getTimerCount()).toBe(1);
  await render(null);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["render", "effect"])("shows a terminal %s failure without retrying children or resetting a command owner", async (phase) => {
  const cleanup = vi.fn();
  const command = vi.fn();
  const healthyRender = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => { });
  function Healthy() { healthyRender(); useEffect(() => cleanup, []); return <button onClick={command}>save</button>; }
  function Broken() {
    useEffect(() => { if (phase === "effect") throw new Error("effect failed"); }, []);
    if (phase === "render") throw new Error("render failed");
    return null;
  }
  await render(<AppErrorBoundary><Healthy /></AppErrorBoundary>);
  await render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not display the workspace");
  expect(container.querySelector("button")).toBeNull();
  const count = healthyRender.mock.calls.length;
  await render(<AppErrorBoundary><Healthy /></AppErrorBoundary>);
  expect(healthyRender).toHaveBeenCalledTimes(count);
  expect(command).not.toHaveBeenCalled();
});

it("clears Search on Escape and identity changes, reopens during exit without stealing the input instance", async () => {
  vi.useFakeTimers();
  const empty = { matchCount: 0, currentMatchIndex: null, matches: [] };
  const clearFindReplaceQuery = vi.fn(() => empty);
  const updateFindReplaceQuery = vi.fn(() => ({ matchCount: 2, currentMatchIndex: 1, matches: [] }));
  const focus = vi.fn();
  const editorRef = { current: { clearFindReplaceQuery, updateFindReplaceQuery, focus, prepareFindReplace: vi.fn(async () => { }) } as unknown as CodeEditorHandle };
  function Harness({ epoch = 1, revision = 1 }: { epoch?: number; revision?: number }) {
    const panel = useViewContainerPresentation();
    const search = useFindReplacePresentation({ activeTabId: "tab-a", editorEpoch: epoch, editorLoadRevision: revision, editorRef, isDocumentOpen: true, activeViewContainer: panel.activeViewContainer, isSearchViewActive: panel.activeViewContainer === "search", isViewContainerEnabled: true, onCloseViewContainer: panel.closeViewContainer, onToggleViewContainer: panel.toggleViewContainer });
    return <div onKeyDownCapture={search.handleWorkspaceKeyDownCapture}>
      <button onClick={search.toggleSearchViewContainer}>Search</button>
      {(panel.activeViewContainer ?? panel.closingViewContainer) === "search" ? <FindReplacePanel
        findText={search.findText} replaceText={search.replaceText} matchStatusLabel={search.matchStatusLabel}
        findInputRef={search.findInputRef} handleFindReplaceKeyDown={search.handleFindReplaceKeyDown}
        handleFindTextChange={search.handleFindTextChange} handleReplaceTextChange={search.handleReplaceTextChange}
        hasMatches={search.findReplaceSnapshot.matchCount > 0} onPrevious={vi.fn()} onNext={vi.fn()} onReplaceCurrent={vi.fn()} onReplaceAll={vi.fn()}
        matches={search.findReplaceSnapshot.matches} currentMatchIndex={search.findReplaceSnapshot.currentMatchIndex}
        onSelectMatch={search.selectFindReplaceMatch}
      /> : null}
    </div>;
  }
  await render(<StrictMode><Harness /></StrictMode>);
  await click("Search");
  const originalInput = container.querySelector<HTMLInputElement>('[aria-label="Find text"]')!;
  expect(document.activeElement).toBe(originalInput);
  await input("Find text", "needle");
  await input("Replace with", "replacement");
  expect(updateFindReplaceQuery).toHaveBeenLastCalledWith({ search: "needle", replace: "replacement" });
  await act(async () => originalInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(clearFindReplaceQuery).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(originalInput.value).toBe("");
  await click("Search");
  expect(container.querySelector('[aria-label="Find text"]')).toBe(originalInput);
  expect(document.activeElement).toBe(originalInput);
  await act(async () => vi.advanceTimersByTime(180));
  expect(container.querySelector('[aria-label="Find text"]')).toBe(originalInput);
  await input("Find text", "epoch-query");
  await render(<StrictMode><Harness epoch={2} /></StrictMode>);
  expect(originalInput.value).toBe("");
  expect(clearFindReplaceQuery).toHaveBeenCalledTimes(2);
  await input("Find text", "reload-query");
  await render(<StrictMode><Harness epoch={2} revision={2} /></StrictMode>);
  expect(originalInput.value).toBe("");
  expect(clearFindReplaceQuery).toHaveBeenCalledTimes(3);
});

it("projects conflict action visibility and delegates exactly the selected command", async () => {
  const onReloadExternalFile = vi.fn(), onKeepMemoryVersion = vi.fn(), onSaveAs = vi.fn(), onDismissExternalFileConflict = vi.fn();
  const callbacks = { onReloadExternalFile, onKeepMemoryVersion, onSaveAs, onDismissExternalFileConflict };
  await render(<ConflictBanner {...callbacks} externalFileState={{ status: "pending", kind: "modified", path: "/note.md" }} externalFileConflictMessage="Disk changed" />);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Disk changed");
  await click("保留当前编辑");
  expect(onKeepMemoryVersion).toHaveBeenCalledTimes(1);
  expect(onReloadExternalFile).not.toHaveBeenCalled();
  expect(onSaveAs).not.toHaveBeenCalled();
  await render(<ConflictBanner {...callbacks} externalFileState={{ status: "keeping-memory", kind: "modified", path: "/note.md" }} externalFileConflictMessage="Keeping memory" />);
  expect(container.textContent).not.toContain("保留当前编辑");
  await click("另存为新文件");
  await click("关闭提示");
  expect(onSaveAs).toHaveBeenCalledTimes(1);
  expect(onDismissExternalFileConflict).toHaveBeenCalledTimes(1);
  await render(<ConflictBanner {...callbacks} externalFileState={{ status: "idle" }} externalFileConflictMessage="" />);
  expect(container.innerHTML).toBe("");
});

it("keeps table controls focused across tooltip projection updates and sends one command", async () => {
  const hover = vi.fn(), insert = vi.fn();
  const props = { onTableToolHoverChange: hover, onInsertTableRowAbove: insert, onInsertTableRowBelow: vi.fn(), onInsertTableColumnLeft: vi.fn(), onInsertTableColumnRight: vi.fn(), onDeleteTable: vi.fn(), onDeleteTableRow: vi.fn(), onDeleteTableColumn: vi.fn() };
  await render(<TableToolbar {...props} activeTableToolId={null} />);
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Row Above"]')!;
  await act(async () => button.focus());
  expect(hover).toHaveBeenLastCalledWith("row-above");
  await render(<TableToolbar {...props} activeTableToolId="row-above" />);
  expect(document.activeElement).toBe(button);
  expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("Row Above");
  await click("Row Above");
  expect(insert).toHaveBeenCalledTimes(1);
  await act(async () => button.blur());
  expect(hover).toHaveBeenLastCalledWith(null);
});

async function tabGestureHarness() {
  const reorder = vi.fn(async () => {}), detach = vi.fn(async () => {});
  const activate = vi.fn(), close = vi.fn();
  await render(<StrictMode><WorkspaceTabStrip workspaceTabs={[{ tabId: "a", path: null, name: "A", isDirty: true, saveState: "idle" }, { tabId: "b", path: null, name: "B", isDirty: false, saveState: "idle" }]} activeTabId="a" onTabActivate={activate} onCloseWorkspaceTab={close} onTabReorder={reorder} onTabDetach={detach} /></StrictMode>);
  const tabs = container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="workspace-tab"]');
  const captures = new Set<number>();
  for (const tab of tabs) {
    tab.setPointerCapture = (id) => { captures.add(id); };
    tab.hasPointerCapture = (id) => captures.has(id);
    tab.releasePointerCapture = (id) => { captures.delete(id); };
  }
  const hit = vi.fn((): Element | null => null);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  async function pointer(type: string, x = 0, id = 1, button = 0) {
    await act(async () => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true }, button: { value: button }, buttons: { value: type === "pointerup" ? 0 : 1 }, clientX: { value: x }, clientY: { value: 0 } });
      tabs[0]!.dispatchEvent(event);
    });
  }
  return { reorder, detach, activate, close, tabs, captures, hit, pointer };
}

it("preserves clicks below the threshold, same-tab releases, reorder, and one detach on release", async () => {
  const h = await tabGestureHarness();
  await h.pointer("pointerdown"); await h.pointer("pointermove", 3); await h.pointer("pointerup", 3);
  await act(async () => h.tabs[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
  expect(h.activate).toHaveBeenCalledExactlyOnceWith("a");
  expect(h.detach).not.toHaveBeenCalled();
  h.hit.mockReturnValue(h.tabs[0]!);
  await h.pointer("pointerdown"); await h.pointer("pointermove", 10); await h.pointer("pointerup", 10);
  expect(h.reorder).not.toHaveBeenCalled(); expect(h.detach).not.toHaveBeenCalled();
  h.hit.mockReturnValue(h.tabs[1]!);
  await h.pointer("pointerdown"); await h.pointer("pointermove", 10);
  expect(h.reorder).not.toHaveBeenCalled();
  await h.pointer("pointerup", 10);
  expect(h.reorder).toHaveBeenCalledExactlyOnceWith("a", 1);
  h.hit.mockReturnValue(null);
  await h.pointer("pointerdown"); await h.pointer("pointermove", 100);
  await h.pointer("pointerup", 100, 2); // unrelated pointer cannot commit
  expect(h.detach).not.toHaveBeenCalled();
  await h.pointer("pointerup", 100); await h.pointer("pointerup", 100);
  expect(h.detach).toHaveBeenCalledExactlyOnceWith("a");
  await act(async () => h.tabs[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
  expect(h.activate).toHaveBeenCalledTimes(1);
  expect(h.captures.size).toBe(0);
  await click("Close A"); expect(h.close).toHaveBeenCalledExactlyOnceWith("a");
});

it.each(["Escape", "pointercancel", "lostpointercapture", "unmount"])("cancels %s without committing on eventual release", async (reason) => {
  const h = await tabGestureHarness();
  await h.pointer("pointerdown"); await h.pointer("pointermove", 100);
  expect(h.captures.has(1)).toBe(true);
  if (reason === "Escape") await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  else if (reason === "unmount") await render(null);
  else await h.pointer(reason, 100);
  await h.pointer("pointerup", 100);
  expect(h.captures.size).toBe(0);
  expect(h.detach).not.toHaveBeenCalled(); expect(h.reorder).not.toHaveBeenCalled();
  expect(h.tabs[0]!.dataset.dragging).toBeUndefined();
});
it("keeps settings draft identity during closing and treats a cancelled directory picker as no save", async () => {
  const onUpdate = vi.fn(async () => ({ status: "success" as const, preferences: DEFAULT_PREFERENCES }));
  const onSelectTemporaryImageDirectory = vi.fn(async () => null);
  const props = { preferences: DEFAULT_PREFERENCES, fontFamilies: [], themePackages: [], isRefreshingThemes: false, onRefreshThemes: vi.fn(async () => { }), onOpenThemesDirectory: vi.fn(async () => { }), onSelectTemporaryImageDirectory, onUpdate, onOpenExternalLink: vi.fn(), onClose: vi.fn() };
  await render(<StrictMode><SettingsView {...props} surfaceState="open" /></StrictMode>);
  await click("排版");
  const field = container.querySelector<HTMLInputElement>('#settings-ui-font-size')!;
  expect(field).not.toBeNull();
  await act(async () => field.focus());
  await render(<StrictMode><SettingsView {...props} surfaceState="closing" /></StrictMode>);
  expect(container.querySelector('#settings-ui-font-size')).toBe(field);
  expect(document.activeElement).toBe(field);
  await render(<StrictMode><SettingsView {...props} surfaceState="open" /></StrictMode>);
  await click("图片");
  await click("选择目录");
  expect(onSelectTemporaryImageDirectory).toHaveBeenCalledTimes(1);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(container.querySelector('.settings-save-status')?.textContent).not.toBe("已保存更改");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
