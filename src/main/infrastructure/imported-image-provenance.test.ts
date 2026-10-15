import { mkdtemp, realpath, rm, rename, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { createRecoverableDocumentEdits } from "@fishmark/workspace-application";
import { afterEach, expect, it } from "vitest";
import { parseImportedImageProvenance, type ImportedImageRecord } from "./imported-image-provenance";
import { createRecoveryService } from "./recovery-service";
import { filePathIdentity } from "../file-path";
import { restoreWorkspaceRecovery } from "../restore-workspace-recovery";

const directories: string[] = [];
afterEach(async () => {
  const parent = await realpath(tmpdir());
  for (const directory of directories.splice(0)) {
    if (path.dirname(await realpath(directory)) !== parent || !path.basename(directory).startsWith("fishmark-provenance-unit-")) throw new Error("Unsafe cleanup.");
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture() {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), "fishmark-provenance-unit-")); directories.push(directory);
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer }); workspace.registerWindow("1");
  const tabId = workspace.createUntitledTab("1").activeTabId!;
  const image = path.join(directory, "image.png");
  const record: ImportedImageRecord = { path: image, identity: fileIdentity(`path:${filePathIdentity(image, process.platform)}`, "inode:1:123"), tabId, documentPaths: [] };
  const savedPath = path.join(directory, "saved.md");
  const save = (targetTab = tabId, target = savedPath) => workspace.saveTabDocument({ tabId: targetTab, expectedWindowId: "1", capturedRevision: 0,
    document: { path: target, fileIdentity: fileIdentity(`path:${filePathIdentity(target, process.platform)}`, "inode:1:456"), name: "saved.md", content: "", encoding: "utf-8" }, diskVersion: null });
  return { directory, workspace, tabId, record, savedPath, save };
}
it("accepts old snapshots without metadata and rejects a whole malformed list, fallback identities and dot paths", async () => {
  const f = await fixture(); const snapshot = f.workspace.exportSnapshot();
  expect(parseImportedImageProvenance(undefined, snapshot)?.records).toEqual([]);
  expect(parseImportedImageProvenance({ version: 1, records: [f.record] }, snapshot)?.records).toEqual([f.record]);
  for (const invalid of [{ ...f.record, identity: { ...f.record.identity, object: "object:path" } },
    { ...f.record, identity: { ...f.record.identity, object: "inode:1:0" } },
    { ...f.record, path: path.join(f.directory, "nested") + path.sep + ".." + path.sep + "image.png" },
    { ...f.record, tabId: "unowned" }]) expect(parseImportedImageProvenance({ version: 1, records: [invalid] }, snapshot)).toBeNull();
});
it("persists exact temporary provenance across SaveAs, immediate close and clean restart/reopen", async () => {
  const f = await fixture(); const service = createRecoveryService(f.directory);
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => true, () => f.workspace.exportSnapshot());
  f.save(); service.synchronizeLiveImportedImages(f.workspace.exportSnapshot());
  await service.compact(f.workspace.exportSnapshot());
  const newPath = path.join(f.directory, "save-as.md"); f.save(f.tabId, newPath); service.synchronizeLiveImportedImages(f.workspace.exportSnapshot()); await service.compact(f.workspace.exportSnapshot());
  f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "1", expectedRevision: 0 }); await service.compact(f.workspace.exportSnapshot()); await service.markCleanShutdown();
  const next = createRecoveryService(f.directory); const restored = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  await restoreWorkspaceRecovery({ workspace: restored, recovery: next });
  expect(next.getImportedImages("new-tab", f.savedPath)).toHaveLength(1);
  expect(next.getImportedImages("new-tab", newPath)).toHaveLength(1);
  expect(next.getImportedImages("new-tab", path.join(f.directory, "other.md"))).toEqual([]);
});
it("never activates metadata if the parsed snapshot fails domain restoration", async () => {
  const f = await fixture(); const seed = createRecoveryService(f.directory);
  f.save();
  const initial = f.workspace.exportSnapshot();
  const duplicate = { ...initial.sessions[0]!, tabId: "tab-2" };
  const invalid = { ...initial, sessions: [...initial.sessions, duplicate], windows: [{ windowId: "1", tabIds: [f.tabId, "tab-2"], activeTabId: f.tabId }], nextTabId: 3 };
  await seed.compactWithImportedImage(invalid, f.record, () => true, () => invalid);
  const next = createRecoveryService(f.directory);
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  const report = await restoreWorkspaceRecovery({ workspace, recovery: next });
  expect(report.notification?.title).toBe("Recovery unavailable");
  expect(next.getImportedImages(f.tabId, null)).toEqual([]);
});
it("compensates observed authorization expiry durably without poisoning later edits", async () => {
  const f = await fixture(); let authorized = true;
  const service = createRecoveryService(f.directory, { rename: async (from, to) => { await rename(from, to); authorized = false; } });
  const edits = createRecoverableDocumentEdits({ workspace: f.workspace, recovery: service });
  await expect(edits.checkpoint(() => { if (!authorized) throw new Error("expired"); }, (snapshot) => service.compactWithImportedImage(snapshot, f.record, () => authorized, () => f.workspace.exportSnapshot()))).rejects.toThrow("expired");
  expect(service.getImportedImages(f.tabId, null)).toEqual([]);
  const next = createRecoveryService(f.directory); await restoreWorkspaceRecovery({ workspace: createWorkspaceState({ createTextBuffer: createStringTextBuffer }), recovery: next });
  expect(next.getImportedImages(f.tabId, null)).toEqual([]);
  await expect(edits.applyDocumentEdits({ tabId: f.tabId, expectedWindowId: "1", clientId: "test", clientSequence: 1, baseRevision: 0, changes: [{ from: 0, to: 0, insert: "accepted" }] })).resolves.toMatchObject({ kind: "applied" });
});
it("preserves failed compensation bytes before a later shutdown can overwrite them", async () => {
  const f = await fixture(); let count = 0; let authorized = true;
  const service = createRecoveryService(f.directory, { rename: async (from, to) => {
    count++; if (count === 2) throw new Error("rollback disk failure"); await rename(from, to); authorized = false;
  } });
  await expect(service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => authorized, () => f.workspace.exportSnapshot())).rejects.toThrow("rollback disk failure");
  const original = await readFile(path.join(f.directory, "recovery-snapshot.json"));
  expect(service.getImportedImages(f.tabId, null)).toEqual([]);
  await service.compact(f.workspace.exportSnapshot());
  expect(await readFile(path.join(await service.preserveRecovery(), "recovery-snapshot.json"))).toEqual(original);
});
it.each(["commit", "compensation"])("retains actual Save bindings across concurrent %s IO, failed binding checkpoint, close and retry", async (stage) => {
  const f = await fixture(); let pause = false; let fail = false; let authorized = true; let renames = 0; let opened!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { opened = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
  const service = createRecoveryService(f.directory, { rename: async (from, to) => {
    if (fail) throw new Error("disk failure"); renames++;
    if (pause && renames === (stage === "commit" ? 2 : 3)) { opened(); await gate; }
    await rename(from, to); if (stage === "compensation" && renames === 2) authorized = false;
  } });
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => true, () => f.workspace.exportSnapshot());
  const second = f.workspace.createUntitledTab("1").activeTabId!;
  const additional = { ...f.record, path: path.join(f.directory, "second.png"), identity: fileIdentity(`path:${filePathIdentity(path.join(f.directory, "second.png"), process.platform)}`, "inode:1:999"), tabId: second };
  pause = true; const pending = service.compactWithImportedImage(f.workspace.exportSnapshot(), additional, () => authorized, () => f.workspace.exportSnapshot()); await entered;
  f.save(); service.synchronizeLiveImportedImages(f.workspace.exportSnapshot()); release(); await pending; pause = false;
  fail = true; await expect(service.compact(f.workspace.exportSnapshot())).rejects.toThrow("disk failure");
  f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "1", expectedRevision: 0 }); fail = false; await service.compact(f.workspace.exportSnapshot());
  const next = createRecoveryService(f.directory); await restoreWorkspaceRecovery({ workspace: createWorkspaceState({ createTextBuffer: createStringTextBuffer }), recovery: next });
  expect(next.getImportedImages("reopened", f.savedPath).map((record) => record.path)).toEqual([f.record.path]);
});
it("drops a closed untitled import rather than granting its old tab ID to future tabs", async () => {
  const f = await fixture(); const service = createRecoveryService(f.directory);
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => true, () => f.workspace.exportSnapshot());
  f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "1", expectedRevision: 0 }); await service.compact(f.workspace.exportSnapshot());
  expect(service.getImportedImages(f.tabId, null)).toEqual([]);
});
it("does not transfer old saved bindings to a replacement image at the same path", async () => {
  const f = await fixture(); const service = createRecoveryService(f.directory);
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => true, () => f.workspace.exportSnapshot());
  f.save(); service.synchronizeLiveImportedImages(f.workspace.exportSnapshot()); f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "1", expectedRevision: 0 });
  const replacementTab = f.workspace.createUntitledTab("1").activeTabId!;
  const replacement = { ...f.record, tabId: replacementTab, identity: fileIdentity(f.record.identity.location, "inode:1:124") };
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), replacement, () => true, () => f.workspace.exportSnapshot());
  expect(service.getImportedImages("old-reopened", f.savedPath)).toEqual([]);
  expect(service.getImportedImages(replacementTab, null)).toEqual([replacement]);
});
it("checksums the metadata and preserves malformed profile records without prefix grants", async () => {
  const f = await fixture(); const service = createRecoveryService(f.directory);
  await service.compactWithImportedImage(f.workspace.exportSnapshot(), f.record, () => true, () => f.workspace.exportSnapshot());
  const target = path.join(f.directory, "recovery-snapshot.json"); const original = await readFile(target, "utf8");
  const envelope = JSON.parse(original); const payload = JSON.parse(envelope.snapshot); const badPath = path.join(f.directory, "bad.png");
  payload.importedImages.records.push({ ...f.record, path: badPath, identity: fileIdentity(`path:${filePathIdentity(badPath, process.platform)}`, "inode:1:789"), tabId: "bad" });
  envelope.snapshot = JSON.stringify(payload); envelope.checksum = createHash("sha256").update(envelope.snapshot).digest("hex"); await writeFile(target, JSON.stringify(envelope));
  const next = createRecoveryService(f.directory); expect((await next.loadRecovery()).kind).toBe("corrupt"); expect(next.getImportedImages(f.tabId, null)).toEqual([]);
  await next.compact(f.workspace.exportSnapshot()); expect(await readFile(path.join(await next.preserveRecovery(), "recovery-snapshot.json"), "utf8")).toBe(JSON.stringify(envelope));
});
