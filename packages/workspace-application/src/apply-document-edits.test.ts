import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";

import { createApplyDocumentEdits } from "./index";

describe("createApplyDocumentEdits", () => {
  it("applies the current full-draft command through the owner-aware domain CAS", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const applyDocumentEdits = createApplyDocumentEdits({ workspace });

    const result = applyDocumentEdits.apply({
      tabId,
      expectedWindowId: "window-1",
      content: "# Canonical\n"
    });

    expect(result.kind).toBe("applied");
    expect(result.projection?.activeDocument).toMatchObject({
      tabId,
      content: "# Canonical\n",
      isDirty: true
    });
  });

  it("does not expose the new owner's projection to a stale source window", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    const applyDocumentEdits = createApplyDocumentEdits({ workspace });

    const result = applyDocumentEdits.apply({
      tabId,
      expectedWindowId: "window-1",
      content: "late draft"
    });

    expect(result).toMatchObject({
      kind: "stale",
      reason: "window-changed",
      projection: expect.objectContaining({ windowId: "window-1" })
    });
    expect(workspace.getTabSession(tabId).content).toBe("");
  });
});
