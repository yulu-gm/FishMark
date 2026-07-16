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

    const projection = application.updateDraft({
      tabId,
      content: "# Canonical\n"
    });

    expect(updateTabDraft).toHaveBeenCalledWith(tabId, "# Canonical\n");
    expect(projection.activeDocument).toMatchObject({
      tabId,
      content: "# Canonical\n",
      isDirty: true
    });
  });
});
