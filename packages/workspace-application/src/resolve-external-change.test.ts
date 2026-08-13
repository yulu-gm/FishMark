import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createResolveExternalChange } from "./resolve-external-change";

const externalVersion = {
  normalizedPath: "C:/notes/a.md",
  mtimeMs: 2,
  size: 8,
  contentHash: "external"
};

describe("createResolveExternalChange", () => {
  it("applies keep-memory by recording the external disk version", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const opened = workspace.openDocument("window-1", {
      fileIdentity: fileIdentity("file:a.md"),
      path: "C:/notes/a.md",
      name: "a.md",
      content: "saved",
      encoding: "utf-8"
    });
    const tabId = (opened as { projection: { activeTabId: string } }).projection.activeTabId;
    const resolve = createResolveExternalChange({
      workspace,
      reload: vi.fn(),
      saveAs: vi.fn()
    });

    await expect(resolve.resolve(
      { context: { id: 1 }, tabId, expectedWindowId: "window-1" },
      { kind: "keep-memory", diskVersion: externalVersion }
    )).resolves.toEqual({ kind: "resolved" });

    expect(workspace.getTabSession(tabId).diskVersion).toEqual(externalVersion);
  });

  it("returns cancelled for the cancel command without mutation", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const resolve = createResolveExternalChange({
      workspace,
      reload: vi.fn(),
      saveAs: vi.fn()
    });

    await expect(resolve.resolve(
      { context: { id: 1 }, tabId: "missing", expectedWindowId: "window-1" },
      { kind: "cancel" }
    )).resolves.toEqual({ kind: "cancelled" });
  });

  it("delegates reload and save-as to the injected ports", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const reload = vi.fn(async () => ({ kind: "success" }));
    const saveAs = vi.fn(async () => ({
      status: "success" as const,
      document: { path: "x", name: "x", content: "x", encoding: "utf-8" as const }
    }));
    const resolve = createResolveExternalChange({ workspace, reload, saveAs });

    await expect(resolve.resolve(
      { context: { id: 1 }, tabId: "tab-1", expectedWindowId: "window-1" },
      { kind: "reload" }
    )).resolves.toEqual({ kind: "reloaded", outcome: { kind: "success" } });

    await expect(resolve.resolve(
      { context: { id: 1 }, tabId: "tab-1", expectedWindowId: "window-1" },
      { kind: "save-as" }
    )).resolves.toEqual({ kind: "saved-as", outcome: { status: "success", document: { path: "x", name: "x", content: "x", encoding: "utf-8" } } });
  });
});
