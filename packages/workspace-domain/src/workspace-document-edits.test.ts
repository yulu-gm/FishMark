import { describe, expect, it } from "vitest";

import {
  createStringTextBuffer,
  createWorkspaceState,
  type ApplyWorkspaceDocumentEditsResult
} from "./index";

function createWorkspaceWithTab() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("window-1");
  const tabId = workspace.createUntitledTab("window-1").activeTabId!;
  return { workspace, tabId };
}

describe("workspace document edit protocol", () => {
  it("atomically applies an owner-aware edit and returns metadata only", () => {
    const { workspace, tabId } = createWorkspaceWithTab();

    const result = workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client:a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "Hello\r\n😀" }]
    });

    expect(result).toEqual({
      kind: "applied",
      acknowledgedSequence: 1,
      projection: { tabId, revision: 1, savedRevision: 0, isDirty: true }
    });
    expect("content" in result).toBe(false);
    expect(workspace.getTabSession(tabId).content).toBe("Hello\r\n😀");
  });

  it("acknowledges duplicates without replacing the canonical session", () => {
    const { workspace, tabId } = createWorkspaceWithTab();
    const first = workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "first" }]
    });
    const duplicate = workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: Number.NaN,
      changes: null as never
    });

    expect(first.kind).toBe("applied");
    expect(duplicate).toEqual({
      kind: "duplicate",
      acknowledgedSequence: 1,
      projection: { tabId, revision: 1, savedRevision: 0, isDirty: true }
    });
    expect(workspace.getTabSession(tabId).content).toBe("first");
  });

  it("returns canonical text only for an owner revision conflict", () => {
    const { workspace, tabId } = createWorkspaceWithTab();
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "canonical"
    });

    expect(workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "local" }]
    })).toEqual({
      kind: "revision-conflict",
      canonicalRevision: 1,
      canonicalText: "canonical",
      isDirty: true
    });
  });

  it("does not leak a moved or missing tab projection or text", () => {
    const { workspace, tabId } = createWorkspaceWithTab();
    workspace.registerWindow("window-2");
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });

    const moved = workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "stale" }]
    });
    const missing = workspace.applyDocumentEdits({
      tabId: "missing-tab",
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "stale" }]
    });

    expect(moved).toEqual({
      kind: "error",
      error: { code: "tab-owner-changed", message: "Document tab owner changed." }
    });
    expect(missing).toEqual({
      kind: "error",
      error: { code: "unknown-tab", message: "Unknown document tab." }
    });
  });

  it("queries independent client high-watermarks without document content", () => {
    const { workspace, tabId } = createWorkspaceWithTab();
    workspace.applyDocumentEdits({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "x" }]
    });

    expect(workspace.getDocumentEditCheckpoint({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-a"
    })).toEqual({
      kind: "checkpoint",
      acknowledgedSequence: 1,
      projection: { tabId, revision: 1, savedRevision: 0, isDirty: true }
    });
    expect(workspace.getDocumentEditCheckpoint({
      tabId,
      expectedWindowId: "window-1",
      clientId: "client-b"
    })).toMatchObject({ kind: "checkpoint", acknowledgedSequence: 0 });
  });

  it("keeps the public normal result union content-free", () => {
    const assertNormalResult = (result: ApplyWorkspaceDocumentEditsResult): void => {
      if (result.kind === "applied" || result.kind === "duplicate") {
        // @ts-expect-error normal acknowledgements never expose canonical text
        void result.canonicalText;
      }
    };
    expect(assertNormalResult).toBeTypeOf("function");
  });
});
