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

describe("createWorkspaceDetachApplication", () => {
  it("rejects foreign ownership before creating a window", () => {
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

    expect(() =>
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).toThrow(
      `Workspace tab '${tabId}' does not belong to window 'window-1'.`
    );
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("destroys the new window when the domain detach fails", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const window = createWindow(3);
    const detachError = new Error("detach failed");
    const application = createWorkspaceDetachApplication({
      workspace: {
        getTabSession: workspace.getTabSession.bind(workspace),
        detachTabToWindow: vi.fn(() => {
          throw detachError;
        }),
        moveTabToWindow: workspace.moveTabToWindow.bind(workspace),
        unregisterWindow: workspace.unregisterWindow.bind(workspace)
      },
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    expect(() =>
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).toThrow(detachError);
    expect(window.destroy).toHaveBeenCalledTimes(1);
  });

  it("cleans domain ownership if a detached window closes before its first IPC", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const window = createWindow(3);
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    const projection = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    window.closedListener?.();

    expect(projection.sourceWindowSnapshot).toMatchObject({
      windowId: "window-1",
      tabs: []
    });
    expect(unregisterWindow).toHaveBeenCalledWith("3");
    expect(workspace.getTabSession(tabId).windowId).toBe("window-1");
  });

  it("cleans ownership and destroys the window on pre-IPC load failure", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const window = createWindow(3);
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    application.detachTab({ tabId, expectedWindowId: "window-1" });
    window.loadFailureListener?.();

    expect(window.destroy).toHaveBeenCalledTimes(1);
    expect(() => workspace.getWindowProjection("3")).toThrow(
      "Unknown workspace window '3'."
    );
    expect(workspace.getTabSession(tabId).windowId).toBe("window-1");
  });

  it("disarms load-failure rollback after the detached renderer reaches IPC", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const window = createWindow(3);
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    application.detachTab({ tabId, expectedWindowId: "window-1" });
    application.markWindowReady("3");
    window.loadFailureListener?.();

    expect(window.destroy).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId).windowId).toBe("3");
  });
});
