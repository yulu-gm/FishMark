import { describe, expect, it } from "vitest";

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
        diskVersion: null
      }
    ],
    lastFocusedWindowId: "window-1",
    nextTabId: 2
  };
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
