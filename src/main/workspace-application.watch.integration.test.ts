import type { Stats } from "node:fs";

import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceApplication } from "@fishmark/workspace-application";

import { createExternalFileWatchService } from "./external-file-watch-service";
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

const documentOperations = { runExclusive: async <T>(_key: string, operation: () => Promise<T>) => operation() };

function createWatchApplication<TContext>(input: {
  readonly workspace: ReturnType<typeof createWorkspaceState>;
  readonly documentOperations: typeof documentOperations;
  readonly watcher: {
    syncDocumentPath(context: TContext, targetPath: string | null): Promise<void>;
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
    drafts: { update: (command) => workspace.updateTabDraft(command) },
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
  it("forwards a newer window intent without waiting for an older service I/O", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabA = openTestDocument(workspace, "window-1", document("a.md")).activeTabId!;
    const tabB = openTestDocument(workspace, "window-1", document("b.md")).activeTabId!;
    workspace.activateTab("window-1", tabA);
    const firstSnapshot = deferred();
    const stat = vi.fn((targetPath: string): Promise<Stats> =>
      targetPath.endsWith("a.md")
        ? firstSnapshot.promise.then(
            () => ({ mtimeMs: 1, size: 10 }) as Stats
          )
        : Promise.resolve({ mtimeMs: 2, size: 20 } as Stats)
    );
    const watch = vi.fn(() => ({ close: vi.fn() }));
    const service = createExternalFileWatchService({ watch, stat });
    const syncDocumentPath = vi.fn(service.syncDocumentPath);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncDocumentPath }
    });
    const sender = { id: 1, send: vi.fn() };

    const syncA = application.syncWindow({ context: sender, windowId: "window-1" });
    await vi.waitFor(() =>
      expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/a.md")
    );
    workspace.activateTab("window-1", tabB);
    const syncB = application.syncWindow({ context: sender, windowId: "window-1" });
    await expect(syncB).resolves.toBeUndefined();
    await expect(
      service.beginInternalWrite(sender, "C:/notes/b.md")
    ).resolves.toBeUndefined();
    expect(stat).toHaveBeenCalledWith("C:/notes/b.md");
    expect(watch).toHaveBeenCalledWith("C:/notes/b.md", expect.any(Function));

    expect(syncDocumentPath.mock.calls).toEqual([
      [sender, "C:/notes/a.md"],
      [sender, "C:/notes/b.md"]
    ]);
    firstSnapshot.resolve();
    await syncA;
  });

  it("syncs missing windows and pathless active documents to null", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.createUntitledTab("window-1");
    const syncDocumentPath = vi.fn(async () => undefined);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncDocumentPath }
    });
    const sender = { id: 1 };

    await application.syncWindow({ context: sender, windowId: "window-1" });
    await application.syncWindow({ context: sender, windowId: "window-missing" });

    expect(syncDocumentPath.mock.calls).toEqual([
      [sender, null],
      [sender, null]
    ]);
  });

  it("forwards a later intent after a service failure", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("a.md"));
    const failure = new Error("stat failed");
    const syncDocumentPath = vi
      .fn<(sender: { id: number }, path: string | null) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncDocumentPath }
    });
    const sender = { id: 1 };

    await expect(
      application.syncWindow({ context: sender, windowId: "window-1" })
    ).rejects.toBe(failure);
    await expect(
      application.syncWindow({ context: sender, windowId: "window-1" })
    ).resolves.toBeUndefined();
    expect(syncDocumentPath).toHaveBeenCalledTimes(2);
  });

  it("does not serialize independent windows", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    openTestDocument(workspace, "window-1", document("a.md"));
    openTestDocument(workspace, "window-2", document("b.md"));
    const firstSync = deferred();
    const syncDocumentPath = vi.fn(
      async (_sender: { id: number }, path: string | null) => {
        if (path === "C:/notes/a.md") {
          await firstSync.promise;
        }
      }
    );
    const application = createWatchApplication({
      workspace,
      documentOperations,
      watcher: { syncDocumentPath }
    });

    const syncA = application.syncWindow({
      context: { id: 1 },
      windowId: "window-1"
    });
    await expect(
      application.syncWindow({ context: { id: 2 }, windowId: "window-2" })
    ).resolves.toBeUndefined();
    expect(syncDocumentPath).toHaveBeenCalledWith(
      { id: 2 },
      "C:/notes/b.md"
    );
    firstSync.resolve();
    await syncA;
  });
});
