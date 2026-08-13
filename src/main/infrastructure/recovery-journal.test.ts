import { describe, expect, it } from "vitest";

import { createRecoveryJournal } from "./recovery-journal";

function createFakeFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  return {
    files,
    readFile: async (p: string) => {
      if (!files.has(p)) throw missing;
      return files.get(p)!;
    },
    writeFile: async (p: string, c: string) => {
      files.set(p, c);
    },
    appendFile: async (p: string, c: string) => {
      files.set(p, (files.get(p) ?? "") + c);
    },
    rename: async (from: string, to: string) => {
      const value = files.get(from);
      if (value === undefined) throw missing;
      files.set(to, value);
      files.delete(from);
    },
    unlink: async (p: string) => {
      files.delete(p);
    },
    hashContent: (c: string) => `h(${c})`,
    tempPathFor: (p: string) => `${p}.tmp`,
    isMissingFileError: (e: unknown) =>
      e instanceof Error && "code" in e && e.code === "ENOENT"
  };
}

function createJournal(initial: Record<string, string> = {}) {
  const fs = createFakeFs(initial);
  const journal = createRecoveryJournal({
    journalPath: "/data/journal.jsonl",
    snapshotPath: "/data/snapshot.json",
    ...fs
  });
  return { journal, fs };
}

describe("createRecoveryJournal", () => {
  it("reports empty when neither journal nor snapshot exists", async () => {
    const { journal } = createJournal();
    await expect(journal.load()).resolves.toEqual({ kind: "empty" });
  });

  it("appends entries and reloads them in order", async () => {
    const { journal } = createJournal();
    await journal.appendEntry({ kind: "edit-batch", tabId: "tab-1", revision: 1 });
    await journal.appendEntry({ kind: "edit-batch", tabId: "tab-2", revision: 2 });

    await expect(journal.load()).resolves.toEqual({
      kind: "loaded",
      snapshot: null,
      entries: [
        { kind: "edit-batch", tabId: "tab-1", revision: 1 },
        { kind: "edit-batch", tabId: "tab-2", revision: 2 }
      ]
    });
  });

  it("writes a checksummed snapshot atomically and reloads it", async () => {
    const { journal, fs } = createJournal();
    await journal.writeSnapshot({ sessions: [{ tabId: "tab-1", content: "hello" }] });

    // The temp file must not remain after the atomic replace.
    expect(fs.files.has("/data/snapshot.json.tmp")).toBe(false);
    await expect(journal.load()).resolves.toEqual({
      kind: "loaded",
      snapshot: { sessions: [{ tabId: "tab-1", content: "hello" }] },
      entries: []
    });
  });

  it("quarantines a snapshot whose checksum does not match", async () => {
    const serialized = JSON.stringify({ sessions: [{ tabId: "tab-1" }] });
    const { journal } = createJournal({
      "/data/snapshot.json": JSON.stringify({ checksum: "wrong", snapshot: serialized })
    });
    await expect(journal.load()).resolves.toEqual({
      kind: "corrupt",
      path: "/data/snapshot.json"
    });
  });

  it("quarantines a journal with a malformed entry line", async () => {
    const { journal } = createJournal({
      "/data/journal.jsonl": '{"kind":"edit-batch"}\nnot-json\n'
    });
    await expect(journal.load()).resolves.toEqual({
      kind: "corrupt",
      path: "/data/journal.jsonl"
    });
  });

  it("truncates the journal so entries are discarded", async () => {
    const { journal } = createJournal();
    await journal.appendEntry({ kind: "edit-batch", tabId: "tab-1" });
    await journal.truncateJournal();
    await expect(journal.load()).resolves.toEqual({ kind: "empty" });
  });

  it("reports empty after truncating a missing journal", async () => {
    const { journal } = createJournal();
    await journal.truncateJournal();
    await expect(journal.load()).resolves.toEqual({ kind: "empty" });
  });
});
