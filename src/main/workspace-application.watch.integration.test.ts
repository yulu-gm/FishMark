import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceApplication } from "@fishmark/workspace-application";

import { openTestDocument } from "./workspace.test-helper";

const document = (name: string) => ({
  fileIdentity: fileIdentity(`file:c:/notes/${name.toLowerCase()}`),
  path: `C:/notes/${name}`,
  name,
  content: name,
  encoding: "utf-8" as const
});

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve
  };
}

const documentOperations = {
  runExclusive: async <T>(_key: string, operation: () => Promise<T>) => operation()
};

function createWatchApplication<TContext>(input: {
  readonly workspace: ReturnType<typeof createWorkspaceState>;
  readonly documentOperations: typeof documentOperations;
  readonly watcher: {
    syncWindowPaths(
      context: TContext,
      targetPaths: readonly (string | null)[]
    ): Promise<void>;
  };
}) {
  const { workspace } = input;
  return createWorkspaceApplication({
    ...input,
    open: {
      open: async () => ({ kind: "cancelled" as const }),
      openPath: async () => ({
        kind: "error" as const,
        error: { code: "read-failed" as const, message: "unused" }
      })
    },
    reload: { reloadTab: async () => ({ kind: "revision-stale" as const }) },
    reorder: { reorder: async (command) => workspace.reorderTab(command) },
    transfer: { move: async () => Promise.reject(new Error("unused")) },
    detach: {
      detachTab: async () => Promise.reject(new Error("unused")),
      markWindowReady: async () => undefined
    },
    edits: {
      apply: async (command) => workspace.applyDocumentEdits(command),
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
  });
}

describe("workspace watcher use case", () => {
  it("syncs every open tab path, not only the active tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("a.md"));
    openTestDocument(workspace, "window-1", document("b.md"));
    const syncWindowPaths = vi.fn(async () => undefined);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncWindowPaths }
    });
    const sender = { id: 1 };

    await application.syncWindow({ context: sender, windowId: "window-1" });

    expect(syncWindowPaths).toHaveBeenCalledWith(sender, [
      "C:/notes/a.md",
      "C:/notes/b.md"
    ]);
  });

  it("syncs a pathless tab as null and a missing window as an empty list", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.createUntitledTab("window-1");
    const syncWindowPaths = vi.fn(async () => undefined);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncWindowPaths }
    });
    const sender = { id: 1 };

    await application.syncWindow({ context: sender, windowId: "window-1" });
    await application.syncWindow({ context: sender, windowId: "window-missing" });

    expect(syncWindowPaths.mock.calls).toEqual([
      [sender, [null]],
      [sender, []]
    ]);
  });

  it("propagates a watcher failure", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("a.md"));
    const failure = new Error("stat failed");
    const syncWindowPaths = vi
      .fn<(sender: { id: number }, paths: readonly (string | null)[]) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncWindowPaths }
    });
    const sender = { id: 1 };

    await expect(
      application.syncWindow({ context: sender, windowId: "window-1" })
    ).rejects.toBe(failure);
    await expect(
      application.syncWindow({ context: sender, windowId: "window-1" })
    ).resolves.toBeUndefined();
    expect(syncWindowPaths).toHaveBeenCalledTimes(2);
  });

  it("does not serialize independent windows", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    openTestDocument(workspace, "window-1", document("a.md"));
    openTestDocument(workspace, "window-2", document("b.md"));
    const firstSync = deferred();
    const syncWindowPaths = vi.fn(
      async (_sender: { id: number }, paths: readonly (string | null)[]) => {
        if (paths.includes("C:/notes/a.md")) {
          await firstSync.promise;
        }
      }
    );
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncWindowPaths }
    });

    const syncA = application.syncWindow({
      context: { id: 1 },
      windowId: "window-1"
    });
    await expect(
      application.syncWindow({ context: { id: 2 }, windowId: "window-2" })
    ).resolves.toBeUndefined();
    expect(syncWindowPaths).toHaveBeenCalledWith({ id: 2 }, ["C:/notes/b.md"]);
    firstSync.resolve();
    await syncA;
  });
});
