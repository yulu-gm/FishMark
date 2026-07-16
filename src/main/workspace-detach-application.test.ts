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
    const unregisterWindow = vi.fn(() => {
      throw new Error("target did not exist");
    });
    const application = createWorkspaceDetachApplication({
      workspace: {
        getTabSession: workspace.getTabSession.bind(workspace),
        detachTabToWindow: vi.fn(() => {
          throw detachError;
        }),
        moveTabToWindow: workspace.moveTabToWindow.bind(workspace),
        unregisterWindow
      },
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    expect(() =>
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).toThrow(detachError);
    expect(unregisterWindow).toHaveBeenCalledWith("3");
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

  it("preserves the detached canonical tab when the source is gone before a pre-ready close", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "unsaved detached draft");
    const window = createWindow(3);
    const moveTabToWindow = vi.spyOn(workspace, "moveTabToWindow");
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    application.detachTab({ tabId, expectedWindowId: "window-1" });
    workspace.unregisterWindow("window-1");
    window.closedListener?.();
    window.closedListener?.();

    expect(moveTabToWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).not.toHaveBeenCalledWith("3");
    expect(window.destroy).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "3",
      content: "unsaved detached draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(workspace.getWindowProjection("3")).toMatchObject({
      windowId: "3",
      tabs: [{ tabId, isDirty: true }],
      activeDocument: {
        tabId,
        content: "unsaved detached draft",
        isDirty: true
      }
    });
  });

  it("preserves the detached canonical tab when the source is gone before a pre-ready load failure", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "unsaved detached draft");
    const window = createWindow(3);
    const moveTabToWindow = vi.spyOn(workspace, "moveTabToWindow");
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    application.detachTab({ tabId, expectedWindowId: "window-1" });
    workspace.unregisterWindow("window-1");
    window.loadFailureListener?.();
    window.closedListener?.();
    window.loadFailureListener?.();

    expect(moveTabToWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).not.toHaveBeenCalledWith("3");
    expect(window.destroy).toHaveBeenCalledTimes(1);
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "3",
      content: "unsaved detached draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(workspace.getWindowProjection("3")).toMatchObject({
      windowId: "3",
      tabs: [{ tabId, isDirty: true }],
      activeDocument: {
        tabId,
        content: "unsaved detached draft",
        isDirty: true
      }
    });
  });

  it("rolls back and destroys the detached window when binding closed fails", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "unsaved detached draft");
    const window = createWindow(3);
    const bindError = new Error("bind closed failed");
    const moveTabToWindow = vi.spyOn(workspace, "moveTabToWindow");
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindClosed = vi.fn(() => {
      throw bindError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle
    });

    expect(() =>
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).toThrow(bindError);
    application.markWindowReady("3");

    expect(moveTabToWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).toHaveBeenCalledWith("3");
    expect(window.destroy).toHaveBeenCalledTimes(1);
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-1",
      content: "unsaved detached draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(() => workspace.getWindowProjection("3")).toThrow(
      "Unknown workspace window '3'."
    );
  });

  it("uses one idempotent rollback when binding load failure fails after binding closed", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "unsaved detached draft");
    const window = createWindow(3);
    window.destroy = vi.fn(() => window.closedListener?.());
    const bindError = new Error("bind load failure failed");
    const moveTabToWindow = vi.spyOn(workspace, "moveTabToWindow");
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindLoadFailure = vi.fn(() => {
      workspace.unregisterWindow("window-1");
      throw bindError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle
    });

    expect(() =>
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).toThrow(bindError);
    window.closedListener?.();

    expect(moveTabToWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).not.toHaveBeenCalledWith("3");
    expect(window.destroy).toHaveBeenCalledTimes(1);
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "3",
      content: "unsaved detached draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(workspace.getWindowProjection("3")).toMatchObject({
      windowId: "3",
      tabs: [{ tabId, isDirty: true }],
      activeDocument: {
        tabId,
        content: "unsaved detached draft",
        isDirty: true
      }
    });
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

  it("normally unregisters a ready detached window without restoring its tab", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const window = createWindow(3);
    const moveTabToWindow = vi.spyOn(workspace, "moveTabToWindow");
    const unregisterWindow = vi.spyOn(workspace, "unregisterWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      openWindow: () => window,
      lifecycle: createLifecycle()
    });

    application.detachTab({ tabId, expectedWindowId: "window-1" });
    application.markWindowReady("3");
    window.closedListener?.();
    window.closedListener?.();

    expect(moveTabToWindow).not.toHaveBeenCalled();
    expect(unregisterWindow).toHaveBeenCalledTimes(1);
    expect(unregisterWindow).toHaveBeenCalledWith("3");
    expect(() => workspace.getTabSession(tabId)).toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
    expect(() => workspace.getWindowProjection("3")).toThrow(
      "Unknown workspace window '3'."
    );
  });
});
