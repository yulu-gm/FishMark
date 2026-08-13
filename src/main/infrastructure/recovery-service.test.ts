import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fileIdentity, type WorkspaceSnapshot } from "@fishmark/workspace-domain";
import { afterEach, describe, expect, it } from "vitest";

import { createRecoveryService } from "./recovery-service";

const snapshot: WorkspaceSnapshot = {
  windows: [{ windowId: "window-1", tabIds: ["tab-1"], activeTabId: "tab-1" }],
  sessions: [
    {
      tabId: "tab-1",
      windowId: "window-1",
      fileIdentity: fileIdentity("file:a.md"),
      path: "C:/notes/a.md",
      name: "a.md",
      content: "dirty",
      savedContent: "saved",
      encoding: "utf-8" as const,
      revision: 1,
      savedRevision: 0,
      saveState: "idle" as const,
      diskVersion: null
    }
  ],
  lastFocusedWindowId: "window-1",
  nextTabId: 2
};

const editBatch = {
  kind: "edit-batch" as const,
  tabId: "tab-1",
  clientId: "client-1",
  clientSequence: 1,
  baseRevision: 0,
  changes: [{ from: 0, to: 0, insert: "hello" }]
};

const directories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "fishmark-recovery-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("createRecoveryService", () => {
  it("round-trips a recorded edit batch through loadRecovery", async () => {
    const directory = await createDirectory();
    const service = createRecoveryService(directory);

    await service.recordEditBatch(editBatch);
    await expect(service.loadRecovery()).resolves.toEqual({
      kind: "recovery-available",
      snapshot: null,
      editBatches: [editBatch]
    });
  });

  it("round-trips a compacted snapshot through loadRecovery", async () => {
    const directory = await createDirectory();
    const service = createRecoveryService(directory);

    await service.recordEditBatch(editBatch);
    await service.compact(snapshot);
    await expect(service.loadRecovery()).resolves.toEqual({
      kind: "recovery-available",
      snapshot,
      editBatches: []
    });
  });

  it("reports no recovery needed after clean shutdown", async () => {
    const directory = await createDirectory();
    const service = createRecoveryService(directory);

    await service.recordEditBatch(editBatch);
    await service.markCleanShutdown();
    await expect(service.loadRecovery()).resolves.toEqual({
      kind: "no-recovery-needed"
    });
  });
});
