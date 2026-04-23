import { describe, expect, it } from "vitest";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceApplication } from "./workspace-application";
import { createWorkspaceService } from "./workspace-service";

describe("createWorkspaceApplication", () => {
  it("saves the canonical draft even when the renderer payload is stale", async () => {
    const workspace = createWorkspaceService();
    workspace.registerWindow("window-1");
    const snapshot = workspace.createUntitledTab("window-1");
    const tabId = snapshot.activeTabId!;

    workspace.updateTabDraft(tabId, "# Canonical\n");

    const writes: string[] = [];
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: async ({ content, path }) => {
        writes.push(`${path}:${content}`);
        return {
          status: "success",
          document: { path, name: "note.md", content, encoding: "utf-8" }
        };
      }
    });

    await application.saveTab({
      tabId,
      path: "C:/notes/note.md"
    });

    expect(writes).toEqual(["C:/notes/note.md:# Canonical\n"]);
  });

  it("preserves a newer canonical draft when save completion races with another edit", async () => {
    const workspace = createWorkspaceService();
    workspace.registerWindow("window-1");
    const snapshot = workspace.createUntitledTab("window-1");
    const tabId = snapshot.activeTabId!;
    workspace.updateTabDraft(tabId, "# Saved draft\n");

    let resolveSave!: (value: SaveMarkdownFileResult) => void;

    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: ({ content, path }) =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveSave = resolve;
          expect(content).toBe("# Saved draft\n");
          expect(path).toBe("C:/notes/note.md");
        })
    });

    const savePromise = application.saveTab({
      tabId,
      path: "C:/notes/note.md"
    });

    workspace.updateTabDraft(tabId, "# Newer draft\n");
    resolveSave({
      status: "success",
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved draft\n",
        encoding: "utf-8"
      }
    });

    await savePromise;

    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/note.md",
      name: "note.md",
      content: "# Newer draft\n",
      lastSavedContent: "# Saved draft\n",
      isDirty: true
    });
  });
});
