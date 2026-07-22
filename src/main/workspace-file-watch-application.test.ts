import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceFileWatchApplication } from "./workspace-file-watch-application";

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
  it("serializes one window so a deferred old path cannot replace its newest active path", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabA = workspace.openDocument("window-1", document("a.md")).activeTabId!;
    const tabB = workspace.openDocument("window-1", document("b.md")).activeTabId!;
    workspace.activateTab("window-1", tabA);
    const firstSync = deferred();
    const syncDocumentPath = vi
      .fn<(sender: { id: number }, path: string | null) => Promise<void>>()
      .mockImplementationOnce(() => firstSync.promise)
      .mockResolvedValue(undefined);
    const application = createWorkspaceFileWatchApplication({
      workspace,
      syncDocumentPath
    });
    const sender = { id: 1 };

    const syncA = application.syncWindow({ sender, windowId: "window-1" });
    await vi.waitFor(() =>
      expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/a.md")
    );
    workspace.activateTab("window-1", tabB);
    const syncB = application.syncWindow({ sender, windowId: "window-1" });
    await Promise.resolve();
    expect(syncDocumentPath).toHaveBeenCalledTimes(1);

    firstSync.resolve();
    await Promise.all([syncA, syncB]);

    expect(syncDocumentPath.mock.calls).toEqual([
      [sender, "C:/notes/a.md"],
      [sender, "C:/notes/b.md"]
    ]);
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

  it("continues a window queue after failure and cleans it up", async () => {
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
