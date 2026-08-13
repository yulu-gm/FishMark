import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceApplication } from "./index";

function workflowDependencies(workspace: ReturnType<typeof createWorkspaceState>) {
  return {
    open: {
      open: async () => ({ kind: "cancelled" as const }),
      openPath: async () => ({
        kind: "error" as const,
        error: { code: "read-failed" as const, message: "unconfigured test open" }
      })
    },
    reload: {
      reloadTab: async () => ({ kind: "revision-stale" as const })
    },
    reorder: {
      reorder: async (input: Parameters<typeof workspace.reorderTab>[0]) =>
        workspace.reorderTab(input)
    },
    transfer: {
      move: async (input: Parameters<typeof workspace.moveTabToWindow>[0] & {
        readonly expectedWindowId: string;
      }) => workspace.moveTabToWindow(input)
    },
    detach: {
      detachTab: async () => Promise.reject(new Error("unconfigured test detach")),
      markWindowReady: async () => undefined
    },
    drafts: {
      update: (input: Parameters<typeof workspace.updateTabDraft>[0]) =>
        workspace.updateTabDraft(input)
    },
    edits: {
      apply: async (input: Parameters<typeof workspace.applyDocumentEdits>[0]) =>
        workspace.applyDocumentEdits(input),
      flush: async () => ({
        kind: "error" as const,
        error: { code: "unknown-tab" as const, message: "Unknown document tab." }
      })
    },
    save: {
      save: async () => ({ status: "cancelled" as const }),
      saveAs: async () => ({ status: "cancelled" as const })
    },
    close: {
      closeTab: async () => ({
        status: "cancelled" as const,
        snapshot: workspace.getWindowProjection("window-1")
      }),
      closeOwnedTab: async () => ({
        status: "cancelled" as const,
        snapshot: workspace.getWindowProjection("window-1")
      }),
      confirmWindowClose: async () => ({ status: "cancelled" as const })
    }
  };
}

describe("createWorkspaceApplication", () => {
  it("commits a tab mutation before synchronizing its resulting watch target", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const events: string[] = [];
    const syncWindowPaths = vi.fn(async () => {
      expect(workspace.getWindowProjection("window-1").tabs).toHaveLength(1);
      events.push("watch");
    });
    const application = createWorkspaceApplication({
      ...workflowDependencies(workspace),
      workspace: {
        activateTab: (windowId, tabId) => workspace.activateTab(windowId, tabId),
        createUntitledTab: (windowId) => {
          events.push("mutate");
          return workspace.createUntitledTab(windowId);
        },
        getTabSession: (tabId) => workspace.getTabSession(tabId),
        getWindowProjection: (windowId) => workspace.getWindowProjection(windowId),
        getWindowProjectionOrNull: (windowId) =>
          workspace.getWindowProjectionOrNull(windowId)
      },
      documentOperations: {
        runExclusive: async (_key, operation) => operation()
      },
      watcher: { syncWindowPaths }
    });

    const created = await application.createTab({
      context: { id: 1 },
      windowId: "window-1",
      kind: "untitled"
    });

    expect(created).toMatchObject({
      kind: "success",
      projection: { windowId: "window-1" }
    });
    expect(events).toEqual(["mutate", "watch"]);
  });

  it("reports a committed mutation and its latest projection when watcher sync fails", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const application = createWorkspaceApplication({
      ...workflowDependencies(workspace),
      workspace,
      documentOperations: {
        runExclusive: async (_key, operation) => operation()
      },
      watcher: {
        syncWindowPaths: vi.fn(async () => {
          throw new Error("watch unavailable");
        })
      }
    });

    const result = await application.createTab({
      context: { id: 1 },
      windowId: "window-1",
      kind: "untitled"
    });

    expect(result).toMatchObject({
      kind: "watch-error",
      committed: true,
      projection: {
        windowId: "window-1",
        tabs: [{ name: "Untitled.md" }]
      },
      error: {
        code: "watch-sync-failed",
        message: "watch unavailable"
      }
    });
  });

  it("reports snapshot watch failure as uncommitted", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const application = createWorkspaceApplication({
      ...workflowDependencies(workspace),
      workspace,
      documentOperations: {
        runExclusive: async (_key, operation) => operation()
      },
      watcher: {
        syncWindowPaths: async () => Promise.reject(new Error("watch unavailable"))
      }
    });

    await expect(application.getSnapshot({
      context: { id: 1 },
      windowId: "window-1"
    })).resolves.toMatchObject({
      kind: "watch-error",
      committed: false,
      projection: { windowId: "window-1" }
    });
  });

  it("orders delegated mutation workflows before watcher synchronization", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const projection = workspace.getWindowProjection("window-1");
    const moveProjection = {
      sourceWindowSnapshot: projection,
      targetWindowSnapshot: projection
    };
    const events: string[] = [];
    const base = workflowDependencies(workspace);
    const application = createWorkspaceApplication({
      ...base,
      workspace,
      documentOperations: {
        runExclusive: async (_key, operation) => operation()
      },
      watcher: {
        syncWindowPaths: async () => {
          events.push("watch");
        }
      },
      open: {
        ...base.open,
        open: async () => {
          events.push("open");
          return { kind: "success" as const, projection };
        }
      },
      reload: {
        reloadTab: async () => {
          events.push("reload");
          return { kind: "success" as const, projection };
        }
      },
      reorder: {
        reorder: async () => {
          events.push("reorder");
          return { kind: "applied" as const, projection };
        }
      },
      detach: {
        detachTab: async () => {
          events.push("detach");
          return moveProjection;
        },
        markWindowReady: async () => undefined
      },
      close: {
        ...base.close,
        closeOwnedTab: async () => {
          events.push("close");
          return { status: "closed" as const, snapshot: projection };
        }
      }
    });

    await application.open({ context: undefined, windowId: "window-1" });
    await application.reloadTab({
      context: undefined,
      tabId: "tab-1",
      expectedWindowId: "window-1"
    });
    await application.reorderTab({
      context: undefined,
      tabId: "tab-1",
      expectedWindowId: "window-1",
      targetIndex: 0
    });
    await application.detachTab({
      context: undefined,
      tabId: "tab-1",
      expectedWindowId: "window-1"
    });
    await application.closeTab({
      context: undefined,
      tabId: "tab-1",
      expectedWindowId: "window-1"
    });

    expect(events).toEqual([
      "open", "watch",
      "reload", "watch",
      "reorder", "watch",
      "detach", "watch",
      "close", "watch"
    ]);
  });
});
