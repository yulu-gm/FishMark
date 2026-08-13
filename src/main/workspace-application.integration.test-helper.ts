import { fileIdentity, type WorkspaceState } from "@fishmark/workspace-domain";

import {
  createCloseWorkspace,
  createSaveDocument,
  type DiskRepositoryPort,
  type KeyedOperationCoordinator
} from "@fishmark/workspace-application";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

type TestDependencies = {
  workspace: WorkspaceState;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive" | "runExclusiveWithLease" | "isLeaseHeld"
  >;
  promptToSaveWorkspaceTab: Parameters<typeof createCloseWorkspace>[0]["chooseDirtyTab"];
  disk: DiskRepositoryPort;
};

export function createSuccessfulDiskRepository(
  overrides: Partial<DiskRepositoryPort> = {}
): DiskRepositoryPort {
  return {
    readDiskVersion: async () => ({
      normalizedPath: "C:/notes/test.md",
      mtimeMs: 1,
      size: 1,
      contentHash: "test-hash"
    }),
    writeDocument: async (input) => ({
      status: "success",
      diskVersion: {
        normalizedPath: input.path.replace(/\\/g, "/"),
        mtimeMs: 1,
        size: input.content.length,
        contentHash: "test-hash"
      },
      document: {
        path: input.path,
        name: input.path.split("/").pop() ?? input.path,
        content: input.content,
        encoding: "utf-8"
      }
    }),
    ...overrides
  };
}

export function createTestCloseWorkspace(
  dependencies: TestDependencies
) {
  const fileOperations = createSaveDocument({
    workspace: dependencies.workspace,
    tabOperations: dependencies.documentOperations,
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentity: {
      resolveExisting: async (targetPath) => resolvedFile(targetPath),
      resolveProspective: async (targetPath) => resolvedFile(targetPath)
    },
    disk: dependencies.disk,
    dialog: { chooseSavePath: async () => ({ status: "cancelled" }) },
    watcher: {
      beginInternalWrite: async () => undefined,
      completeInternalWrite: async () => undefined,
      syncWindowPaths: async () => undefined
    },
    recentFiles: { record: async () => undefined },
    cleanupReporter: { report: () => undefined }
  });

  return createCloseWorkspace({
    workspace: dependencies.workspace,
    documentOperations: dependencies.documentOperations,
    chooseDirtyTab: dependencies.promptToSaveWorkspaceTab,
    saveDocument: fileOperations
  });
}

function resolvedFile(targetPath: string) {
  const identity = fileIdentity(`file:${targetPath.toLowerCase()}`);
  return {
    canonicalPath: targetPath,
    identity,
    exists: true as const,
    pathKey: identity.location,
    physicalKey: identity.object
  };
}
