import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceOpen } from "@fishmark/workspace-application";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

function createWorkspaceOpenForTest(
  dependencies: Omit<
    Parameters<typeof createWorkspaceOpen>[0],
    "fileIdentity" | "file" | "ownerActivation" | "recentFiles" | "chooseOpenPath"
  > & {
    resolveExisting: Parameters<typeof createWorkspaceOpen>[0]["fileIdentity"]["resolveExisting"];
    resolveProspective: Parameters<typeof createWorkspaceOpen>[0]["fileIdentity"]["resolveProspective"];
    openMarkdownFileFromPath: Parameters<typeof createWorkspaceOpen>[0]["file"]["read"];
    activateOwnerWindowTab: Parameters<typeof createWorkspaceOpen>[0]["ownerActivation"]["activateOwnerWindowTab"];
    recordRecentFilePath: Parameters<typeof createWorkspaceOpen>[0]["recentFiles"]["record"];
  }
) {
  const {
    resolveExisting,
    resolveProspective,
    openMarkdownFileFromPath,
    activateOwnerWindowTab,
    recordRecentFilePath,
    ...rest
  } = dependencies;
  return createWorkspaceOpen({
    ...rest,
    fileIdentity: { resolveExisting, resolveProspective },
    file: { read: openMarkdownFileFromPath },
    ownerActivation: { activateOwnerWindowTab },
    recentFiles: { record: recordRecentFilePath },
    chooseOpenPath: async () => ({ status: "cancelled" })
  });
}

const resolvedIdentity = fileIdentity("path:c:/real/note.md", "inode:7:42");
const resolved = {
  canonicalPath: "C:/real/note.md",
  identity: resolvedIdentity,
  exists: true as const,
  pathKey: resolvedIdentity.location,
  physicalKey: resolvedIdentity.object
};

describe("workspace open use case", () => {
  it("serializes duplicate opens and reads the physical file only once", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const read = vi.fn(async () => ({
      status: "success" as const, diskVersion: { normalizedPath: "C:/real/note.md", mtimeMs: 1, size: 1, contentHash: "test-hash" },
      document: { path: resolved.canonicalPath, name: "note.md", content: "body", encoding: "utf-8" as const }
    }));
    const activateOwnerWindowTab = vi.fn(async () => "activated" as const);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab,
      recordRecentFilePath
    });

    const [first, second] = await Promise.all([
      application.openPath({ windowId: "window-1", targetPath: "C:/alias-a.md" }),
      application.openPath({ windowId: "window-2", targetPath: "C:/alias-b.md" })
    ]);

    expect(first.kind).toBe("success");
    expect(second).toEqual({ kind: "focused-existing" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(activateOwnerWindowTab).toHaveBeenCalledWith(
      "window-1",
      expect.any(String),
      resolved.identity
    );
    expect(recordRecentFilePath).toHaveBeenCalledTimes(2);
    expect(workspace.getWindowTabIds("window-1")).toHaveLength(1);
    expect(workspace.getWindowTabIds("window-2")).toHaveLength(0);
  });

  it("activates an existing same-window tab without rereading it", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "body",
      encoding: "utf-8"
    });
    workspace.createUntitledTab("window-1");
    const read = vi.fn();
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab: vi.fn(async () => "activated" as const),
      recordRecentFilePath: vi.fn()
    });

    const result = await application.openPath({ windowId: "window-1", targetPath: "alias.md" });

    expect(result.kind).toBe("success");
    expect(result.kind === "success" && result.projection.activeDocument?.path).toBe(resolved.canonicalPath);
    expect(read).not.toHaveBeenCalled();
  });

  it("identifies and activates the owning tab before focusing its window", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const ownerTabId = workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "body",
      encoding: "utf-8"
    }).kind === "opened"
      ? workspace.getWindowProjection("window-1").activeTabId!
      : "unreachable";
    workspace.createUntitledTab("window-1");
    const activateOwnerWindowTab = vi.fn(async () => "activated" as const);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(),
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    await expect(
      application.openPath({ windowId: "window-2", targetPath: "alias.md" })
    ).resolves.toEqual({ kind: "focused-existing" });
    expect(activateOwnerWindowTab).toHaveBeenCalledWith(
      "window-1",
      ownerTabId,
      resolved.identity
    );
  });

  it("re-resolves identity after acquiring the location lease", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const locationOperations = createKeyedOperationCoordinator<
      typeof resolved.identity.location
    >();
    const blocker = await locationOperations.acquireExclusive([resolved.pathKey]);
    const replacementIdentity = fileIdentity(
      resolved.identity.location,
      "inode:7:replacement"
    );
    const replacement = {
      ...resolved,
      identity: replacementIdentity,
      physicalKey: replacementIdentity.object
    };
    const resolveExisting = vi.fn(async () => replacement);
    const resolveProspective = vi.fn(async () => resolved);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: locationOperations,
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting,
      resolveProspective,
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const, diskVersion: { normalizedPath: "C:/real/note.md", mtimeMs: 1, size: 1, contentHash: "test-hash" },
        document: {
          path: resolved.canonicalPath,
          name: "note.md",
          content: "replacement",
          encoding: "utf-8" as const
        }
      })),
      activateOwnerWindowTab: vi.fn(async () => "activated" as const),
      recordRecentFilePath: vi.fn()
    });

    const opening = application.openPath({
      windowId: "window-1",
      targetPath: resolved.canonicalPath
    });
    await vi.waitFor(() => expect(resolveProspective).toHaveBeenCalledOnce());
    expect(resolveExisting).not.toHaveBeenCalled();
    blocker.release();
    await opening;

    expect(resolveExisting).toHaveBeenCalledTimes(3);
    expect(workspace.getTabSession(workspace.getWindowTabIds("window-1")[0]!))
      .toMatchObject({ fileIdentity: replacementIdentity });
  });

  it("rejects a final location change even when the object identity is unchanged", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const movedIdentity = fileIdentity("path:c:/moved/note.md", resolved.identity.object);
    const moved = {
      ...resolved,
      canonicalPath: "C:/moved/note.md",
      identity: movedIdentity,
      pathKey: movedIdentity.location
    };
    const resolveExisting = vi
      .fn()
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(moved);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting,
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const, diskVersion: { normalizedPath: "C:/real/note.md", mtimeMs: 1, size: 1, contentHash: "test-hash" },
        document: {
          path: resolved.canonicalPath,
          name: "note.md",
          content: "body",
          encoding: "utf-8" as const
        }
      })),
      activateOwnerWindowTab: vi.fn(async () => "activated" as const),
      recordRecentFilePath: vi.fn()
    });

    await expect(application.openPath({
      windowId: "window-1",
      targetPath: resolved.canonicalPath
    })).resolves.toMatchObject({ kind: "error", error: { code: "read-failed" } });
    expect(workspace.getWindowTabIds("window-1")).toHaveLength(0);
  });

  it("retries instead of focusing an owner removed while its tab lease is held", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "old",
      encoding: "utf-8"
    });
    const ownerTabId = workspace.getWindowTabIds("window-1")[0]!;
    const ownerCheckpoint = workspace.getTabSession(ownerTabId);
    const tabOperations = createKeyedOperationCoordinator<string>();
    const ownerLease = await tabOperations.acquireExclusive([ownerTabId]);
    const resolveExisting = vi.fn(async () => resolved);
    const read = vi.fn(async () => ({
      status: "success" as const, diskVersion: { normalizedPath: "C:/real/note.md", mtimeMs: 1, size: 1, contentHash: "test-hash" },
      document: {
        path: resolved.canonicalPath,
        name: "note.md",
        content: "new",
        encoding: "utf-8" as const
      }
    }));
    const activateOwnerWindowTab = vi.fn(async () => "activated" as const);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations,
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting,
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    const opening = application.openPath({
      windowId: "window-2",
      targetPath: resolved.canonicalPath
    });
    await vi.waitFor(() => expect(resolveExisting).toHaveBeenCalledTimes(2));
    workspace.closeTab({
      tabId: ownerTabId,
      expectedWindowId: "window-1",
      expectedRevision: ownerCheckpoint.revision
    });
    ownerLease.release();

    await expect(opening).resolves.toMatchObject({ kind: "success" });
    expect(activateOwnerWindowTab).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledOnce();
    expect(workspace.getWindowTabIds("window-2")).toHaveLength(1);
  });

  it("fails closed when location and object identities have different owners", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const firstIdentity = fileIdentity("path:c:/first.md", "inode:7:first");
    const secondIdentity = fileIdentity("path:c:/second.md", "inode:7:second");
    workspace.openDocument("window-1", {
      fileIdentity: firstIdentity,
      path: "C:/first.md",
      name: "first.md",
      content: "first",
      encoding: "utf-8"
    });
    workspace.openDocument("window-1", {
      fileIdentity: secondIdentity,
      path: "C:/second.md",
      name: "second.md",
      content: "second",
      encoding: "utf-8"
    });
    const ambiguousIdentity = fileIdentity(
      firstIdentity.location,
      secondIdentity.object
    );
    const ambiguous = {
      ...resolved,
      identity: ambiguousIdentity,
      pathKey: ambiguousIdentity.location,
      physicalKey: ambiguousIdentity.object
    };
    const read = vi.fn();
    const activateOwnerWindowTab = vi.fn(async () => "failed" as const);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => ambiguous),
      resolveProspective: vi.fn(async () => ambiguous),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    await expect(application.openPath({
      windowId: "window-2",
      targetPath: ambiguous.canonicalPath
    })).resolves.toMatchObject({ kind: "error", error: { code: "read-failed" } });
    expect(read).not.toHaveBeenCalled();
    expect(activateOwnerWindowTab).not.toHaveBeenCalled();
  });

  it("fails closed after the bounded owner retry budget is exhausted", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "body",
      encoding: "utf-8"
    });
    const activateOwnerWindowTab = vi.fn(async () => "retry" as const);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(),
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    await expect(application.openPath({
      windowId: "window-2",
      targetPath: resolved.canonicalPath
    })).resolves.toMatchObject({ kind: "error", error: { code: "read-failed" } });
    expect(activateOwnerWindowTab).toHaveBeenCalledTimes(3);
  });

  it("does not report focused-existing when owner renderer activation fails", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "body",
      encoding: "utf-8"
    });
    const recordRecentFilePath = vi.fn();
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(),
      activateOwnerWindowTab: vi.fn(async () => "failed" as const),
      recordRecentFilePath
    });

    await expect(application.openPath({
      windowId: "window-2",
      targetPath: resolved.canonicalPath
    })).resolves.toMatchObject({ kind: "error", error: { code: "read-failed" } });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("retries against the new owner when the tab moves before activation confirmation", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.registerWindow("window-3");
    workspace.openDocument("window-1", {
      fileIdentity: resolved.identity,
      path: resolved.canonicalPath,
      name: "note.md",
      content: "body",
      encoding: "utf-8"
    });
    const ownerTabId = workspace.getWindowTabIds("window-1")[0]!;
    const activateOwnerWindowTab = vi
      .fn()
      .mockImplementationOnce(async () => {
        workspace.moveTabToWindow({
          tabId: ownerTabId,
          targetWindowId: "window-3"
        });
        return "retry" as const;
      })
      .mockResolvedValue("activated" as const);
    const application = createWorkspaceOpenForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      resolveProspective: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(),
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    await expect(application.openPath({
      windowId: "window-2",
      targetPath: resolved.canonicalPath
    })).resolves.toEqual({ kind: "focused-existing" });
    expect(activateOwnerWindowTab.mock.calls.map(([windowId]) => windowId)).toEqual([
      "window-1",
      "window-3"
    ]);
  });
});
