import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceApplication } from "./workspace-application";

describe("createWorkspaceApplication", () => {
  it("delegates draft updates to the canonical workspace state", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const updateTabDraft = vi.spyOn(workspace, "updateTabDraft");
    const application = createWorkspaceApplication({ workspace });

    const result = application.updateDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "# Canonical\n"
    });

    expect(updateTabDraft).toHaveBeenCalledWith({
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

  it("returns a stale result without exposing the target projection to the old owner", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    const application = createWorkspaceApplication({ workspace });

    const result = application.updateDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "late draft"
    });

    expect(result).toMatchObject({
      kind: "stale",
      reason: "window-changed",
      projection: expect.objectContaining({ windowId: "window-1" })
    });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: ""
    });
  });
});
