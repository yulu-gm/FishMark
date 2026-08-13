import {
  createStringTextBuffer,
  createWorkspaceState,
  fileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity
} from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import {
  createSaveDocument,
  createWorkspaceOpen
} from "@fishmark/workspace-application";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

const sender = { id: 1 };

function createSaveDocumentForTest(
  dependencies: Omit<
    Parameters<typeof createSaveDocument<typeof sender>>[0],
    "fileIdentity" | "file" | "dialog" | "watcher" | "recentFiles" | "cleanupReporter"
  > & {
    fileIdentityResolver: Parameters<typeof createSaveDocument<typeof sender>>[0]["fileIdentity"];
    saveMarkdownFileToPath: Parameters<typeof createSaveDocument<typeof sender>>[0]["file"]["write"];
    showSaveMarkdownPathDialog: Parameters<typeof createSaveDocument<typeof sender>>[0]["dialog"]["chooseSavePath"];
    beginInternalWrite: Parameters<typeof createSaveDocument<typeof sender>>[0]["watcher"]["beginInternalWrite"];
    completeInternalWrite: Parameters<typeof createSaveDocument<typeof sender>>[0]["watcher"]["completeInternalWrite"];
    syncWindowWatch: (context: typeof sender, windowId: string) => Promise<void>;
    recordRecentFilePath: (targetPath: string) => Promise<void>;
    reportCleanupError: (error: unknown) => void;
  }
) {
  const {
    fileIdentityResolver,
    saveMarkdownFileToPath,
    showSaveMarkdownPathDialog,
    beginInternalWrite,
    completeInternalWrite,
    syncWindowWatch,
    recordRecentFilePath,
    reportCleanupError,
    ...rest
  } = dependencies;
  return createSaveDocument({
    ...rest,
    fileIdentity: fileIdentityResolver,
    file: { write: saveMarkdownFileToPath },
    dialog: { chooseSavePath: showSaveMarkdownPathDialog },
    watcher: {
      beginInternalWrite,
      completeInternalWrite,
      syncWindowPaths: (context) => syncWindowWatch(context, "")
    },
    recentFiles: { record: recordRecentFilePath },
    cleanupReporter: { report: reportCleanupError }
  });
}

describe("workspace physical file identity transactions", () => {
  it("serializes two Save As operations targeting the same new location", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const firstTabId = workspace.createUntitledTab("window-1").activeTabId!;
    const secondTabId = workspace.createUntitledTab("window-2").activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-2", content: "second" });
    const locationOperations = createKeyedOperationCoordinator<FileLocationIdentity>();
    const objectOperations = createKeyedOperationCoordinator<FileObjectIdentity>();
    const identity = fileIdentity("path:c:/notes/shared.md", "inode:7:42");
    let exists = false;
    const resolver = createStatefulResolver("C:/notes/shared.md", identity, () => exists);
    const write = vi.fn(async ({ content }: { readonly content: string }) => {
      exists = true;
      return saved("C:/notes/shared.md", content);
    });
    const operations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: locationOperations,
      fileObjectOperations: objectOperations,
      fileIdentityResolver: resolver,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(async () => ({
        status: "success" as const,
        path: "C:/notes/shared.md"
      })),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const results = await settleWithin(Promise.all([
      operations.saveAs({ context: sender, expectedWindowId: "window-1", tabId: firstTabId }),
      operations.saveAs({ context: sender, expectedWindowId: "window-2", tabId: secondTabId })
    ]));

    expect(write).toHaveBeenCalledOnce();
    expect(results.map((result) => result.status).sort()).toEqual(["error", "success"]);
    expect(workspace.getFileOwner(identity)).toMatchObject({
      kind: "owned",
      owner: { tabId: firstTabId }
    });
    expect(workspace.getTabSession(secondTabId)).toMatchObject({ path: null, isDirty: true });
  });

  it("makes open wait for a Save As creation and then activates the single owner", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "draft" });
    const locationOperations = createKeyedOperationCoordinator<FileLocationIdentity>();
    const objectOperations = createKeyedOperationCoordinator<FileObjectIdentity>();
    const identity = fileIdentity("path:c:/notes/created.md", "inode:7:99");
    let exists = false;
    const resolver = createStatefulResolver("C:/notes/created.md", identity, () => exists);
    let releaseOpenProspective!: () => void;
    let openObservedMissing!: () => void;
    const openObservedMissingPromise = new Promise<void>((resolve) => {
      openObservedMissing = resolve;
    });
    let firstOpenProspective = true;
    const resolveOpenProspective = vi.fn(async (targetPath: string) => {
      const prospective = await resolver.resolveProspective(targetPath);
      if (!firstOpenProspective) {
        return prospective;
      }
      firstOpenProspective = false;
      expect(prospective.exists).toBe(false);
      openObservedMissing();
      await new Promise<void>((resolve) => {
        releaseOpenProspective = resolve;
      });
      return prospective;
    });
    let finishWrite!: () => void;
    const saveOperations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: locationOperations,
      fileObjectOperations: objectOperations,
      fileIdentityResolver: resolver,
      saveMarkdownFileToPath: vi.fn(async ({ content }) => {
        exists = true;
        await new Promise<void>((resolve) => {
          finishWrite = resolve;
        });
        return saved("C:/notes/created.md", content);
      }),
      showSaveMarkdownPathDialog: vi.fn(async () => ({
        status: "success" as const,
        path: "C:/notes/created.md"
      })),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const read = vi.fn();
    const activateOwnerWindowTab = vi.fn(async () => "activated" as const);
    const openApplication = createWorkspaceOpen({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: locationOperations,
      fileObjectOperations: objectOperations,
      fileIdentity: {
        resolveExisting: resolver.resolveExisting,
        resolveProspective: resolveOpenProspective
      },
      file: { read },
      ownerActivation: { activateOwnerWindowTab },
      recentFiles: { record: vi.fn() },
      chooseOpenPath: vi.fn()
    });

    const opening = openApplication.openPath({
      windowId: "window-2",
      targetPath: "C:/notes/created.md"
    });
    await openObservedMissingPromise;
    const saving = saveOperations.saveAs({
      context: sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
    releaseOpenProspective();
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    finishWrite();

    const [saveResult, openResult] = await settleWithin(Promise.all([saving, opening]));
    expect(saveResult.status).toBe("success");
    expect(openResult).toEqual({ kind: "focused-existing" });
    expect(read).not.toHaveBeenCalled();
    expect(activateOwnerWindowTab).toHaveBeenCalledWith(
      "window-1",
      tabId,
      identity
    );
    expect(workspace.getWindowTabIds("window-2")).toHaveLength(0);
  });

  it("serializes Save As across two hard-link locations that share one object", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const firstTabId = workspace.createUntitledTab("window-1").activeTabId!;
    const secondTabId = workspace.createUntitledTab("window-2").activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-2", content: "second" });
    const sharedObject = "inode:7:hard-link";
    const firstIdentity = fileIdentity("path:c:/notes/first.md", sharedObject);
    const secondIdentity = fileIdentity("path:c:/notes/second.md", sharedObject);
    const resolve = async (targetPath: string) => {
      const identity = targetPath.endsWith("first.md") ? firstIdentity : secondIdentity;
      return {
        canonicalPath: targetPath,
        identity,
        exists: true as const,
        pathKey: identity.location,
        physicalKey: identity.object
      };
    };
    const write = vi.fn(async ({ path, content }: { readonly path: string; readonly content: string }) =>
      saved(path, content)
    );
    const operations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: resolve,
        resolveProspective: resolve
      },
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi
        .fn()
        .mockResolvedValueOnce({ status: "success", path: "C:/notes/first.md" })
        .mockResolvedValueOnce({ status: "success", path: "C:/notes/second.md" }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const results = await settleWithin(Promise.all([
      operations.saveAs({ context: sender, expectedWindowId: "window-1", tabId: firstTabId }),
      operations.saveAs({ context: sender, expectedWindowId: "window-2", tabId: secondTabId })
    ]));

    expect(write).toHaveBeenCalledOnce();
    expect(results.map((result) => result.status).sort()).toEqual(["error", "success"]);
    expect(workspace.getFileOwner(firstIdentity)).toMatchObject({
      kind: "owned",
      owner: { tabId: firstTabId }
    });
    expect(workspace.getFileOwner(secondIdentity)).toMatchObject({
      kind: "owned",
      owner: { tabId: firstTabId }
    });
  });

  it("rejects a Save As identity change before writing", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "draft" });
    const initialIdentity = fileIdentity("path:c:/notes/target.md", "inode:7:1");
    const changedIdentity = fileIdentity(initialIdentity.location, "inode:7:2");
    const resolved = (identity: typeof initialIdentity) => ({
      canonicalPath: "C:/notes/target.md",
      identity,
      exists: true as const,
      pathKey: identity.location,
      physicalKey: identity.object
    });
    const write = vi.fn();
    const operations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: vi.fn(async () => resolved(changedIdentity)),
        resolveProspective: vi
          .fn()
          .mockResolvedValueOnce(resolved(initialIdentity))
          .mockResolvedValue(resolved(changedIdentity))
      },
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(async () => ({
        status: "success" as const,
        path: "C:/notes/target.md"
      })),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(),
      reportCleanupError: vi.fn()
    });

    await expect(operations.saveAs({ context: sender, expectedWindowId: "window-1", tabId }))
      .resolves.toMatchObject({ status: "error", error: { code: "file-identity-changed" } });
    expect(write).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({ path: null, isDirty: true });
  });

  it("rejects bidirectional Save As collisions without deadlocking", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const firstIdentity = fileIdentity("path:c:/notes/a.md", "inode:7:a");
    const secondIdentity = fileIdentity("path:c:/notes/b.md", "inode:7:b");
    const open = (
      windowId: string,
      path: string,
      identity: typeof firstIdentity
    ) => workspace.openDocument(windowId, {
      fileIdentity: identity,
      path,
      name: path.split("/").at(-1)!,
      content: path,
      encoding: "utf-8"
    });
    const first = open("window-1", "C:/notes/a.md", firstIdentity);
    const second = open("window-2", "C:/notes/b.md", secondIdentity);
    if (first.kind !== "opened" || second.kind !== "opened") {
      throw new Error("Expected both source documents to open.");
    }
    const resolve = async (targetPath: string) => {
      const identity = targetPath.endsWith("a.md") ? firstIdentity : secondIdentity;
      return {
        canonicalPath: targetPath,
        identity,
        exists: true as const,
        pathKey: identity.location,
        physicalKey: identity.object
      };
    };
    const write = vi.fn();
    const operations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: {
        resolveExisting: resolve,
        resolveProspective: resolve
      },
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi
        .fn()
        .mockResolvedValueOnce({ status: "success", path: "C:/notes/b.md" })
        .mockResolvedValueOnce({ status: "success", path: "C:/notes/a.md" }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(),
      reportCleanupError: vi.fn()
    });

    const results = await settleWithin(Promise.all([
      operations.saveAs({
        context: sender,
        expectedWindowId: "window-1",
        tabId: first.projection.activeTabId!
      }),
      operations.saveAs({
        context: sender,
        expectedWindowId: "window-2",
        tabId: second.projection.activeTabId!
      })
    ]));

    expect(results).toEqual([
      expect.objectContaining({ status: "error", error: { code: "file-identity-conflict", message: expect.any(String) } }),
      expect.objectContaining({ status: "error", error: { code: "file-identity-conflict", message: expect.any(String) } })
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it("fails an ordinary save closed when the object at its location was replaced", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const oldIdentity = fileIdentity("path:c:/notes/replaced.md", "inode:7:1");
    const newIdentity = fileIdentity(oldIdentity.location, "inode:7:2");
    const opened = workspace.openDocument("window-1", {
      fileIdentity: oldIdentity,
      path: "C:/notes/replaced.md",
      name: "replaced.md",
      content: "before",
      encoding: "utf-8"
    });
    if (opened.kind !== "opened") {
      throw new Error("Expected test document to open.");
    }
    const tabId = opened.projection.activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "dirty" });
    const write = vi.fn();
    const resolver = createStatefulResolver("C:/notes/replaced.md", newIdentity, () => true);
    const operations = createSaveDocumentForTest({
      workspace,
      tabOperations: createKeyedOperationCoordinator(),
      fileLocationOperations: createKeyedOperationCoordinator(),
      fileObjectOperations: createKeyedOperationCoordinator(),
      fileIdentityResolver: resolver,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(),
      reportCleanupError: vi.fn()
    });

    await expect(operations.save({ context: sender, expectedWindowId: "window-1", tabId }))
      .resolves.toMatchObject({ status: "error", error: { code: "file-identity-changed" } });
    expect(write).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      fileIdentity: oldIdentity,
      content: "dirty",
      isDirty: true
    });
  });
});

function createStatefulResolver(
  canonicalPath: string,
  identity: ReturnType<typeof fileIdentity>,
  exists: () => boolean
) {
  const existing = () => ({
    canonicalPath,
    identity,
    exists: true as const,
    pathKey: identity.location,
    physicalKey: identity.object
  });
  return {
    resolveExisting: vi.fn(async (targetPath: string) => {
      void targetPath;
      if (!exists()) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      return existing();
    }),
    resolveProspective: vi.fn(async (targetPath: string) => {
      void targetPath;
      return exists()
        ? existing()
        : {
            canonicalPath,
            identity: null,
            exists: false as const,
            pathKey: identity.location,
            physicalKey: null
          };
    })
  };
}

function saved(path: string, content: string) {
  return {
    status: "success" as const,
    document: {
      path,
      name: path.split("/").at(-1)!,
      content,
      encoding: "utf-8" as const
    }
  };
}

async function settleWithin<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Operation deadlocked.")), 1_000);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
