import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceTabReorderApplication } from "./workspace-tab-reorder-application";
import { createWorkspaceTabTransferApplication } from "./workspace-tab-transfer-application";
import { createWorkspaceWindowCloseApplication } from "./workspace-window-close-application";

function createFixture() {
  const workspace = createWorkspaceState();
  const documentOperations = createKeyedOperationCoordinator();
  workspace.registerWindow("window-1");
  const firstTabId = workspace.createUntitledTab("window-1").activeTabId!;
  const secondTabId = workspace.createUntitledTab("window-1").activeTabId!;
  workspace.registerWindow("window-2");
  const application = createWorkspaceTabReorderApplication({
    workspace,
    documentOperations
  });
  const transfer = createWorkspaceTabTransferApplication({
    workspace,
    documentOperations
  });

  return {
    application,
    documentOperations,
    firstTabId,
    secondTabId,
    transfer,
    workspace
  };
}

describe("createWorkspaceTabReorderApplication", () => {
  it("holds reorder inside the shared document lease", async () => {
    const fixture = createFixture();
    const lease = await fixture.documentOperations.acquireExclusive([
      fixture.firstTabId
    ]);
    let settled = false;
    const reorder = fixture.application.reorder({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      targetIndex: 1
    }).then((projection) => {
      settled = true;
      return projection;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(fixture.workspace.getWindowTabIds("window-1")).toEqual([
      fixture.firstTabId,
      fixture.secondTabId
    ]);

    lease.release();
    await expect(reorder).resolves.toMatchObject({
      windowId: "window-1",
      tabs: [{ tabId: fixture.secondTabId }, { tabId: fixture.firstTabId }]
    });
  });

  it.each(["move", "detach"] as const)(
    "rejects a queued old-owner reorder after %s wins the shared lease",
    async (kind) => {
      const fixture = createFixture();
      const lease = await fixture.documentOperations.acquireExclusive([
        fixture.firstTabId
      ]);
      const transfer = fixture.transfer[kind]({
        tabId: fixture.firstTabId,
        expectedWindowId: "window-1",
        targetWindowId: "window-2"
      });
      const reorder = fixture.application.reorder({
        tabId: fixture.firstTabId,
        expectedWindowId: "window-1",
        targetIndex: 1
      });

      lease.release();
      await transfer;
      await expect(reorder).rejects.toThrow(
        "Workspace tab reorder rejected: tab owner changed."
      );
      expect(fixture.workspace.getWindowTabIds("window-2")).toEqual([
        fixture.firstTabId
      ]);
      expect(fixture.workspace.getWindowTabIds("window-1")).toEqual([
        fixture.secondTabId
      ]);
    }
  );

  it("waits behind native window close and fails closed after unregister", async () => {
    const fixture = createFixture();
    let resolveConfirmation!: (value: {
      readonly windowId: string;
      readonly checkpoints: readonly {
        readonly tabId: string;
        readonly expectedWindowId: string;
        readonly expectedRevision: number;
      }[];
    }) => void;
    const requestConfirmation = vi.fn(
      () =>
        new Promise<{
          readonly windowId: string;
          readonly checkpoints: readonly {
            readonly tabId: string;
            readonly expectedWindowId: string;
            readonly expectedRevision: number;
          }[];
        }>((resolve) => {
          resolveConfirmation = resolve;
        })
    );
    const closeApplication = createWorkspaceWindowCloseApplication({
      workspace: fixture.workspace,
      documentOperations: fixture.documentOperations,
      requestWorkspaceWindowClose: requestConfirmation
    });
    const close = closeApplication.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(requestConfirmation).toHaveBeenCalledOnce());
    const reorderMutation = vi.spyOn(fixture.workspace, "reorderTab");
    const reorder = fixture.application.reorder({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      targetIndex: 1
    });
    await Promise.resolve();

    expect(reorderMutation).not.toHaveBeenCalled();
    resolveConfirmation({
      windowId: "window-1",
      checkpoints: [fixture.firstTabId, fixture.secondTabId].map((tabId) => ({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 0
      }))
    });
    const heldClose = await close;
    expect(heldClose).not.toBeNull();
    expect(reorderMutation).not.toHaveBeenCalled();

    fixture.workspace.unregisterWindow("window-1");
    heldClose!.release();
    await expect(reorder).rejects.toThrow(
      "Workspace tab reorder rejected: owner window no longer exists."
    );
    expect(reorderMutation).toHaveBeenCalledOnce();
  });
});
