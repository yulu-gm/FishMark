import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createRecoverableDocumentEdits } from "@fishmark/workspace-application";
import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { createRecoveryService } from "./recovery-service";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "fishmark-hardening-"));
  directories.push(directory);
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("window-1");
  const tabId = workspace.createUntitledTab("window-1").activeTabId!;
  const recovery = createRecoveryService(directory);
  const input = { tabId, expectedWindowId: "window-1", clientId: "client", clientSequence: 1,
    baseRevision: 0, changes: [{ from: 0, to: 0, insert: "draft" }] };
  return { directory, workspace, recovery, input };
}
async function restore(directory: string) {
  const loaded = await createRecoveryService(directory).loadRecovery();
  expect(loaded.kind).toBe("recovery-available");
  if (loaded.kind !== "recovery-available" || loaded.snapshot === null) throw new Error("Missing baseline");
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.restoreSnapshot(loaded.snapshot);
  for (const batch of loaded.editBatches) {
    const session = workspace.getTabSession(batch.tabId);
    if (session.revision > batch.baseRevision) continue;
    expect(workspace.applyDocumentEdits({ ...batch, expectedWindowId: session.windowId,
      clientId: `recovery:${batch.clientId}:${batch.baseRevision}`, clientSequence: 1 }).kind).toBe("applied");
  }
  return { workspace, loaded };
}

it("persists a first-session baseline and only appends for subsequent edits", async () => {
  const { directory, workspace, recovery, input } = await setup();
  const snapshots = vi.spyOn(workspace, "exportSnapshot");
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  await edits.applyDocumentEdits(input);
  await edits.applyDocumentEdits({ ...input, baseRevision: 1, clientSequence: 2,
    changes: [{ from: 5, to: 5, insert: "!" }] });
  expect(snapshots).toHaveBeenCalledTimes(1);
  expect((await restore(directory)).workspace.getTabSession(input.tabId).content).toBe("draft!");
});

it("refreshes the baseline after a non-journal reload before accepting another edit", async () => {
  const { directory, workspace, recovery, input } = await setup();
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  await edits.applyDocumentEdits(input);
  workspace.saveTabDocument({ tabId: input.tabId, expectedWindowId: "window-1", capturedRevision: 1,
    document: { fileIdentity: fileIdentity("file:reload"), path: "C:/reload.md", name: "reload.md",
      content: "draft", encoding: "utf-8" }, diskVersion: null });
  workspace.replaceTabDocument({ tabId: input.tabId, expectedWindowId: "window-1", expectedRevision: 1,
    document: { fileIdentity: fileIdentity("file:reload"), path: "C:/reload.md", name: "reload.md",
      content: "reloaded", encoding: "utf-8" }, diskVersion: null });
  await edits.applyDocumentEdits({ ...input, clientSequence: 2, baseRevision: 2,
    changes: [{ from: 8, to: 8, insert: "!" }] });
  const restored = (await restore(directory)).workspace.exportSnapshot().sessions.find((session) => session.tabId === input.tabId)!;
  expect(restored.content).toBe("reloaded!");
  expect(restored.savedContent).toBe("reloaded");
});

it("does not acknowledge failed persistence or let duplicate retries bypass it", async () => {
  const { workspace, recovery, input } = await setup();
  vi.spyOn(recovery, "recordEditBatch").mockRejectedValue(new Error("disk full"));
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  await expect(edits.applyDocumentEdits(input)).rejects.toThrow("Recovery persistence failed");
  expect(workspace.getTabSession(input.tabId).content).toBe("draft");
  await expect(edits.applyDocumentEdits(input)).rejects.toThrow("Recovery persistence failed");
});

it("does not poison persistence when a request fails ownership validation", async () => {
  const { workspace, recovery, input } = await setup();
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  expect((await edits.applyDocumentEdits({ ...input, expectedWindowId: "unknown" })).kind).toBe("error");
  expect((await edits.applyDocumentEdits(input)).kind).toBe("applied");
});

it("rechecks sender authorization after asynchronous baseline persistence", async () => {
  const { workspace, recovery, input } = await setup();
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  await expect(edits.applyDocumentEdits(input, () => { throw new Error("sender destroyed"); })).rejects.toThrow("sender destroyed");
  expect(workspace.getTabSession(input.tabId).content).toBe("");
  expect((await edits.applyDocumentEdits(input)).kind).toBe("applied");
});

it("refreshes the saved baseline even when a save does not change document revision", async () => {
  const { directory, workspace, recovery, input } = await setup();
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  await edits.applyDocumentEdits(input);
  workspace.saveTabDocument({ tabId: input.tabId, expectedWindowId: "window-1", capturedRevision: 1,
    document: { fileIdentity: fileIdentity("file:saved"), path: "C:/saved.md", name: "saved.md",
      content: "draft", encoding: "utf-8" }, diskVersion: null });
  await edits.applyDocumentEdits({ ...input, clientSequence: 2, baseRevision: 1,
    changes: [{ from: 5, to: 5, insert: "!" }] });
  const session = (await restore(directory)).workspace.exportSnapshot().sessions[0]!;
  expect(session.content).toBe("draft!");
  expect(session.savedContent).toBe("draft");
  expect(session.path).toBe("C:/saved.md");
});

it("waits for append before ACK and drains it before final shutdown compaction", async () => {
  const { workspace, recovery, input } = await setup();
  const realAppend = recovery.recordEditBatch.bind(recovery);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const append = vi.spyOn(recovery, "recordEditBatch").mockImplementation(async (entry) => { await wait; await realAppend(entry); });
  const edits = createRecoverableDocumentEdits({ workspace, recovery });
  let acknowledged = false;
  const pending = edits.applyDocumentEdits(input).then(() => { acknowledged = true; });
  await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1));
  expect(acknowledged).toBe(false);
  const shutdown = edits.shutdown();
  await expect(edits.applyDocumentEdits(input)).rejects.toThrow("shutting down");
  release();
  await Promise.all([pending, shutdown]);
  const loaded = await recovery.loadRecovery();
  expect(loaded).toMatchObject({ kind: "recovery-available", editBatches: [], snapshot: { sessions: [{ content: "draft" }] } });
});

it("retains a valid journal prefix when the last append is torn", async () => {
  const { directory, workspace, recovery, input } = await setup();
  await createRecoverableDocumentEdits({ workspace, recovery }).applyDocumentEdits(input);
  await appendFile(path.join(directory, "recovery-journal.jsonl"), '{"kind":');
  const restored = await restore(directory);
  expect(restored.loaded.incompleteTail).toBe(true);
  expect(restored.workspace.getTabSession(input.tabId).content).toBe("draft");
});

it("recovers an acknowledged unsaved first session after its writer process is killed", async () => {
  const { directory } = await setup();
  const child = spawn(process.execPath, [path.resolve("src/main/infrastructure/test-fixtures/recovery-crash-child.mjs"), directory],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const exited = once(child, "exit");
  let output = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child ACK timed out: ${output}`)), 15000);
      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
        if (output.includes("RECOVERY_ACK_READY")) { clearTimeout(timer); resolve(); }
      });
      child.stderr.on("data", (data: Buffer) => { output += data.toString(); });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", () => { clearTimeout(timer); reject(new Error(`Child exited before ACK: ${output}`)); });
    });
    child.kill("SIGKILL");
    await exited;
    const restored = await restore(directory);
    expect(restored.workspace.exportSnapshot().sessions[0]?.content).toBe("unsaved after crash");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  }
}, 20000);
