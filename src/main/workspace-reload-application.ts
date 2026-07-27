import {
  sameFileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceState,
  type WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import {
  RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES,
  type ReloadWorkspaceTabFromPathError,
  type ReloadWorkspaceTabFromPathErrorCode
} from "../shared/workspace";
import type { FileIdentityResolver } from "./file-identity-resolver";
import type { KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { requirePersistedMarkdownDocument } from "./persisted-markdown-document";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

export type WorkspaceReloadResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "revision-stale" }
  | {
      readonly kind: "error";
      readonly error: ReloadWorkspaceTabFromPathError;
    };

type WorkspaceReloadApplicationDependencies = {
  workspace: Pick<WorkspaceState, "getTabSession" | "replaceTabDocument">;
  tabOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "runExclusive"
  >;
  fileIdentityResolver: Pick<FileIdentityResolver, "resolveExisting">;
  openMarkdownFileFromPath: (
    targetPath: string
  ) => Promise<OpenMarkdownFileResult>;
  recordRecentFilePath: (targetPath: string) => Promise<void>;
};

export function createWorkspaceReloadApplication(
  dependencies: WorkspaceReloadApplicationDependencies
) {
  return {
    async reloadTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): Promise<WorkspaceReloadResult> {
      return dependencies.tabOperations.runExclusive(input.tabId, async () => {
        const checkpoint = dependencies.workspace.getTabSession(input.tabId);
        if (checkpoint.windowId !== input.expectedWindowId) {
          throw new Error(
            `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
          );
        }
        if (checkpoint.path === null || checkpoint.fileIdentity === null) {
          throw new Error(
            `Workspace tab '${input.tabId}' has no canonical file identity.`
          );
        }
        const targetPath = checkpoint.path;

        return dependencies.fileLocationOperations.runExclusive(
          checkpoint.fileIdentity.location,
          async () => {
            let resolved: Awaited<
              ReturnType<FileIdentityResolver["resolveExisting"]>
            >;
            try {
              resolved = await dependencies.fileIdentityResolver.resolveExisting(
                targetPath
              );
            } catch {
              return reloadError("read-failed");
            }
            if (resolved.pathKey !== checkpoint.fileIdentity!.location) {
              return reloadError("file-identity-changed");
            }

            return dependencies.fileObjectOperations.runExclusive(
              resolved.physicalKey,
              async () => {
                let stable: Awaited<
                  ReturnType<FileIdentityResolver["resolveExisting"]>
                >;
                try {
                  stable = await dependencies.fileIdentityResolver.resolveExisting(
                    targetPath
                  );
                } catch {
                  return reloadError("file-identity-changed");
                }
                if (!sameFileIdentity(stable.identity, resolved.identity)) {
                  return reloadError("file-identity-changed");
                }
                let result: OpenMarkdownFileResult;
                try {
                  result = await dependencies.openMarkdownFileFromPath(
                    resolved.canonicalPath
                  );
                } catch {
                  return reloadError("read-failed");
                }
                if (result.status !== "success") {
                  if (result.status === "error") {
                    return reloadError(result.error.code);
                  }
                  return reloadError("read-failed");
                }
                let finalIdentity: Awaited<
                  ReturnType<FileIdentityResolver["resolveExisting"]>
                >;
                try {
                  finalIdentity = await dependencies.fileIdentityResolver.resolveExisting(
                    resolved.canonicalPath
                  );
                } catch {
                  return reloadError("file-identity-changed");
                }
                if (!sameFileIdentity(finalIdentity.identity, resolved.identity)) {
                  return reloadError("file-identity-changed");
                }

                const diskDocument = requirePersistedMarkdownDocument(
                  result.document,
                  "Reload adapter"
                );
                if (diskDocument.path !== resolved.canonicalPath) {
                  throw new Error(
                    "Reload adapter path does not match the canonical reload checkpoint."
                  );
                }
                const mutation = dependencies.workspace.replaceTabDocument({
                  tabId: input.tabId,
                  expectedWindowId: input.expectedWindowId,
                  expectedRevision: checkpoint.revision,
                  document: {
                    fileIdentity: resolved.identity,
                    path: checkpoint.path,
                    name: checkpoint.name,
                    content: diskDocument.content,
                    encoding: checkpoint.encoding
                  }
                });
                if (mutation.kind === "file-identity-conflict") {
                  return reloadError("file-identity-conflict");
                }
                if (mutation.kind === "stale" && mutation.reason === "revision-changed") {
                  return { kind: "revision-stale" };
                }
                const projection = requireAppliedWorkspaceMutation(mutation, "reload");
                await dependencies.recordRecentFilePath(targetPath);
                return { kind: "success", projection };
              }
            );
          }
        );
      });
    }
  };
}

function reloadError(
  code: ReloadWorkspaceTabFromPathErrorCode
): Extract<WorkspaceReloadResult, { readonly kind: "error" }> {
  return {
    kind: "error",
    error: {
      code,
      message: RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES[code]
    }
  };
}
