import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";
import { createWorkspaceTabTransfer } from "@fishmark/workspace-application";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

describe("workspace tab transfer use case", () => {
  it.each(["move", "detach"] as const)(
    "runs %s owner transfer inside the tab document lease",
    async (kind) => {
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
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
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
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

  it.each(["move", "detach"] as const)("rejects %s when the staged revision changes while waiting for the lease", async (kind) => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("source");
    const tabId = workspace.createUntitledTab("source").activeTabId!;
    workspace.registerWindow("target");
    const targetTabId = workspace.createUntitledTab("target").activeTabId!;
    const documentOperations = createKeyedOperationCoordinator<string>();
    const application = createWorkspaceTabTransfer({ workspace, documentOperations });
    const lease = await documentOperations.acquireExclusive([tabId]);
    const transfer = application[kind]({ tabId, expectedWindowId: "source", targetWindowId: "target", expectedRevision: 0 });
    const rejected = expect(transfer).rejects.toThrow("The document changed before its transfer could be committed.");
    workspace.updateTabDraft({ tabId, expectedWindowId: "source", content: "new unsaved text after receipt" });
    lease.release();
    await rejected;
    expect(workspace.getTabSession(tabId)).toMatchObject({ windowId: "source", content: "new unsaved text after receipt", revision: 1, isDirty: true });
    expect(workspace.getWindowProjection("target").tabs.map(tab => tab.tabId)).toEqual([targetTabId]);
  });

  it("commits a matching staged revision and keeps its dirty text", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("source");
    const tabId = workspace.createUntitledTab("source").activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "source", content: "received dirty text" });
    workspace.registerWindow("target");
    const application = createWorkspaceTabTransfer({ workspace, documentOperations: createKeyedOperationCoordinator() });
    await application.move({ tabId, expectedWindowId: "source", targetWindowId: "target", expectedRevision: 1 });
    expect(workspace.getTabSession(tabId)).toMatchObject({ windowId: "target", content: "received dirty text", revision: 1, savedRevision: 0, isDirty: true });
  });
});
