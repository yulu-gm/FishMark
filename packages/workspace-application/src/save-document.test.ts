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
