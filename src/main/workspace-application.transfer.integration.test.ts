import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";
import { createWorkspaceTabTransfer } from "@fishmark/workspace-application";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

describe("workspace tab transfer use case", () => {
  it.each(["move", "detach"] as const)(
    "runs %s owner transfer inside the tab document lease",
    async (kind) => {
      const workspace = createWorkspaceState();
      const documentOperations = createKeyedOperationCoordinator();
      workspace.registerWindow("window-1");
      const tabId = workspace.createUntitledTab("window-1").activeTabId!;
      workspace.registerWindow("window-2");
      const application = createWorkspaceTabTransfer({
        workspace,
        documentOperations
      });
      const lease = await documentOperations.acquireExclusive([tabId]);

      const transfer = application[kind]({
        tabId,
        expectedWindowId: "window-1",
        targetWindowId: "window-2"
      });
      await Promise.resolve();

      expect(workspace.getTabSession(tabId).windowId).toBe("window-1");
      lease.release();
      await expect(transfer).resolves.toMatchObject({
        sourceWindowSnapshot: { windowId: "window-1" },
        targetWindowSnapshot: { windowId: "window-2", activeTabId: tabId }
      });
      expect(workspace.getTabSession(tabId).windowId).toBe("window-2");
    }
  );

  it("rejects a stale source owner inside the lease before transfer", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    const application = createWorkspaceTabTransfer({
      workspace,
      documentOperations
    });

    await expect(
      application.move({
        tabId,
        expectedWindowId: "window-1",
        targetWindowId: "window-2"
      })
    ).rejects.toThrow(
      `Workspace tab '${tabId}' does not belong to window 'window-1'.`
    );
    expect(workspace.getTabSession(tabId).windowId).toBe("window-2");
  });
});
