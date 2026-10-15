import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { createWorkspaceTabTransfer, type WorkspaceTabTransferInput, type WorkspaceMoveCommandResult } from "@fishmark/workspace-application";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceTabReceipts } from "./workspace-tab-receipts";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import type { WorkspaceTabReceiptRequest, WorkspaceTabReceiptComplete } from "../shared/workspace-tab-transfer";

function setup() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("source"); workspace.registerWindow("target");
  const tabId = workspace.createUntitledTab("source").activeTabId!;
  workspace.updateTabDraft({ tabId, expectedWindowId: "source", content: "received unsaved source" });
  const otherId = workspace.createUntitledTab("target").activeTabId!;
  workspace.updateTabDraft({ tabId: otherId, expectedWindowId: "target", content: "existing dirty target" });
  const operations = createKeyedOperationCoordinator<string>();
  const transfer = createWorkspaceTabTransfer({ workspace, documentOperations: operations });
  const requests: WorkspaceTabReceiptRequest[] = [], completions: WorkspaceTabReceiptComplete[] = [];
  const timers = new Set<() => void>();
  const receipts = createWorkspaceTabReceipts({ workspace, send: (_id, request) => { requests.push(request); },
    complete: (_id, result) => { completions.push(result); }, bindAbort: () => () => {},
    schedule: callback => { timers.add(callback); return () => { timers.delete(callback); }; } });
  const commit = vi.fn(async (input: WorkspaceTabTransferInput): Promise<WorkspaceMoveCommandResult> => ({ kind: "success", projection: await transfer.move(input) }));
  const move = () => receipts.move({ tabId, sourceWindowId: "source", targetWindowId: "target", check: () => {} }, commit);
  const ack = (success = true) => receipts.confirm({ windowId: "target", tabId, requestId: requests[0]!.requestId, success });
  return { workspace, tabId, otherId, operations, receipts, requests, completions, timers, commit, move, ack };
}

describe("existing-window document receipts", () => {
  it("keeps source ownership until exact dirty content is received, then commits without overwriting target", async () => {
    const f = setup(); const move = f.move();
    expect(f.requests[0]!.document).toMatchObject({ content: "received unsaved source", revision: 1, isDirty: true });
    expect(f.workspace.getTabSession(f.tabId).windowId).toBe("source");
    expect(f.commit).not.toHaveBeenCalled();
    f.ack(); await move;
    expect(f.commit.mock.calls[0]![0]).toMatchObject({ expectedRevision: 1, expectedWindowId: "source", targetWindowId: "target" });
    expect(f.workspace.getTabSession(f.tabId)).toMatchObject({ windowId: "target", content: "received unsaved source", isDirty: true });
    expect(f.workspace.getTabSession(f.otherId)).toMatchObject({ content: "existing dirty target", isDirty: true });
    expect(f.completions).toEqual([{ requestId: f.requests[0]!.requestId, committed: true }]);
    expect(f.timers.size).toBe(0);
  });
  it("ignores wrong sender and tab receipts", async () => {
    const f = setup(); const move = f.move();
    expect(f.receipts.confirm({ windowId: "source", tabId: f.tabId, requestId: f.requests[0]!.requestId, success: true })).toBe(false);
    expect(f.receipts.confirm({ windowId: "target", tabId: f.otherId, requestId: f.requests[0]!.requestId, success: true })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled(); f.ack(); await move;
  });
  it.each(["decline", "timeout", "source-close", "target-close"])("%s preserves the original dirty owner and ignores a late ACK", async failure => {
    const f = setup(); const move = f.move(); const rejected = expect(move).rejects.toThrow();
    if (failure === "decline") f.ack(false);
    else if (failure === "timeout") [...f.timers][0]!();
    else f.receipts.abortWindow(failure === "source-close" ? "source" : "target");
    await rejected;
    expect(f.ack()).toBe(false);
    expect(f.workspace.getTabSession(f.tabId)).toMatchObject({ windowId: "source", content: "received unsaved source", revision: 1, isDirty: true });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.completions[0]!.committed).toBe(false);
    expect(f.timers.size).toBe(0);
  });
  it("rejects repeated moves while the target has a pending receipt", async () => {
    const f = setup(); const move = f.move();
    await expect(f.move()).rejects.toThrow("already pending");
    f.ack(); await move;
  });
  it("rechecks the received revision after waiting for a document lease", async () => {
    const f = setup(); const lease = await f.operations.acquireExclusive([f.tabId]);
    const move = f.move(); const rejected = expect(move).rejects.toThrow("document changed");
    f.ack(); await vi.waitFor(() => expect(f.commit).toHaveBeenCalledOnce());
    f.workspace.updateTabDraft({ tabId: f.tabId, expectedWindowId: "source", content: "newer text than target received" });
    lease.release(); await rejected;
    expect(f.workspace.getTabSession(f.tabId)).toMatchObject({ windowId: "source", content: "newer text than target received" });
    expect(f.completions[0]!.committed).toBe(false);
  });
  it("absolute timeout after ACK also cancels a queued lease commit", async () => {
    const f = setup(); const lease = await f.operations.acquireExclusive([f.tabId]);
    const move = f.move(); const rejected = expect(move).rejects.toThrow();
    f.ack(); await vi.waitFor(() => expect(f.commit).toHaveBeenCalledOnce());
    [...f.timers][0]!(); await rejected; lease.release();
    await vi.waitFor(() => expect(f.workspace.getTabSession(f.tabId).windowId).toBe("source"));
    expect(f.completions[0]!.committed).toBe(false);
  });
  it("retains committed semantics when target close occurs during watcher synchronization", async () => {
    const f = setup(); let release!: () => void;
    const watch = new Promise<void>(resolve => { release = resolve; });
    const commit = async (input: WorkspaceTabTransferInput): Promise<WorkspaceMoveCommandResult> => {
      const committed = await f.commit(input); await watch; return committed;
    };
    const move = f.receipts.move({ tabId: f.tabId, sourceWindowId: "source", targetWindowId: "target", check: () => {} }, commit);
    f.ack(); await vi.waitFor(() => expect(f.workspace.getTabSession(f.tabId).windowId).toBe("target"));
    f.receipts.abortWindow("target"); release(); await move;
    expect(f.completions[0]!.committed).toBe(true);
  });
});
