import { fileIdentity, type WorkspaceState } from "@fishmark/workspace-domain";

import {
  createCloseWorkspace,
  createSaveDocument,
  type KeyedOperationCoordinator,
  type SaveDocumentResult
} from "@fishmark/workspace-application";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

type TestDependencies = {
  workspace: WorkspaceState;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive" | "runExclusiveWithLease" | "isLeaseHeld"
  >;
  promptToSaveWorkspaceTab: Parameters<typeof createCloseWorkspace>[0]["chooseDirtyTab"];
  saveMarkdownFileToPath: (input: {
    tabId: string;
    path: string;
    content: string;
  }) => Promise<SaveDocumentResult>;
};

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
    file: { write: dependencies.saveMarkdownFileToPath },
    dialog: { chooseSavePath: async () => ({ status: "cancelled" }) },
    watcher: {
      beginInternalWrite: async () => undefined,
      completeInternalWrite: async () => undefined,
      syncDocumentPath: async () => undefined
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
