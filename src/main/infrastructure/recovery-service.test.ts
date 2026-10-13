import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
      diskVersion: null,
      externalChange: null
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
  it.each(["not-json\n", '{"interrupted":', '{"invalid":true}\n'])("preserves the original raw pair once before replacing damaged recovery: %s", async (tail) => {
    const directory = await createDirectory();
    const seed = createRecoveryService(directory);
    await seed.compact(snapshot);
    await seed.recordEditBatch(editBatch);
    await appendFile(path.join(directory, "recovery-journal.jsonl"), tail);
    const originalSnapshot = await readFile(path.join(directory, "recovery-snapshot.json"));
    const originalJournal = await readFile(path.join(directory, "recovery-journal.jsonl"));
    const service = createRecoveryService(directory);
    await expect(service.loadRecovery()).resolves.toMatchObject({ kind: "recovery-available", snapshot, editBatches: [editBatch] });
    await service.compact(snapshot);
    const preserved = await service.preserveRecovery();
    expect(await readFile(path.join(preserved, "recovery-snapshot.json"))).toEqual(originalSnapshot);
    expect(await readFile(path.join(preserved, "recovery-journal.jsonl"))).toEqual(originalJournal);
    await service.recordEditBatch(editBatch);
    await service.markCleanShutdown();
    expect(await service.preserveRecovery()).toBe(preserved);
    expect(await readdir(path.join(directory, "recovery-preserved"))).toHaveLength(1);
  });

  it("preserves a corrupt snapshot and its journal before a fresh workspace can overwrite them", async () => {
    const directory = await createDirectory();
    const snapshotPath = path.join(directory, "recovery-snapshot.json");
    const journalPath = path.join(directory, "recovery-journal.jsonl");
    await writeFile(snapshotPath, Buffer.from([0xff, 0xfe, 0x7b]));
    await writeFile(journalPath, JSON.stringify(editBatch) + "\n");
    const service = createRecoveryService(directory);
    await expect(service.loadRecovery()).resolves.toEqual({ kind: "corrupt", path: snapshotPath });
    await service.compact(snapshot);
    const preserved = await service.preserveRecovery();
    expect(await readFile(path.join(preserved, "recovery-snapshot.json"))).toEqual(Buffer.from([0xff, 0xfe, 0x7b]));
    expect(await readFile(path.join(preserved, "recovery-journal.jsonl"), "utf8")).toBe(JSON.stringify(editBatch) + "\n");
  });

  it("blocks compaction, append, and truncation when raw preservation cannot be completed", async () => {
    const directory = await createDirectory();
    const seed = createRecoveryService(directory);
    await seed.compact(snapshot);
    await seed.recordEditBatch(editBatch);
    await appendFile(path.join(directory, "recovery-journal.jsonl"), "not-json\n");
    const originalSnapshot = await readFile(path.join(directory, "recovery-snapshot.json"));
    const originalJournal = await readFile(path.join(directory, "recovery-journal.jsonl"));
    await writeFile(path.join(directory, "recovery-preserved"), "blocked");
    const service = createRecoveryService(directory);
    await service.loadRecovery();
    await expect(service.compact(snapshot)).rejects.toThrow();
    await expect(service.recordEditBatch(editBatch)).rejects.toThrow();
    await expect(service.markCleanShutdown()).rejects.toThrow();
    expect(await readFile(path.join(directory, "recovery-snapshot.json"))).toEqual(originalSnapshot);
    expect(await readFile(path.join(directory, "recovery-journal.jsonl"))).toEqual(originalJournal);
  });

  it("explicitly records missing original files in the preservation manifest", async () => {
    const directory = await createDirectory();
    await writeFile(path.join(directory, "recovery-journal.jsonl"), "not-json\n");
    const service = createRecoveryService(directory);
    await service.loadRecovery();
    const preserved = await service.preserveRecovery();
    const manifest = JSON.parse(await readFile(path.join(preserved, "manifest.json"), "utf8")) as { files: { name: string; missing: boolean }[] };
    expect(manifest.files).toEqual([
      expect.objectContaining({ name: "recovery-snapshot.json", missing: true }),
      expect.objectContaining({ name: "recovery-journal.jsonl", missing: false })
    ]);
  });

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
