import { describe, expect, it, vi } from "vitest";
import type {
  ApplyDocumentEditsResult as ApplicationApplyDocumentEditsResult,
  FlushDocumentEditsResult as ApplicationFlushDocumentEditsResult
} from "@fishmark/workspace-application";
import {
  createApplyDocumentEdits,
  createFlushDocumentEdits
} from "@fishmark/workspace-application";
import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { createKeyedOperationCoordinator } from "../keyed-operation-coordinator";

import {
  APPLY_DOCUMENT_EDITS_CHANNEL,
  FLUSH_DOCUMENT_EDITS_CHANNEL
} from "../../shared/document-edit";
import { DOCUMENT_PROJECTION_EVENT } from "../../shared/document-projection";
import { registerWorkspaceHandlers } from "./register-workspace-handlers";

type Sender = { readonly id: string };

function createFixture() {
  const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
  const current = { value: true };
  const application = {
    applyDocumentEdits: vi.fn(async (): Promise<ApplicationApplyDocumentEditsResult> => ({
      kind: "applied" as const,
      acknowledgedSequence: 1,
      projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
    })),
    flushDocumentEdits: vi.fn(async (): Promise<ApplicationFlushDocumentEditsResult> => ({
      kind: "flushed" as const,
      acknowledgedSequence: 1,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    }))
  };
  const publish = vi.fn();
  registerWorkspaceHandlers<Sender>({
    register: (channel, handler) => handlers.set(channel, handler),
    ensureWindow: async () => "window-1",
    isCurrentSender: () => current.value,
    application,
    publish
  });
  return { handlers, application, publish, current, sender: { id: "sender-1" } };
}

const applyInput = {
  tabId: "tab-1",
  clientId: "client-a",
  clientSequence: 1,
  baseRevision: 0,
  changes: [{ from: 0, to: 0, insert: "😀\r\n" }]
};

describe("registerWorkspaceHandlers", () => {
  it("registers only RF-202 apply and flush channels", () => {
    const fixture = createFixture();
    expect([...fixture.handlers.keys()]).toEqual([
      APPLY_DOCUMENT_EDITS_CHANNEL,
      FLUSH_DOCUMENT_EDITS_CHANNEL
    ]);
  });

  it("maps structured malformed input without reaching application", async () => {
    const fixture = createFixture();
    const result = await fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender },
      { ...applyInput, extra: true }
    );
    expect(result).toEqual({
      kind: "error",
      error: { code: "invalid-request", message: "Invalid document edit request." }
    });
    expect(fixture.application.applyDocumentEdits).not.toHaveBeenCalled();
  });

  it("maps a valid-shaped invalid client identity to its closed protocol code", async () => {
    const fixture = createFixture();
    await expect(fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender },
      { ...applyInput, clientId: "-bad" }
    )).resolves.toEqual({
      kind: "error",
      error: {
        code: "invalid-client-id",
        message: "Document edit client ID has an invalid format."
      }
    });
    expect(fixture.application.applyDocumentEdits).not.toHaveBeenCalled();
  });

  it("derives owner identity and publishes one metadata projection for applied only", async () => {
    const fixture = createFixture();
    const result = await fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    );
    expect(fixture.application.applyDocumentEdits).toHaveBeenCalledWith(
      {
        ...applyInput,
        expectedWindowId: "window-1"
      },
      expect.any(Function)
    );
    expect(result).toEqual({
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 1,
      isDirty: true
    });
    expect(result).not.toHaveProperty("canonicalText");
    expect(fixture.publish).toHaveBeenCalledTimes(1);
    expect(fixture.publish).toHaveBeenCalledWith(
      fixture.sender,
      DOCUMENT_PROJECTION_EVENT,
      {
        windowId: "window-1",
        projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
      }
    );
  });

  it("acknowledges a duplicate without replaying projection", async () => {
    const fixture = createFixture();
    fixture.application.applyDocumentEdits.mockResolvedValueOnce({
      kind: "duplicate",
      acknowledgedSequence: 1,
      projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
    });
    const result = await fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    );
    expect(result).toEqual({
      kind: "duplicate", acknowledgedSequence: 1, revision: 1, isDirty: true
    });
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it("returns canonical text only for revision conflict", async () => {
    const fixture = createFixture();
    fixture.application.applyDocumentEdits.mockResolvedValueOnce({
      kind: "revision-conflict",
      canonicalRevision: 2,
      canonicalText: "canonical",
      isDirty: true
    });
    await expect(fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    )).resolves.toEqual({
      kind: "revision-conflict",
      canonicalRevision: 2,
      canonicalText: "canonical",
      isDirty: true
    });
  });

  it("reconstructs every non-error wire result without leaking application fields", async () => {
    const fixture = createFixture();
    fixture.application.applyDocumentEdits.mockResolvedValueOnce({
      kind: "revision-conflict",
      canonicalRevision: 2,
      canonicalText: "canonical",
      isDirty: true,
      content: "must-not-cross-wire",
      internal: "must-not-cross-wire"
    } as unknown as ApplicationApplyDocumentEditsResult);
    await expect(fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    )).resolves.toEqual({
      kind: "revision-conflict",
      canonicalRevision: 2,
      canonicalText: "canonical",
      isDirty: true
    });

    fixture.application.applyDocumentEdits.mockResolvedValueOnce({
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 1,
      content: "must-not-cross-wire",
      internal: "must-not-cross-wire"
    } as unknown as ApplicationApplyDocumentEditsResult);
    await expect(fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    )).resolves.toEqual({
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 1
    });

    fixture.application.flushDocumentEdits.mockResolvedValueOnce({
      kind: "flushed",
      acknowledgedSequence: 1,
      revision: 1,
      savedRevision: 0,
      isDirty: true,
      content: "must-not-cross-wire",
      internal: "must-not-cross-wire"
    } as unknown as ApplicationFlushDocumentEditsResult);
    await expect(fixture.handlers.get(FLUSH_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender },
      { tabId: "tab-1", clientId: "client-a", throughSequence: 1 }
    )).resolves.toEqual({
      kind: "flushed",
      acknowledgedSequence: 1,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });

    fixture.application.flushDocumentEdits.mockResolvedValueOnce({
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 1,
      content: "must-not-cross-wire",
      internal: "must-not-cross-wire"
    } as unknown as ApplicationFlushDocumentEditsResult);
    await expect(fixture.handlers.get(FLUSH_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender },
      { tabId: "tab-1", clientId: "client-a", throughSequence: 1 }
    )).resolves.toEqual({
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 1
    });
  });

  it("rejects a destroyed or replaced sender before application execution", async () => {
    const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
    const application = {
      applyDocumentEdits: vi.fn(),
      flushDocumentEdits: vi.fn()
    };
    registerWorkspaceHandlers<Sender>({
      register: (channel, handler) => handlers.set(channel, handler),
      ensureWindow: async () => { throw new Error("renderer replaced"); },
      isCurrentSender: () => false,
      application,
      publish: vi.fn()
    });
    await expect(handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "gone" } }, applyInput
    )).rejects.toThrow("renderer replaced");
    expect(application.applyDocumentEdits).not.toHaveBeenCalled();
  });

  it("rejects sender loss while an application operation is queued and emits nothing", async () => {
    const fixture = createFixture();
    let release!: (value: ApplicationApplyDocumentEditsResult) => void;
    fixture.application.applyDocumentEdits.mockImplementationOnce(() =>
      new Promise((resolve) => { release = resolve; })
    );
    const pending = fixture.handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender }, applyInput
    );
    await vi.waitFor(() => expect(fixture.application.applyDocumentEdits).toHaveBeenCalled());
    fixture.current.value = false;
    release({
      kind: "applied", acknowledgedSequence: 1,
      projection: { tabId: "tab-1", revision: 1, savedRevision: 0, isDirty: true }
    });
    await expect(pending).rejects.toThrow("Workspace renderer is no longer current.");
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it("authorizes queued apply inside the tab critical section before domain mutation", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const operations = createKeyedOperationCoordinator<string>();
    const lease = await operations.acquireExclusive([tabId]);
    const apply = createApplyDocumentEdits({ workspace, documentOperations: operations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations: operations });
    const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
    const current = { value: true };
    const isCurrentSender = vi.fn(() => current.value);
    const publish = vi.fn();
    registerWorkspaceHandlers<Sender>({
      register: (channel, handler) => handlers.set(channel, handler),
      ensureWindow: async () => "window-1",
      isCurrentSender,
      application: { applyDocumentEdits: apply.apply, flushDocumentEdits: flush.flush },
      publish
    });

    const pending = handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "sender-1" } },
      { ...applyInput, tabId }
    );
    await vi.waitFor(() => expect(isCurrentSender).toHaveBeenCalledTimes(1));
    current.value = false;
    lease.release();

    await expect(pending).rejects.toThrow("Workspace renderer is no longer current.");
    expect(workspace.getTabSession(tabId)).toMatchObject({ content: "", revision: 0 });
    expect(workspace.getDocumentEditCheckpoint({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a"
    })).toMatchObject({ kind: "checkpoint", acknowledgedSequence: 0 });
    expect(publish).not.toHaveBeenCalled();
  });

  it("authorizes queued flush inside the tab critical section before reading its checkpoint", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const operations = createKeyedOperationCoordinator<string>();
    const lease = await operations.acquireExclusive([tabId]);
    const checkpoint = vi.spyOn(workspace, "getDocumentEditCheckpoint");
    const apply = createApplyDocumentEdits({ workspace, documentOperations: operations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations: operations });
    const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
    const current = { value: true };
    const isCurrentSender = vi.fn(() => current.value);
    registerWorkspaceHandlers<Sender>({
      register: (channel, handler) => handlers.set(channel, handler),
      ensureWindow: async () => "window-1",
      isCurrentSender,
      application: { applyDocumentEdits: apply.apply, flushDocumentEdits: flush.flush },
      publish: vi.fn()
    });

    const pending = handlers.get(FLUSH_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "sender-1" } },
      { tabId, clientId: "client-a", throughSequence: 0 }
    );
    await vi.waitFor(() => expect(isCurrentSender).toHaveBeenCalledTimes(1));
    current.value = false;
    lease.release();

    await expect(pending).rejects.toThrow("Workspace renderer is no longer current.");
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it("drains document edits through an already-held window-close lease without reacquiring", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const operations = createKeyedOperationCoordinator<string>();
    const apply = createApplyDocumentEdits({ workspace, documentOperations: operations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations: operations });
    const lease = await operations.acquireExclusive([tabId]);

    try {
      await expect(apply.applyWithHeldTabLease({
        tabId,
        expectedWindowId: "window-1",
        clientId: "client-close",
        clientSequence: 1,
        baseRevision: 0,
        changes: [{ from: 0, to: 0, insert: "pending close edit" }]
      }, () => undefined, lease)).resolves.toMatchObject({
        kind: "applied",
        acknowledgedSequence: 1
      });

      await expect(flush.flushWithHeldTabLease({
        tabId,
        expectedWindowId: "window-1",
        clientId: "client-close",
        throughSequence: 1
      }, () => undefined, lease)).resolves.toEqual({
        kind: "flushed",
        acknowledgedSequence: 1,
        revision: 1,
        savedRevision: 0,
        isDirty: true
      });
    } finally {
      lease.release();
    }

    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "pending close edit",
      revision: 1,
      isDirty: true
    });
  });

  it("maps unexpected application errors to a stable closed error", async () => {
    const fixture = createFixture();
    fixture.application.flushDocumentEdits.mockRejectedValueOnce(new Error("secret stack data"));
    await expect(fixture.handlers.get(FLUSH_DOCUMENT_EDITS_CHANNEL)!(
      { sender: fixture.sender },
      { tabId: "tab-1", clientId: "client-a", throughSequence: 0 }
    )).resolves.toEqual({
      kind: "error",
      error: { code: "internal-error", message: "Document edit operation failed." }
    });
  });

  it("integrates shared decoding through application serialization into domain state", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const operations = createKeyedOperationCoordinator<string>();
    const apply = createApplyDocumentEdits({ workspace, documentOperations: operations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations: operations });
    const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
    const publish = vi.fn();
    registerWorkspaceHandlers<Sender>({
      register: (channel, handler) => handlers.set(channel, handler),
      ensureWindow: async () => "window-1",
      isCurrentSender: () => true,
      application: {
        applyDocumentEdits: apply.apply,
        flushDocumentEdits: flush.flush
      },
      publish
    });

    await expect(handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "sender-1" } },
      {
        tabId, clientId: "client-a", clientSequence: 1, baseRevision: 0,
        changes: [
          { from: 0, to: 0, insert: "A\r\n" },
          { from: 0, to: 0, insert: "😀" }
        ]
      }
    )).resolves.toMatchObject({ kind: "applied", revision: 1 });
    await expect(handlers.get(FLUSH_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "sender-1" } },
      { tabId, clientId: "client-a", throughSequence: 1 }
    )).resolves.toMatchObject({ kind: "flushed", acknowledgedSequence: 1 });
    expect(workspace.getTabSession(tabId).content).toBe("A\r\n😀");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("rechecks owner CAS inside the queue when a tab moves while apply waits", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    const operations = createKeyedOperationCoordinator<string>();
    const apply = createApplyDocumentEdits({ workspace, documentOperations: operations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations: operations });
    const lease = await operations.acquireExclusive([tabId]);
    const handlers = new Map<string, (event: { sender: Sender }, input: unknown) => Promise<unknown>>();
    const publish = vi.fn();
    registerWorkspaceHandlers<Sender>({
      register: (channel, handler) => handlers.set(channel, handler),
      ensureWindow: async () => "window-1",
      isCurrentSender: () => true,
      application: { applyDocumentEdits: apply.apply, flushDocumentEdits: flush.flush },
      publish
    });
    const pending = handlers.get(APPLY_DOCUMENT_EDITS_CHANNEL)!(
      { sender: { id: "sender-1" } },
      { ...applyInput, tabId }
    );
    await Promise.resolve();
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    lease.release();

    await expect(pending).resolves.toEqual({
      kind: "error",
      error: { code: "tab-owner-changed", message: "Document tab owner changed." }
    });
    expect(workspace.getTabSession(tabId).content).toBe("");
    expect(publish).not.toHaveBeenCalled();
  });
});
