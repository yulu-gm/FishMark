import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceDetachApplication } from "./workspace-detach-application";

type FakeWindow = {
  id: number;
  destroy: () => void;
  closedListener?: () => void;
  loadFailureListener?: () => void;
};

function createWindow(id = 2): FakeWindow {
  return { id, destroy: vi.fn() };
}

function createLifecycle() {
  return {
    getWindowId: (window: FakeWindow) => String(window.id),
    destroyWindow: (window: FakeWindow) => window.destroy(),
    bindClosed: (window: FakeWindow, listener: () => void) => {
      window.closedListener = listener;
    },
    bindLoadFailure: (window: FakeWindow, listener: () => void) => {
      window.loadFailureListener = listener;
    }
  };
}

function createDirtySource() {
  const workspace = createWorkspaceState();
  workspace.registerWindow("window-1");
  const tabId = workspace.createUntitledTab("window-1").activeTabId!;
  workspace.updateTabDraft(tabId, "unsaved detached draft");
  return { workspace, tabId };
}

function expectDirtySourceTab(
  workspace: ReturnType<typeof createWorkspaceState>,
  tabId: string
): void {
  expect(workspace.getTabSession(tabId)).toMatchObject({
    windowId: "window-1",
    content: "unsaved detached draft",
    revision: 1,
    savedRevision: 0,
    isDirty: true
  });
}

function expectNoTargetWindow(
  workspace: ReturnType<typeof createWorkspaceState>
): void {
  expect(() => workspace.getWindowProjection("3")).toThrow(
    "Unknown workspace window '3'."
  );
}

describe("createWorkspaceDetachApplication", () => {
  it("rejects foreign ownership before creating a window", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const tabId = workspace.createUntitledTab("window-2").activeTabId!;
    const openWindow = vi.fn(() => createWindow(3));
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow,
      lifecycle: createLifecycle()
    });

    await expect(
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).rejects.toThrow(
      `Workspace tab '${tabId}' does not belong to window 'window-1'.`
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("keeps the source canonical until ready then atomically moves and resolves", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    let settled = false;
    void detachPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    workspace.updateTabDraft(tabId, "latest draft while waiting");

    application.markWindowReady("3");

    await expect(detachPromise).resolves.toMatchObject({
      sourceWindowSnapshot: { windowId: "window-1", tabs: [] },
      targetWindowSnapshot: {
        windowId: "3",
        activeTabId: tabId,
        activeDocument: {
          tabId,
          content: "latest draft while waiting",
          isDirty: true
        }
      }
    });
    expect(detachTabToWindow).toHaveBeenCalledOnce();
    expect(detachTabToWindow).toHaveBeenCalledWith({
      tabId,
      targetWindowId: "3"
    });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "3",
      content: "latest draft while waiting",
      revision: 2,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("rejects ready when the tab moved away from the expected source while waiting", async () => {
    const { workspace, tabId } = createDirtySource();
    workspace.registerWindow("window-2");
    const window = createWindow(3);
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    const rejection = expect(detachPromise).rejects.toThrow(
      `Workspace tab '${tabId}' does not belong to window 'window-1'.`
    );

    expect(() => application.markWindowReady("3")).toThrow(
      `Workspace tab '${tabId}' does not belong to window 'window-1'.`
    );
    await rejection;
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "unsaved detached draft",
      revision: 1,
      isDirty: true
    });
    expectNoTargetWindow(workspace);
  });

  it("rejects exactly once on a pre-ready close and leaves the source untouched", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const rejection = expect(detachPromise).rejects.toThrow(
      "Detached workspace window '3' closed before it became ready."
    );
    window.closedListener?.();
    window.closedListener?.();
    window.loadFailureListener?.();

    await rejection;
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    expect(() => application.markWindowReady("3")).not.toThrow();
  });

  it("rejects exactly once on a pre-ready main-frame load failure", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const rejection = expect(detachPromise).rejects.toThrow(
      "Detached workspace window '3' failed to load before it became ready."
    );
    window.loadFailureListener?.();
    window.closedListener?.();
    window.loadFailureListener?.();

    await rejection;
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
  });

  it("destroys the opened window and preserves the getWindowId error", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const adapterError = new Error("get window id failed");
    const lifecycle = createLifecycle();
    lifecycle.getWindowId = vi.fn(() => {
      throw adapterError;
    });
    lifecycle.destroyWindow = vi.fn((target) => {
      target.destroy();
      throw new Error("destroy failed");
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle
    });

    await expect(
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).rejects.toBe(adapterError);
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
  });

  it("rejects a bindClosed error without moving the source tab", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const adapterError = new Error("bind closed failed");
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindClosed = vi.fn(() => {
      throw adapterError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle
    });

    await expect(
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).rejects.toBe(adapterError);
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
  });

  it("rejects a bindLoadFailure error once when destroy re-enters closed", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    window.destroy = vi.fn(() => window.closedListener?.());
    const adapterError = new Error("bind load failure failed");
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindLoadFailure = vi.fn(() => {
      throw adapterError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle
    });

    await expect(
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).rejects.toBe(adapterError);
    window.closedListener?.();
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
  });

  it("rejects and destroys when the ready-time domain detach fails", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const domainError = new Error("detach failed");
    const detachTabToWindow = vi.fn(() => {
      throw domainError;
    });
    const application = createWorkspaceDetachApplication({
      workspace: {
        getTabSession: workspace.getTabSession.bind(workspace),
        detachTabToWindow
      },
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const rejection = expect(detachPromise).rejects.toBe(domainError);

    expect(() => application.markWindowReady("3")).toThrow(domainError);
    await rejection;
    expect(detachTabToWindow).toHaveBeenCalledOnce();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    expect(() => application.markWindowReady("3")).not.toThrow();
  });

  it("rejects ready when the source was normally unregistered while waiting", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const rejection = expect(detachPromise).rejects.toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
    workspace.unregisterWindow("window-1");

    expect(() => application.markWindowReady("3")).toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
    await rejection;
    expect(window.destroy).toHaveBeenCalledOnce();
    expectNoTargetWindow(workspace);
  });

  it("makes early lifecycle events and duplicate ready notifications no-ops after success", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    application.markWindowReady("missing-window");
    application.markWindowReady("3");
    await detachPromise;

    window.closedListener?.();
    window.loadFailureListener?.();
    application.markWindowReady("3");

    expect(detachTabToWindow).toHaveBeenCalledOnce();
    expect(window.destroy).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId).windowId).toBe("3");
    expect(workspace.getWindowProjection("3").activeTabId).toBe(tabId);
  });
});
