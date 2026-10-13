import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import {
  createSaveDocument,
  type KeyedOperationCoordinator,
  type KeyedOperationLease
} from "./index";

function createImmediateCoordinator<TKey extends string>(): KeyedOperationCoordinator<TKey> {
  const createLease = () => ({ release() {} }) as KeyedOperationLease<TKey>;
  return {
    runExclusive: async <T>(_key: TKey, operation: () => Promise<T>) => operation(),
    runExclusiveWithLease: async <T>(
      _key: TKey,
      operation: (lease: KeyedOperationLease<TKey>) => Promise<T>
    ) => operation(createLease()),
    acquireExclusive: async () => createLease(),
    isLeaseHeld: () => true
  };
}

describe("createSaveDocument", () => {
  it.each(["modified", "deleted"] as const)("publishes a %s conflict on the requested tab without accepting the external version or writing", async (kind) => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const identity = fileIdentity("file:c:/notes/a.md");
    const accepted = { normalizedPath: "C:/notes/a.md", mtimeMs: 1, size: 5, contentHash: "accepted" };
    const opened = workspace.openDocument("window-1", {
      fileIdentity: identity, path: "C:/notes/a.md", name: "a.md", content: "saved", encoding: "utf-8"
    }, accepted);
    if (opened.kind !== "opened") throw new Error("expected opened document");
    const tabId = opened.projection.activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "recovered draft" });
    const otherTabId = workspace.createUntitledTab("window-1").activeTabId!;
    const external = kind === "deleted" ? null : { ...accepted, mtimeMs: 2, contentHash: "external" };
    const writeDocument = vi.fn();
    const resolve = async () => ({ canonicalPath: accepted.normalizedPath, identity, exists: true as const, pathKey: identity.location, physicalKey: identity.object });
    const saveDocument = createSaveDocument({ workspace,
      tabOperations: createImmediateCoordinator(), fileLocationOperations: createImmediateCoordinator(), fileObjectOperations: createImmediateCoordinator(),
      fileIdentity: { resolveExisting: resolve, resolveProspective: resolve },
      disk: { readDiskVersion: async () => external, writeDocument }, dialog: { chooseSavePath: vi.fn() },
      watcher: { beginInternalWrite: vi.fn(), completeInternalWrite: vi.fn(), syncWindowPaths: vi.fn() },
      recentFiles: { record: vi.fn() }, cleanupReporter: { report: vi.fn() }
    });
    await expect(saveDocument.save({ context: {}, tabId, expectedWindowId: "window-1" })).resolves.toMatchObject({
      status: "error", error: { code: "disk-version-conflict" }
    });
    expect(writeDocument).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({ content: "recovered draft", revision: 1, savedRevision: 0,
      diskVersion: accepted, isDirty: true, externalChange: { kind } });
    expect(workspace.exportSnapshot().sessions.find((session) => session.tabId === tabId)?.savedContent).toBe("saved");
    expect(workspace.getTabSession(otherTabId).externalChange).toBeNull();
  });

  it("writes a captured canonical checkpoint and commits it clean", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const identity = fileIdentity("file:c:/notes/a.md");
    const opened = workspace.openDocument("window-1", {
      fileIdentity: identity,
      path: "C:/notes/a.md",
      name: "a.md",
      content: "saved",
      encoding: "utf-8"
    });
    if (opened.kind !== "opened") throw new Error("expected opened document");
    const tabId = opened.projection.activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "captured"
    });
    let persistedVersion: { normalizedPath: string; mtimeMs: number; size: number; contentHash: string } | null = null;
    const writeDocument = vi.fn(async (input: { path: string; content: string }) => {
      persistedVersion = {
        normalizedPath: input.path,
        mtimeMs: 1,
        size: input.content.length,
        contentHash: "hash-a"
      };
      return {
        status: "success" as const,
        diskVersion: persistedVersion,
        document: {
          path: input.path,
          name: "a.md",
          content: input.content,
          encoding: "utf-8" as const
        }
      };
    });
    const resolved = async () => ({
      canonicalPath: "C:/notes/a.md",
      identity,
      exists: true as const,
      pathKey: identity.location,
      physicalKey: identity.object
    });
    const saveDocument = createSaveDocument({
      workspace,
      tabOperations: createImmediateCoordinator(),
      fileLocationOperations: createImmediateCoordinator(),
      fileObjectOperations: createImmediateCoordinator(),
      fileIdentity: { resolveExisting: resolved, resolveProspective: resolved },
      disk: { readDiskVersion: async () => persistedVersion, writeDocument },
      dialog: { chooseSavePath: vi.fn() },
      watcher: {
        beginInternalWrite: vi.fn(),
        completeInternalWrite: vi.fn(),
        syncWindowPaths: vi.fn()
      },
      recentFiles: { record: vi.fn() },
      cleanupReporter: { report: vi.fn() }
    });

    const result = await saveDocument.save({
      context: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });

    expect(result.status).toBe("success");
    expect(writeDocument).toHaveBeenCalledWith({
      path: "C:/notes/a.md",
      content: "captured"
    });
    expect(workspace.getTabSession(tabId).isDirty).toBe(false);
  });
});
