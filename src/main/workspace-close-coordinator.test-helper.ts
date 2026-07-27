import { fileIdentity, type WorkspaceState } from "@fishmark/workspace-domain";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createKeyedOperationCoordinator, type KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceCloseCoordinator as createCoordinator } from "./workspace-close-coordinator";
import { createWorkspaceFileOperations } from "./workspace-file-operations";

type TestDependencies = {
  workspace: WorkspaceState;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive" | "runExclusiveWithLease" | "isLeaseHeld"
  >;
  promptToSaveWorkspaceTab: Parameters<typeof createCoordinator>[0]["promptToSaveWorkspaceTab"];
  saveMarkdownFileToPath: (input: {
    tabId: string;
    path: string;
    content: string;
  }) => Promise<SaveMarkdownFileResult>;
};

export function createTestWorkspaceCloseCoordinator(
  dependencies: TestDependencies
) {
  const fileOperations = createWorkspaceFileOperations({
    workspace: dependencies.workspace,
    tabOperations: dependencies.documentOperations,
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentityResolver: {
      resolveExisting: async (targetPath) => resolvedFile(targetPath),
      resolveProspective: async (targetPath) => resolvedFile(targetPath)
    },
    saveMarkdownFileToPath: dependencies.saveMarkdownFileToPath,
    showSaveMarkdownPathDialog: async () => ({ status: "cancelled" }),
    beginInternalWrite: async () => undefined,
    completeInternalWrite: async () => undefined,
    syncWindowWatch: async () => undefined,
    recordRecentFilePath: async () => undefined,
    reportCleanupError: () => undefined
  });

  return createCoordinator({
    workspace: dependencies.workspace,
    documentOperations: dependencies.documentOperations,
    promptToSaveWorkspaceTab: dependencies.promptToSaveWorkspaceTab,
    persistWorkspaceTab: (tab, commitGuard, tabLease) =>
      fileOperations.saveWithHeldTabLease({
        sender: undefined,
        expectedWindowId: tab.windowId,
        tabId: tab.tabId,
        commitGuard
      }, tabLease)
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
