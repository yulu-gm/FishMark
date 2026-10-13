import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";
import { toWorkspaceWindowSnapshot } from "./workspace-ipc-projection";
import { createWorkspaceEditorViewHandoffs } from "./workspace-editor-view-handoffs";

function setup() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("source");
  workspace.registerWindow("target");
  workspace.openDocument("source", { fileIdentity: fileIdentity("file:view"), path: "C:/view.md", name: "view.md", content: "0123456789", encoding: "utf-8" });
  const tabId = workspace.getWindowProjection("source").activeTabId!;
  let identity = 0;
  const handoffs = createWorkspaceEditorViewHandoffs({ workspace, createId: () => `view-${++identity}` });
  const snapshot = (windowId: string) => toWorkspaceWindowSnapshot(workspace.getWindowProjection(windowId));
  const view = { revision: 0, selection: { anchor: 7, head: 3 } };
  return { workspace, tabId, handoffs, snapshot, view };
}

describe("workspace editor view handoffs", () => {
  it("stages before readiness, exposes only after ownership moves, and preserves repeated reads without entering persistence", () => {
    const { workspace, tabId, handoffs, snapshot, view } = setup();
    handoffs.stage(tabId, "source", view);
    expect(handoffs.decorate(snapshot("source"))).toEqual(snapshot("source"));
    expect(handoffs.decorate(snapshot("target"))).toEqual(snapshot("target"));
    workspace.detachTabToWindow({ tabId, targetWindowId: "target" });
    const expected = { ...snapshot("target"), editorViewHandoff: { handoffId: "view-1", tabId, ...view } };
    expect(handoffs.decorate(snapshot("target"))).toEqual(expected);
    expect(handoffs.decorate(snapshot("target"))).toEqual(expected);
    expect(JSON.stringify(workspace.exportSnapshot())).not.toContain("editorViewHandoff");
  });

  it.each([
    { revision: 1, selection: { anchor: 7, head: 3 } },
    { revision: 0, selection: { anchor: -1, head: 3 } },
    { revision: 0, selection: { anchor: 11, head: 3 } },
    { revision: 0, selection: { anchor: 1.5, head: 3 } },
    { revision: 0, selection: { anchor: "7", head: 3 } },
    { revision: 0, selection: { anchor: 7, head: Infinity } }
  ])("rejects mismatched revision or invalid offsets before transferring ownership: %j", (view) => {
    const { workspace, tabId, handoffs } = setup();
    expect(() => handoffs.stage(tabId, "source", view)).toThrow("selection does not match");
    expect(workspace.getTabSession(tabId).windowId).toBe("source");
  });

  it("rejects non-owner staging", () => {
    const { tabId, handoffs, view } = setup();
    expect(() => handoffs.stage(tabId, "target", view)).toThrow("moved to another window");
  });

  it("clears a failed same-owner transfer but keeps a committed transfer after watcher failure", () => {
    const { workspace, tabId, handoffs, snapshot, view } = setup();
    const failed = handoffs.stage(tabId, "source", view);
    handoffs.abort(tabId, failed);
    workspace.detachTabToWindow({ tabId, targetWindowId: "target" });
    expect(handoffs.decorate(snapshot("target"))).toEqual(snapshot("target"));
    const committed = handoffs.stage(tabId, "target", view);
    workspace.moveTabToWindow({ tabId, targetWindowId: "source" });
    handoffs.abort(tabId, committed);
    expect(handoffs.decorate(snapshot("source")).editorViewHandoff?.handoffId).toBe(committed);
  });

  it("prunes closed tabs and changed revisions, and replaces the envelope on the next transfer", () => {
    const { workspace, tabId, handoffs, snapshot, view } = setup();
    handoffs.stage(tabId, "source", view);
    workspace.moveTabToWindow({ tabId, targetWindowId: "target" });
    const next = handoffs.stage(tabId, "target", view);
    workspace.moveTabToWindow({ tabId, targetWindowId: "source" });
    expect(handoffs.decorate(snapshot("source")).editorViewHandoff?.handoffId).toBe(next);
    workspace.applyDocumentEdits({ tabId, expectedWindowId: "source", clientId: "client", clientSequence: 1, baseRevision: 0, changes: [{ from: 10, to: 10, insert: "!" }] });
    expect(handoffs.decorate(snapshot("source")).editorViewHandoff).toBeUndefined();
    handoffs.stage(tabId, "source", { ...view, revision: 1 });
    workspace.unregisterWindow("source");
    handoffs.prune();
    expect(() => handoffs.abort(tabId, next)).not.toThrow();
  });
});
