import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceDetachApplication } from "./workspace-detach-application";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceTabTransferApplication } from "./workspace-tab-transfer-application";
import { createWorkspaceWindowRegistrationApplication } from "./workspace-window-registration-application";

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

function createReadyScheduler() {
  let listener: (() => void) | undefined;
  const cancel = vi.fn();
  const scheduleReadyTimeout = vi.fn((nextListener: () => void) => {
    listener = nextListener;
    return cancel;
  });

  return {
    cancel,
    fire: () => listener?.(),
    scheduleReadyTimeout
  };
}

function scheduleReadyTimeout(): () => void {
  return vi.fn();
}

function createTabTransfer(
  workspace: ReturnType<typeof createWorkspaceState>
) {
  return createWorkspaceTabTransferApplication({
    workspace,
    documentOperations: createKeyedOperationCoordinator()
  });
}

function createDirtySource() {
  const workspace = createWorkspaceState();
  workspace.registerWindow("window-1");
  const tabId = workspace.createUntitledTab("window-1").activeTabId!;
  workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "unsaved detached draft" });
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
  it.each([
    {
      name: "timeout",
      cancel: (_window: FakeWindow, scheduler: ReturnType<typeof createReadyScheduler>) =>
        scheduler.fire(),
      message: "Detached workspace window '3' did not become ready before the timeout."
    },
    {
      name: "window close",
      cancel: (window: FakeWindow) => window.closedListener?.(),
      message: "Detached workspace window '3' closed before it became ready."
    },
    {
      name: "main-frame load failure",
      cancel: (window: FakeWindow) => window.loadFailureListener?.(),
      message: "Detached workspace window '3' failed to load before it became ready."
    }
  ])(
    "rejects detach and every concurrent registration without a ghost binding when $name cancels while transfer is queued",
    async ({ cancel, message }) => {
      const { workspace, tabId } = createDirtySource();
      const window = createWindow(3);
      const scheduler = createReadyScheduler();
      const documentOperations = createKeyedOperationCoordinator();
      let releaseBlockingOperation!: () => void;
      const blockingOperation = documentOperations.runExclusive(
        tabId,
        () =>
          new Promise<void>((resolve) => {
            releaseBlockingOperation = resolve;
          })
      );
      await vi.waitFor(() => expect(releaseBlockingOperation).toBeTypeOf("function"));
      const application = createWorkspaceDetachApplication({
        workspace,
        tabTransfer: createWorkspaceTabTransferApplication({
          workspace,
          documentOperations
        }),
        openWindow: () => window,
        scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
        lifecycle: createLifecycle()
      });
      const sender = { destroyed: false };
      const trace: string[] = [];
      const registration = createWorkspaceWindowRegistrationApplication<
        { destroyed: boolean },
        FakeWindow
      >({
        isSenderDestroyed: (candidate) => candidate.destroyed,
        resolveOwnerWindow: () => window,
        isOwnerWindowDestroyed: () => false,
        isOwnerWindowForSender: () => true,
        getWindowId: (ownerWindow) => String(ownerWindow.id),
        markWindowReady: application.markWindowReady,
        registerWindow: (windowId) => trace.push(`register:${windowId}`),
        bindWindow: (_ownerWindow, windowId) => trace.push(`bind:${windowId}`),
        focusWindow: (windowId) => trace.push(`focus:${windowId}`)
      });

      const detachPromise = application.detachTab({
        tabId,
        expectedWindowId: "window-1"
      });
      const firstRegistration = registration.ensureWindow(sender);
      const secondRegistration = registration.ensureWindow(sender);
      await Promise.resolve();

      expect(trace).toEqual([]);

      cancel(window, scheduler);
      const detachRejection = expect(detachPromise).rejects.toThrow(message);
      releaseBlockingOperation();

      await detachRejection;
      await expect(firstRegistration).rejects.toThrow(message);
      await expect(secondRegistration).rejects.toThrow(message);
      await blockingOperation;
      expect(window.destroy).toHaveBeenCalledOnce();
      expectDirtySourceTab(workspace, tabId);
      expectNoTargetWindow(workspace);
      expect(workspace.getLastFocusedWindowId()).toBe("window-1");
      expect(trace).toEqual([]);
    }
  );

  it("shares one in-flight ready transaction across concurrent registrations", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const documentOperations = createKeyedOperationCoordinator();
    const transfer = createWorkspaceTabTransferApplication({
      workspace,
      documentOperations
    });
    const detach = vi.spyOn(transfer, "detach");
    const lease = await documentOperations.acquireExclusive([tabId]);
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: transfer,
      openWindow: () => window,
      scheduleReadyTimeout,
      lifecycle: createLifecycle()
    });
    const trace: string[] = [];
    const sender = {};
    const registration = createWorkspaceWindowRegistrationApplication<
      object,
      FakeWindow
    >({
      isSenderDestroyed: () => false,
      resolveOwnerWindow: () => window,
      isOwnerWindowDestroyed: () => false,
      isOwnerWindowForSender: () => true,
      getWindowId: (ownerWindow) => String(ownerWindow.id),
      markWindowReady: application.markWindowReady,
      registerWindow: (windowId) => trace.push(`register:${windowId}`),
      bindWindow: (_ownerWindow, windowId) => trace.push(`bind:${windowId}`),
      focusWindow: (windowId) => trace.push(`focus:${windowId}`)
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const firstReady = application.markWindowReady("3");
    const secondReady = application.markWindowReady("3");
    const firstRegistration = registration.ensureWindow(sender);
    const secondRegistration = registration.ensureWindow(sender);
    await Promise.resolve();

    expect(secondReady).toBe(firstReady);
    expect(trace).toEqual([]);
    expect(detach).toHaveBeenCalledOnce();

    lease.release();
    await Promise.all([
      firstReady,
      secondReady,
      firstRegistration,
      secondRegistration,
      detachPromise
    ]);

    expect(detach).toHaveBeenCalledOnce();
    expect(trace).toEqual([
      "register:3",
      "bind:3",
      "focus:3",
      "register:3",
      "bind:3",
      "focus:3"
    ]);
    expect(workspace.getTabSession(tabId).windowId).toBe("3");
    expect(window.destroy).not.toHaveBeenCalled();
  });

  it("routes the ready-time transfer through the shared tab transfer application", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const detach = vi.fn(async (input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
      readonly targetWindowId: string;
    }) =>
      workspace.detachTabToWindow({
        tabId: input.tabId,
        targetWindowId: input.targetWindowId
      })
    );
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: { detach },
      openWindow: () => window,
      scheduleReadyTimeout,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await application.markWindowReady("3");
    await detachPromise;

    expect(detach).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      targetWindowId: "3",
      isActive: expect.any(Function)
    });
  });

  it("rejects foreign ownership before creating a window", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const tabId = workspace.createUntitledTab("window-2").activeTabId!;
    const openWindow = vi.fn(() => createWindow(3));
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow,
      scheduleReadyTimeout,
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
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "latest draft while waiting" });

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
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("times out a window that never becomes ready without moving the source tab", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    expect(scheduler.scheduleReadyTimeout).toHaveBeenCalledOnce();
    const rejection = expect(detachPromise).rejects.toThrow(
      "Detached workspace window '3' did not become ready before the timeout."
    );

    scheduler.fire();
    await rejection;

    expect(scheduler.cancel).toHaveBeenCalledOnce();
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    await expect(application.markWindowReady("3")).resolves.toBeUndefined();
  });

  it("rejects ready when the tab moved away from the expected source while waiting", async () => {
    const { workspace, tabId } = createDirtySource();
    workspace.registerWindow("window-2");
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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

    await expect(application.markWindowReady("3")).rejects.toThrow(
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
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("rejects exactly once on a pre-ready close and leaves the source untouched", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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
    expect(scheduler.cancel).toHaveBeenCalledOnce();
    await expect(application.markWindowReady("3")).resolves.toBeUndefined();
  });

  it("rejects exactly once on a pre-ready main-frame load failure", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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
    expect(scheduler.cancel).toHaveBeenCalledOnce();
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
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout,
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
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindClosed = vi.fn(() => {
      throw adapterError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
      lifecycle
    });

    await expect(
      application.detachTab({ tabId, expectedWindowId: "window-1" })
    ).rejects.toBe(adapterError);
    expect(detachTabToWindow).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("rejects a bindLoadFailure error once when destroy re-enters closed", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    window.destroy = vi.fn(() => window.closedListener?.());
    const adapterError = new Error("bind load failure failed");
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const lifecycle = createLifecycle();
    lifecycle.bindLoadFailure = vi.fn(() => {
      throw adapterError;
    });
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("rejects and destroys when the ready-time domain detach fails", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const domainError = new Error("detach failed");
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.fn(() => {
      throw domainError;
    });
    const application = createWorkspaceDetachApplication({
      workspace: {
        getTabSession: workspace.getTabSession.bind(workspace)
      },
      tabTransfer: { detach: detachTabToWindow },
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    const rejection = expect(detachPromise).rejects.toBe(domainError);

    await expect(application.markWindowReady("3")).rejects.toBe(domainError);
    await rejection;
    expect(detachTabToWindow).toHaveBeenCalledOnce();
    expect(window.destroy).toHaveBeenCalledOnce();
    expectDirtySourceTab(workspace, tabId);
    expectNoTargetWindow(workspace);
    expect(scheduler.cancel).toHaveBeenCalledOnce();
    await expect(application.markWindowReady("3")).resolves.toBeUndefined();
  });

  it("rejects ready when the source was normally unregistered while waiting", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
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

    await expect(application.markWindowReady("3")).rejects.toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
    await rejection;
    expect(window.destroy).toHaveBeenCalledOnce();
    expectNoTargetWindow(workspace);
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("makes early lifecycle events and duplicate ready notifications no-ops after success", async () => {
    const { workspace, tabId } = createDirtySource();
    const window = createWindow(3);
    const scheduler = createReadyScheduler();
    const detachTabToWindow = vi.spyOn(workspace, "detachTabToWindow");
    const application = createWorkspaceDetachApplication({
      workspace,
      tabTransfer: createTabTransfer(workspace),
      openWindow: () => window,
      scheduleReadyTimeout: scheduler.scheduleReadyTimeout,
      lifecycle: createLifecycle()
    });

    const detachPromise = application.detachTab({
      tabId,
      expectedWindowId: "window-1"
    });
    application.markWindowReady("missing-window");
    application.markWindowReady("3");
    await detachPromise;

    scheduler.fire();
    scheduler.fire();
    window.closedListener?.();
    window.loadFailureListener?.();
    application.markWindowReady("3");

    expect(detachTabToWindow).toHaveBeenCalledOnce();
    expect(scheduler.cancel).toHaveBeenCalledOnce();
    expect(window.destroy).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId).windowId).toBe("3");
    expect(workspace.getWindowProjection("3").activeTabId).toBe(tabId);
  });
});
