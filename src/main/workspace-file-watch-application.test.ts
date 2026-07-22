import type { Stats } from "node:fs";

import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceFileWatchApplication } from "./workspace-file-watch-application";
import { createExternalFileWatchService } from "./external-file-watch-service";

const document = (name: string) => ({
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

describe("createWorkspaceFileWatchApplication", () => {
  it("forwards a newer window intent without waiting for an older service I/O", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabA = workspace.openDocument("window-1", document("a.md")).activeTabId!;
    const tabB = workspace.openDocument("window-1", document("b.md")).activeTabId!;
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
    const application = createWorkspaceFileWatchApplication({
      workspace,
      syncDocumentPath
    });
    const sender = { id: 1, send: vi.fn() };

    const syncA = application.syncWindow({ sender, windowId: "window-1" });
    await vi.waitFor(() =>
      expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/a.md")
    );
    workspace.activateTab("window-1", tabB);
    const syncB = application.syncWindow({ sender, windowId: "window-1" });
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
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.createUntitledTab("window-1");
    const syncDocumentPath = vi.fn(async () => undefined);
    const application = createWorkspaceFileWatchApplication({
      workspace,
      syncDocumentPath
    });
    const sender = { id: 1 };

    await application.syncWindow({ sender, windowId: "window-1" });
    await application.syncWindow({ sender, windowId: "window-missing" });

    expect(syncDocumentPath.mock.calls).toEqual([
      [sender, null],
      [sender, null]
    ]);
  });

  it("forwards a later intent after a service failure", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("a.md"));
    const failure = new Error("stat failed");
    const syncDocumentPath = vi
      .fn<(sender: { id: number }, path: string | null) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const application = createWorkspaceFileWatchApplication({
      workspace,
      syncDocumentPath
    });
    const sender = { id: 1 };

    await expect(
      application.syncWindow({ sender, windowId: "window-1" })
    ).rejects.toBe(failure);
    await expect(
      application.syncWindow({ sender, windowId: "window-1" })
    ).resolves.toBeUndefined();
    expect(syncDocumentPath).toHaveBeenCalledTimes(2);
  });

  it("does not serialize independent windows", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.openDocument("window-1", document("a.md"));
    workspace.openDocument("window-2", document("b.md"));
    const firstSync = deferred();
    const syncDocumentPath = vi.fn(
      async (_sender: { id: number }, path: string | null) => {
        if (path === "C:/notes/a.md") {
          await firstSync.promise;
        }
      }
    );
    const application = createWorkspaceFileWatchApplication({
      workspace,
      syncDocumentPath
    });

    const syncA = application.syncWindow({
      sender: { id: 1 },
      windowId: "window-1"
    });
    await expect(
      application.syncWindow({ sender: { id: 2 }, windowId: "window-2" })
    ).resolves.toBeUndefined();
    expect(syncDocumentPath).toHaveBeenCalledWith(
      { id: 2 },
      "C:/notes/b.md"
    );
    firstSync.resolve();
    await syncA;
  });
});
