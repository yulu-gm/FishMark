import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createCloseWorkspace, type KeyedOperationLease } from "./index";

describe("createCloseWorkspace", () => {
  it("preserves the typed save error when confirming a window close", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const lease = { release: vi.fn() } as unknown as KeyedOperationLease<string>;
    const closeWorkspace = createCloseWorkspace({
      workspace,
      documentOperations: {
        runExclusiveWithLease: async (_key, operation) => operation(lease),
        acquireExclusive: async () => lease
      },
      chooseDirtyTab: async () => "save",
      saveDocument: {
        saveWithHeldTabLease: vi.fn(),
        saveAsWithHeldTabLease: vi.fn().mockResolvedValue({
          status: "error",
          error: {
            code: "file-identity-changed",
            message: "The selected file changed while preparing to save. Please try again."
          }
        })
      }
    });

    await expect(closeWorkspace.confirmWindowClose({
      windowId: "window-1",
      isActive: () => true
    })).resolves.toEqual({
      status: "error",
      error: {
        code: "file-identity-changed",
        message: "The selected file changed while preparing to save. Please try again."
      }
    });
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("keeps a dirty tab open when the user cancels", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const lease = { release: vi.fn() } as unknown as KeyedOperationLease<string>;
    const closeWorkspace = createCloseWorkspace({
      workspace,
      documentOperations: {
        runExclusiveWithLease: async (_key, operation) => operation(lease),
        acquireExclusive: async () => lease
      },
      chooseDirtyTab: async () => "cancel",
      saveDocument: {
        saveWithHeldTabLease: vi.fn(),
        saveAsWithHeldTabLease: vi.fn()
      }
    });

    const result = await closeWorkspace.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: workspace.getTabSession(tabId).revision
    });

    expect(result.status).toBe("cancelled");
    expect(workspace.getTabSession(tabId).content).toBe("dirty");
  });
});
