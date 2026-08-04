import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it } from "vitest";

import { createUpdateDocumentDraft } from "./index";

describe("createUpdateDocumentDraft", () => {
  it("retains the deferred full-draft owner CAS under an explicit name", () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const updateDocumentDraft = createUpdateDocumentDraft({ workspace });

    const result = updateDocumentDraft.update({
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
});
