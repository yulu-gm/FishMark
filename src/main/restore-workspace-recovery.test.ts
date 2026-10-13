import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import type { RecoveryOutcome } from "@fishmark/workspace-application";
import { restoreWorkspaceRecovery } from "./restore-workspace-recovery";

function setup() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("source");
  const first = workspace.createUntitledTab("source").activeTabId!;
  workspace.updateTabDraft({ tabId: first, expectedWindowId: "source", content: "FIRST" });
  const second = workspace.createUntitledTab("source").activeTabId!;
  workspace.updateTabDraft({ tabId: second, expectedWindowId: "source", content: "SECOND" });
  const snapshot = workspace.exportSnapshot();
  const batch = (tabId: string, baseRevision: number, from: number, insert: string) => ({
    kind: "edit-batch" as const, tabId, clientId: "old-client", clientSequence: 1, baseRevision,
    changes: [{ from, to: from, insert }]
  });
  return { workspace, snapshot, first, second, batch };
}

describe("restoreWorkspaceRecovery", () => {
  it("retains a document's successful prefix, blocks its failed chain, and recovers independent documents", async () => {
    const { workspace, snapshot, first, second, batch } = setup();
    const preserveRecovery = vi.fn(async () => "C:/profile/recovery-preserved/pair");
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async () => ({ kind: "recovery-available", snapshot, editBatches: [
        batch(first, 1, 5, " prefix"), batch(first, 2, 100, "invalid"),
        batch(first, 2, 12, " MUST NOT REPLAY"), batch(second, 1, 6, " independent")
      ] }), preserveRecovery
    } });
    expect(workspace.getTabSession(first)).toMatchObject({ content: "FIRST prefix", revision: 2, savedRevision: 0, isDirty: true });
    expect(workspace.getTabSession(second)).toMatchObject({ content: "SECOND independent", revision: 2, savedRevision: 0, isDirty: true });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.notification).toMatchObject({ title: "Recovery incomplete" });
    expect(result.notification?.content).toContain("C:/profile/recovery-preserved/pair");
    expect(preserveRecovery).toHaveBeenCalledTimes(1);
  });

  it("skips entries already included in a committed snapshot and does not preserve or notify on valid recovery", async () => {
    const { workspace, snapshot, first, batch } = setup();
    const preserveRecovery = vi.fn(async () => "unused");
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async () => ({ kind: "recovery-available", snapshot, editBatches: [batch(first, 0, 0, "old"), batch(first, 1, 5, " new")] }), preserveRecovery
    } });
    expect(workspace.getTabSession(first)).toMatchObject({ content: "FIRST new", revision: 2 });
    expect(result).toEqual({ diagnostics: [], notification: null });
    expect(preserveRecovery).not.toHaveBeenCalled();
  });

  it.each([
    { incompleteTail: true as const },
    { journalDamage: "malformed-entry" as const },
    { journalDamage: "invalid-entry" as const }
  ])("preserves damaged journal recovery and returns one visible summary: %j", async (damage) => {
    const { workspace, snapshot } = setup();
    const preserveRecovery = vi.fn(async () => "preserved-pair");
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async () => ({ kind: "recovery-available", snapshot, editBatches: [], ...damage }), preserveRecovery
    } });
    expect(workspace.exportSnapshot()).toEqual(snapshot);
    expect(result.notification?.title).toBe("Recovery incomplete");
    expect(preserveRecovery).toHaveBeenCalledTimes(1);
  });

  it("does not restore an unavailable snapshot, and preserves originals before a fresh workspace starts", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const preserveRecovery = vi.fn(async () => "preserved-pair");
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async () => ({ kind: "corrupt", path: "recovery-snapshot.json" }), preserveRecovery
    } });
    expect(workspace.exportSnapshot().sessions).toEqual([]);
    expect(result.notification).toMatchObject({ title: "Recovery unavailable" });
    expect(preserveRecovery).toHaveBeenCalledTimes(1);
  });

  it("rolls back a partially restored snapshot if domain restoration fails", async () => {
    const { workspace, snapshot, second, batch } = setup();
    const original = workspace.exportSnapshot();
    const invalidSnapshot = { ...snapshot, sessions: snapshot.sessions.map((session) => ({ ...session, fileIdentity: fileIdentity("duplicate-file") })) };
    const applyDocumentEdits = vi.spyOn(workspace, "applyDocumentEdits");
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async () => ({ kind: "recovery-available", snapshot: invalidSnapshot, editBatches: [batch(second, 1, 6, " MUST NOT REPLAY")] }),
      preserveRecovery: async () => "preserved-pair"
    } });
    expect(workspace.exportSnapshot()).toEqual(original);
    expect(applyDocumentEdits).not.toHaveBeenCalled();
    expect(result.diagnostics[0]).toContain("Cannot claim a file identity owned by another tab");
    expect(result.notification?.title).toBe("Recovery unavailable");
  });

  it("reports preservation failure visibly while retaining recovered content", async () => {
    const { workspace, snapshot } = setup();
    const result = await restoreWorkspaceRecovery({ workspace, recovery: {
      loadRecovery: async (): Promise<RecoveryOutcome> => ({ kind: "recovery-available", snapshot, editBatches: [], incompleteTail: true }),
      preserveRecovery: async () => { throw new Error("backup write unavailable"); }
    } });
    expect(workspace.exportSnapshot()).toEqual(snapshot);
    expect(result.notification?.content).toContain("Recovery writes are blocked");
    expect(result.diagnostics).toHaveLength(2);
  });
});
