import { createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceOpenApplication } from "./workspace-open-application";

const resolvedIdentity = fileIdentity("path:c:/real/note.md", "inode:7:42");
const resolved = {
  canonicalPath: "C:/real/note.md",
  identity: resolvedIdentity,
  exists: true as const,
  pathKey: resolvedIdentity.location,
  physicalKey: resolvedIdentity.object
};

describe("workspace open application", () => {
  it("serializes duplicate opens and reads the physical file only once", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const read = vi.fn(async () => ({
      status: "success" as const,
      document: { path: resolved.canonicalPath, name: "note.md", content: "body", encoding: "utf-8" as const }
    }));
    const activateOwnerWindowTab = vi.fn(async () => undefined);
    const application = createWorkspaceOpenApplication({
      workspace,
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    const [first, second] = await Promise.all([
      application.openPath({ windowId: "window-1", targetPath: "C:/alias-a.md" }),
      application.openPath({ windowId: "window-2", targetPath: "C:/alias-b.md" })
    ]);

    expect(first.kind).toBe("success");
    expect(second).toEqual({ kind: "focused-existing" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(activateOwnerWindowTab).toHaveBeenCalledWith("window-1", expect.any(String));
    expect(workspace.getWindowTabIds("window-1")).toHaveLength(1);
    expect(workspace.getWindowTabIds("window-2")).toHaveLength(0);
  });

  it("activates an existing same-window tab without rereading it", async () => {
    const workspace = createWorkspaceState();
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
    const application = createWorkspaceOpenApplication({
      workspace,
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      openMarkdownFileFromPath: read,
      activateOwnerWindowTab: vi.fn(),
      recordRecentFilePath: vi.fn()
    });

    const result = await application.openPath({ windowId: "window-1", targetPath: "alias.md" });

    expect(result.kind).toBe("success");
    expect(result.kind === "success" && result.projection.activeDocument?.path).toBe(resolved.canonicalPath);
    expect(read).not.toHaveBeenCalled();
  });

  it("identifies and activates the owning tab before focusing its window", async () => {
    const workspace = createWorkspaceState();
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
    const activateOwnerWindowTab = vi.fn();
    const application = createWorkspaceOpenApplication({
      workspace,
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting: vi.fn(async () => resolved),
      openMarkdownFileFromPath: vi.fn(),
      activateOwnerWindowTab,
      recordRecentFilePath: vi.fn()
    });

    await expect(
      application.openPath({ windowId: "window-2", targetPath: "alias.md" })
    ).resolves.toEqual({ kind: "focused-existing" });
    expect(activateOwnerWindowTab).toHaveBeenCalledWith("window-1", ownerTabId);
  });

  it("re-resolves identity after acquiring the location lease", async () => {
    const workspace = createWorkspaceState();
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
    const resolveExisting = vi
      .fn()
      .mockResolvedValueOnce(resolved)
      .mockResolvedValue(replacement);
    const application = createWorkspaceOpenApplication({
      workspace,
      fileLocationOperations: locationOperations,
      fileObjectOperations: createKeyedOperationCoordinator(),
      resolveExisting,
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const,
        document: {
          path: resolved.canonicalPath,
          name: "note.md",
          content: "replacement",
          encoding: "utf-8" as const
        }
      })),
      activateOwnerWindowTab: vi.fn(),
      recordRecentFilePath: vi.fn()
    });

    const opening = application.openPath({
      windowId: "window-1",
      targetPath: resolved.canonicalPath
    });
    await vi.waitFor(() => expect(resolveExisting).toHaveBeenCalledOnce());
    blocker.release();
    await opening;

    expect(resolveExisting).toHaveBeenCalledTimes(4);
    expect(workspace.getTabSession(workspace.getWindowTabIds("window-1")[0]!))
      .toMatchObject({ fileIdentity: replacementIdentity });
  });
});
