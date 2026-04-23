import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIST_THEME_PACKAGES_CHANNEL,
  OPEN_THEMES_DIRECTORY_CHANNEL,
  REFRESH_THEME_PACKAGES_CHANNEL
} from "../shared/theme-package";
import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL
} from "../shared/workspace";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const off = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    on,
    off
  }
}));

async function loadApi(): Promise<{ api: Window["fishmark"]; testApi: Window["fishmarkTest"] }> {
  await import("./preload");

  expect(exposeInMainWorld).toHaveBeenCalledTimes(2);
  const [, api] = exposeInMainWorld.mock.calls[0] ?? [];
  const [testBridgeName, testBridgeApi] = exposeInMainWorld.mock.calls[1] ?? [];

  expect(testBridgeName).toBe("fishmarkTest");
  return {
    api: api as Window["fishmark"],
    testApi: testBridgeApi as Window["fishmarkTest"]
  };
}

describe("preload bridge", () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    off.mockClear();
    vi.resetModules();
  });

  it("exposes task-030 scenario run controls for the workbench", async () => {
    await import("./preload");

    expect(exposeInMainWorld).toHaveBeenCalledTimes(2);
    const [, api] = exposeInMainWorld.mock.calls[1] ?? [];

    expect(api).toMatchObject({
      startScenarioRun: expect.any(Function),
      interruptScenarioRun: expect.any(Function),
      onScenarioRunEvent: expect.any(Function),
      onScenarioRunTerminal: expect.any(Function)
    });
  });

  it("keeps test bridge APIs off the product bridge and exposes the split bridge globally", async () => {
    const { api, testApi } = await loadApi();

    expect(api).not.toHaveProperty("startScenarioRun");
    expect(api).not.toHaveProperty("onEditorTestCommand");
    expect(testApi).toMatchObject({
      openEditorTestWindow: expect.any(Function),
      startScenarioRun: expect.any(Function),
      interruptScenarioRun: expect.any(Function),
      onScenarioRunEvent: expect.any(Function),
      onScenarioRunTerminal: expect.any(Function),
      onEditorTestCommand: expect.any(Function),
      completeEditorTestCommand: expect.any(Function)
    });
  });

  it("wires theme package discovery and refresh IPC channels", async () => {
    const { api } = await loadApi();

    expect(api).not.toHaveProperty("listThemes");
    expect(api).not.toHaveProperty("refreshThemes");
    void api.listThemePackages();
    void api.refreshThemePackages();

    expect(invoke.mock.calls).toContainEqual([LIST_THEME_PACKAGES_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([REFRESH_THEME_PACKAGES_CHANNEL]);
    expect(invoke.mock.calls).not.toContainEqual(["fishmark:list-themes"]);
    expect(invoke.mock.calls).not.toContainEqual(["fishmark:refresh-themes"]);
  });

  it("exposes workspace bridge methods for Task-043 tab commands", async () => {
    const { api } = await loadApi();

    expect(api).toMatchObject({
      getWorkspaceSnapshot: expect.any(Function),
      createWorkspaceTab: expect.any(Function),
      openWorkspaceFile: expect.any(Function),
      openWorkspaceFileFromPath: expect.any(Function),
      activateWorkspaceTab: expect.any(Function),
      closeWorkspaceTab: expect.any(Function),
      reorderWorkspaceTab: expect.any(Function),
      moveWorkspaceTabToWindow: expect.any(Function),
      detachWorkspaceTabToNewWindow: expect.any(Function),
      onOpenWorkspacePath: expect.any(Function),
      updateWorkspaceTabDraft: expect.any(Function)
    });

    void api.getWorkspaceSnapshot();
    void api.createWorkspaceTab({ kind: "untitled" });
    void api.openWorkspaceFile();
    void api.openWorkspaceFileFromPath("D:/fixtures/tabbed.md");
    void api.activateWorkspaceTab({ tabId: "tab-1" });
    void api.closeWorkspaceTab({ tabId: "tab-1" });
    void api.reorderWorkspaceTab({ tabId: "tab-1", toIndex: 0 });
    void api.moveWorkspaceTabToWindow({ tabId: "tab-1", targetWindowId: "window-2" });
    void api.detachWorkspaceTabToNewWindow({ tabId: "tab-1" });
    void api.onOpenWorkspacePath(() => {});
    void api.updateWorkspaceTabDraft({ tabId: "tab-1", content: "# Updated\n" });

    expect(invoke.mock.calls).toContainEqual([GET_WORKSPACE_SNAPSHOT_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([CREATE_WORKSPACE_TAB_CHANNEL, { kind: "untitled" }]);
    expect(invoke.mock.calls).toContainEqual([OPEN_WORKSPACE_FILE_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([
      OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
      { targetPath: "D:/fixtures/tabbed.md" }
    ]);
    expect(invoke.mock.calls).toContainEqual([ACTIVATE_WORKSPACE_TAB_CHANNEL, { tabId: "tab-1" }]);
    expect(invoke.mock.calls).toContainEqual([CLOSE_WORKSPACE_TAB_CHANNEL, { tabId: "tab-1" }]);
    expect(invoke.mock.calls).toContainEqual([
      REORDER_WORKSPACE_TAB_CHANNEL,
      { tabId: "tab-1", toIndex: 0 }
    ]);
    expect(invoke.mock.calls).toContainEqual([
      MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
      { tabId: "tab-1", targetWindowId: "window-2" }
    ]);
    expect(invoke.mock.calls).toContainEqual([
      DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
      { tabId: "tab-1" }
    ]);
    expect(invoke.mock.calls).toContainEqual([
      UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL,
      { tabId: "tab-1", content: "# Updated\n" }
    ]);
  });

  it("exposes an openThemesDirectory bridge for the native themes folder action", async () => {
    const { api } = await loadApi();

    expect(api).toHaveProperty("openThemesDirectory");
    void api.openThemesDirectory();

    expect(invoke.mock.calls).toContainEqual([OPEN_THEMES_DIRECTORY_CHANNEL]);
  });
});
