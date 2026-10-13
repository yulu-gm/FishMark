import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";

import { createDocumentRepository } from "./document-repository";
import { createRecoveryService } from "./recovery-service";
import { parseEditBatchEntry, parseWorkspaceSnapshot } from "./workspace-persistence";

function validSnapshot() {
  return {
    windows: [
      { windowId: "window-1", tabIds: ["tab-1"], activeTabId: "tab-1" }
    ],
    sessions: [
      {
        tabId: "tab-1",
        windowId: "window-1",
        fileIdentity: { location: "file:a.md", object: "file:a.md" },
        path: "C:/notes/a.md",
        name: "a.md",
        content: "dirty",
        savedContent: "saved",
        encoding: "utf-8",
        revision: 2,
        savedRevision: 1,
        saveState: "idle",
        diskVersion: null,
        externalChange: null
      }
    ],
    lastFocusedWindowId: "window-1",
    nextTabId: 2
  };
}

function snapshotWithDiskVersion(mtimeMs: unknown, size: unknown = 21) {
  const snapshot = validSnapshot();
  (snapshot.sessions[0] as Record<string, unknown>).diskVersion = {
    normalizedPath: "C:/notes/a.md", mtimeMs, size, contentHash: "saved-content-hash"
  };
  return snapshot;
}

async function removeOwnedDirectory(directory: string, temporaryRoot: string): Promise<void> {
  const target = await realpath(directory);
  if (path.dirname(target) !== temporaryRoot || !path.basename(target).startsWith("fishmark-recovery-metadata-") || target !== path.resolve(directory)) {
    throw new Error(`Refusing cleanup outside the owned temporary directory: ${target}`);
  }
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

describe("parseWorkspaceSnapshot", () => {
  it("accepts a valid snapshot", () => {
    expect(parseWorkspaceSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it("rejects a snapshot with a malformed session", () => {
    const snapshot = validSnapshot();
    (snapshot.sessions[0] as Record<string, unknown>).revision = "two";
    expect(parseWorkspaceSnapshot(snapshot)).toBeNull();
  });

  it("rejects a snapshot with an invalid saveState", () => {
    const snapshot = validSnapshot();
    (snapshot.sessions[0] as Record<string, unknown>).saveState = "bogus";
    expect(parseWorkspaceSnapshot(snapshot)).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseWorkspaceSnapshot(null)).toBeNull();
    expect(parseWorkspaceSnapshot([])).toBeNull();
  });

  it.each([1700000000125.75, -1700000000125.75, 0])("preserves finite filesystem timestamp %s without rounding", (mtimeMs) => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", {
      fileIdentity: fileIdentity("file:a.md"), path: "C:/notes/a.md", name: "a.md", content: "saved", encoding: "utf-8"
    }, { normalizedPath: "C:/notes/a.md", mtimeMs, size: 5, contentHash: "saved-content-hash" });
    const exported = workspace.exportSnapshot();
    const serialized = JSON.parse(JSON.stringify(exported));
    expect(parseWorkspaceSnapshot(serialized)).toEqual(exported);
    expect(parseWorkspaceSnapshot(serialized)?.sessions[0]?.diskVersion?.mtimeMs).toBe(mtimeMs);
  });

  it.each([
    ["string", "1700000000125.75"], ["null", null], ["missing", undefined],
    ["NaN", NaN], ["positive infinity", Infinity], ["negative infinity", -Infinity]
  ])("rejects %s filesystem timestamps", (_label, mtimeMs) => {
    expect(parseWorkspaceSnapshot(snapshotWithDiskVersion(mtimeMs))).toBeNull();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("still rejects invalid integer byte size %s with fractional timestamps", (size) => {
    expect(parseWorkspaceSnapshot(snapshotWithDiskVersion(1700000000125.75, size))).toBeNull();
  });

  it("round-trips real repository metadata through exported JSON and a fresh recovery service", async () => {
    const temporaryRoot = await realpath(tmpdir());
    const directory = await mkdtemp(path.join(temporaryRoot, "fishmark-recovery-metadata-"));
    try {
      const documentPath = path.join(directory, "notes.md");
      const content = "Real filesystem metadata 原文";
      await writeFile(documentPath, content, "utf8");
      const diskVersion = await createDocumentRepository().readDiskVersion(documentPath);
      expect(diskVersion).not.toBeNull();
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      workspace.registerWindow("window-1");
      workspace.openDocument("window-1", {
        fileIdentity: fileIdentity(`file:${documentPath}`), path: documentPath, name: "notes.md", content, encoding: "utf-8"
      }, diskVersion);
      const exported = workspace.exportSnapshot();
      const serialized = JSON.parse(JSON.stringify(exported));
      const parsed = parseWorkspaceSnapshot(serialized);
      expect(parsed).toEqual(exported);
      if (parsed === null) throw new Error("The real exported snapshot was rejected.");
      const restored = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      restored.restoreSnapshot(parsed);
      expect(restored.getWindowProjection("window-1")).toEqual(workspace.getWindowProjection("window-1"));
      await createRecoveryService(directory).compact(exported);
      await expect(createRecoveryService(directory).loadRecovery()).resolves.toEqual({
        kind: "recovery-available", snapshot: exported, editBatches: []
      });
      expect(await readFile(documentPath, "utf8")).toBe(content);
    } finally {
      await removeOwnedDirectory(directory, temporaryRoot);
    }
  });
});

describe("parseEditBatchEntry", () => {
  it("accepts a valid edit batch", () => {
    const entry = {
      kind: "edit-batch",
      tabId: "tab-1",
      clientId: "client-1",
      clientSequence: 3,
      baseRevision: 2,
      changes: [{ from: 0, to: 1, insert: "hello" }]
    };
    expect(parseEditBatchEntry(entry)).toEqual(entry);
  });

  it("rejects an entry with a negative sequence", () => {
    const entry = {
      kind: "edit-batch",
      tabId: "tab-1",
      clientId: "client-1",
      clientSequence: -1,
      baseRevision: 2,
      changes: []
    };
    expect(parseEditBatchEntry(entry)).toBeNull();
  });

  it("rejects an entry with a malformed change", () => {
    const entry = {
      kind: "edit-batch",
      tabId: "tab-1",
      clientId: "client-1",
      clientSequence: 3,
      baseRevision: 2,
      changes: [{ from: "zero", to: 1, insert: "x" }]
    };
    expect(parseEditBatchEntry(entry)).toBeNull();
  });

  it("rejects an entry with the wrong kind", () => {
    const entry = { kind: "snapshot", tabId: "tab-1" };
    expect(parseEditBatchEntry(entry)).toBeNull();
  });
});
