import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenMarkdownDocument,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import { createWorkspaceReload } from "@fishmark/workspace-application";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { openTestDocument } from "./workspace.test-helper";

function createWorkspaceReloadWithPorts(
  dependencies: Omit<
    Parameters<typeof createWorkspaceReload>[0],
    "fileIdentity" | "file" | "recentFiles"
  > & {
    fileIdentityResolver: Parameters<typeof createWorkspaceReload>[0]["fileIdentity"];
    openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
    recordRecentFilePath: (targetPath: string) => Promise<void>;
  }
) {
  const {
    fileIdentityResolver,
    openMarkdownFileFromPath,
    recordRecentFilePath,
    ...rest
  } = dependencies;
  return createWorkspaceReload({
    ...rest,
    fileIdentity: fileIdentityResolver,
    file: { read: openMarkdownFileFromPath },
    recentFiles: { record: recordRecentFilePath }
  });
}

function createWorkspaceReloadForTest(
  dependencies: Omit<
    Parameters<typeof createWorkspaceReloadWithPorts>[0],
    | "tabOperations"
    | "fileLocationOperations"
    | "fileObjectOperations"
    | "fileIdentityResolver"
  > & {
    openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
    recordRecentFilePath: (targetPath: string) => Promise<void>;
    fileIdentityResolver?: Parameters<
      typeof createWorkspaceReloadWithPorts
    >[0]["fileIdentityResolver"];
  }
) {
  const {
    openMarkdownFileFromPath,
    recordRecentFilePath,
    fileIdentityResolver,
    ...rest
  } = dependencies;
  return createWorkspaceReloadWithPorts({
    ...rest,
    tabOperations: createKeyedOperationCoordinator(),
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentityResolver: fileIdentityResolver ?? {
      resolveExisting: async (targetPath) => resolvedTestFile(targetPath)
    },
    openMarkdownFileFromPath,
    recordRecentFilePath
  });
}

function resolvedTestFile(targetPath: string) {
  const identity = fileIdentity(`file:${targetPath.toLowerCase()}`);
  return {
    canonicalPath: targetPath,
    identity,
    exists: true as const,
    pathKey: identity.location,
    physicalKey: identity.object
  };
}

function document(name: string, content: string): OpenMarkdownDocument & { fileIdentity: ReturnType<typeof fileIdentity> } {
  return {
    fileIdentity: fileIdentity(`file:c:/notes/${name.toLowerCase()}`),
    path: `C:/notes/${name}`,
    name,
    content,
    encoding: "utf-8"
  };
}

describe("workspace reload use case", () => {
  it("returns a typed identity error when the file location changes before reload", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(
      workspace,
      "window-1",
      document("moved.md", "before")
    ).activeTabId!;
    const changedIdentity = fileIdentity(
      "path:c:/different/moved.md",
      "inode:7:2"
    );
    const application = createWorkspaceReloadWithPorts({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: vi.fn(async () => ({
          canonicalPath: "C:/different/moved.md",
          identity: changedIdentity,
          exists: true as const,
          pathKey: changedIdentity.location,
          physicalKey: changedIdentity.object
        }))
      },
      openMarkdownFileFromPath: vi.fn(),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      application.reloadTab({ tabId, expectedWindowId: "window-1" })
    ).resolves.toEqual({
      kind: "error",
      error: {
        code: "file-identity-changed",
        message: "The Markdown file changed while reloading. Please try again."
      }
    });
    expect(workspace.getTabSession(tabId).content).toBe("before");
  });

  it("returns a typed read error instead of rejecting when disk IO fails", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(
      workspace,
      "window-1",
      document("unreadable.md", "before")
    ).activeTabId!;
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "error" as const,
        error: {
          code: "read-failed" as const,
          message: "EACCES: internal filesystem details"
        }
      })),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      application.reloadTab({ tabId, expectedWindowId: "window-1" })
    ).resolves.toEqual({
      kind: "error",
      error: {
        code: "read-failed",
        message: "The Markdown file could not be read."
      }
    });
    expect(workspace.getTabSession(tabId).content).toBe("before");
  });

  it("returns a typed read error when the identity checkpoint cannot be resolved", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(
      workspace,
      "window-1",
      document("missing.md", "before")
    ).activeTabId!;
    const application = createWorkspaceReloadWithPorts({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: vi.fn(async () => {
          throw new Error("ENOENT: internal filesystem details");
        })
      },
      openMarkdownFileFromPath: vi.fn(),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      application.reloadTab({ tabId, expectedWindowId: "window-1" })
    ).resolves.toEqual({
      kind: "error",
      error: {
        code: "read-failed",
        message: "The Markdown file could not be read."
      }
    });
  });

  it("returns a typed ownership conflict without replacing either tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const sourceIdentity = fileIdentity(
      "path:c:/notes/source.md",
      "inode:7:1"
    );
    const ownedIdentity = fileIdentity(
      "path:c:/notes/owned.md",
      "inode:7:2"
    );
    const sourceTabId = openTestDocument(workspace, "window-1", {
      ...document("source.md", "source before"),
      fileIdentity: sourceIdentity
    }).activeTabId!;
    const ownerTabId = openTestDocument(workspace, "window-1", {
      ...document("owned.md", "owner content"),
      fileIdentity: ownedIdentity
    }).activeTabId!;
    const conflictingIdentity = fileIdentity(
      sourceIdentity.location,
      ownedIdentity.object
    );
    const application = createWorkspaceReloadWithPorts({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: vi.fn(async () => ({
          canonicalPath: "C:/notes/source.md",
          identity: conflictingIdentity,
          exists: true as const,
          pathKey: conflictingIdentity.location,
          physicalKey: conflictingIdentity.object
        }))
      },
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("source.md", "disk content")
      })),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      application.reloadTab({
        tabId: sourceTabId,
        expectedWindowId: "window-1"
      })
    ).resolves.toEqual({
      kind: "error",
      error: {
        code: "file-identity-conflict",
        message: "That file is already open in another tab."
      }
    });
    expect(workspace.getTabSession(sourceTabId).content).toBe("source before");
    expect(workspace.getTabSession(ownerTabId).content).toBe("owner content");
  });

  it("migrates the object identity when an explicit reload observes inode replacement", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const location = "path:c:/notes/replaced.md";
    const oldIdentity = fileIdentity(location, "inode:7:1");
    const newIdentity = fileIdentity(location, "inode:7:2");
    const tabId = openTestDocument(workspace, "window-1", {
      ...document("replaced.md", "before"),
      fileIdentity: oldIdentity
    }).activeTabId!;
    const resolved = {
      canonicalPath: "C:/notes/replaced.md",
      identity: newIdentity,
      exists: true as const,
      pathKey: newIdentity.location,
      physicalKey: newIdentity.object
    };
    const application = createWorkspaceReloadWithPorts({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: { resolveExisting: vi.fn(async () => resolved) },
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("replaced.md", "after")
      })),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await application.reloadTab({ tabId, expectedWindowId: "window-1" });

    expect(workspace.getTabSession(tabId)).toMatchObject({
      fileIdentity: newIdentity,
      content: "after",
      isDirty: false
    });
  });

  it.each([
    ["null", null],
    ["different", "C:/notes/other.md"]
  ])(
    "rejects a reload adapter result with a %s path without recording or mutating",
    async (_caseName, returnedPath) => {
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      workspace.registerWindow("window-1");
      const tabId = openTestDocument(workspace,
        "window-1",
        document("canonical.md", "before")
      ).activeTabId!;
      const recordRecentFilePath = vi.fn(async () => undefined);
      const application = createWorkspaceReloadForTest({
        workspace,
        openMarkdownFileFromPath: vi.fn(async () => JSON.parse(JSON.stringify({
          status: "success" as const,
          document: {
            path: returnedPath,
            name: "adapter.md",
            content: "disk",
            encoding: "utf-8" as const
          }
        }))),
        recordRecentFilePath
      });

      await expect(
        application.reloadTab({ tabId, expectedWindowId: "window-1" })
      ).rejects.toThrow(/Reload adapter/);
      expect(workspace.getTabSession(tabId)).toMatchObject({
        path: "C:/notes/canonical.md",
        name: "canonical.md",
        content: "before",
        revision: 0,
        savedRevision: 0,
        isDirty: false
      });
      expect(recordRecentFilePath).not.toHaveBeenCalled();
    }
  );

  it("reads only the canonical path after Save As retargets the document", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("before.md", "before")
    ).activeTabId!;
    workspace.saveTabDocument({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 0,
      document: document("after.md", "before"),
      diskVersion: null
    });
    const openMarkdownFileFromPath = vi.fn(async () => ({
      status: "success" as const,
      document: document("after.md", "disk")
    }));
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/after.md");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/after.md",
      content: "disk"
    });
  });

  it("replaces an unchanged captured checkpoint after deferred IO", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("reload.md", "before")
    ).activeTabId!;
    const recordRecentFilePath = vi.fn(async () => undefined);
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("reload.md", "after")
      })),
      recordRecentFilePath
    });

    const result = await application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    expect(result).toMatchObject({
      kind: "success",
      projection: {
        windowId: "window-1",
        activeDocument: { content: "after", isDirty: false }
      }
    });
    expect(recordRecentFilePath).toHaveBeenCalledWith("C:/notes/reload.md");
  });

  it("returns an explicit revision-stale result without recording recent or overwriting an edit during IO", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("edit-race.md", "before")
    ).activeTabId!;
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const recordRecentFilePath = vi.fn(async () => undefined);
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "new draft" });
    resolveRead({
      status: "success",
      document: document("edit-race.md", "disk after")
    });

    await expect(reloadPromise).resolves.toEqual({ kind: "revision-stale" });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "new draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("rejects a reload commit after an out-of-band owner change", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("source.md", "source"));
    const tabId = openTestDocument(workspace,
      "window-1",
      document("move-race.md", "before")
    ).activeTabId!;
    workspace.registerWindow("window-2");
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveRead({
      status: "success",
      document: document("move-race.md", "disk after")
    });

    await expect(reloadPromise).resolves.toMatchObject({
      kind: "stale",
      reason: "window-changed"
    });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "before",
      revision: 0,
      savedRevision: 0,
      isDirty: false
    });
  });

  it("explicitly rejects a stale reload after the expected window closes", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("closed-window.md", "before")
    ).activeTabId!;
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const application = createWorkspaceReloadForTest({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveRead({
      status: "success",
      document: document("closed-window.md", "disk after")
    });

    await expect(reloadPromise).resolves.toEqual({
      kind: "stale",
      reason: "window-missing",
      projection: null
    });
  });
});
