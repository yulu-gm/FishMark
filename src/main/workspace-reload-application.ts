import type {
  FileLocationIdentity,
  FileObjectIdentity,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { FileIdentityResolver } from "./file-identity-resolver";
import type { KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { requirePersistedMarkdownDocument } from "./persisted-markdown-document";
import { requireAppliedWorkspaceMutation } from "./workspace-mutation-result";

export type WorkspaceReloadResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "revision-stale" };

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
            const resolved = await dependencies.fileIdentityResolver.resolveExisting(
              targetPath
            );
            if (resolved.pathKey !== checkpoint.fileIdentity!.location) {
              throw new Error("Workspace reload file location changed.");
            }

            return dependencies.fileObjectOperations.runExclusive(
              resolved.physicalKey,
              async () => {
                const stable = await dependencies.fileIdentityResolver.resolveExisting(
                  targetPath
                );
                if (stable.identity.object !== resolved.identity.object) {
                  throw new Error("Workspace reload file identity changed before read.");
                }
                const result = await dependencies.openMarkdownFileFromPath(
                  resolved.canonicalPath
                );
                if (result.status !== "success") {
                  if (result.status === "error") {
                    throw new Error(result.error.message);
                  }
                  throw new Error(
                    `Unable to reload Markdown file '${resolved.canonicalPath}'.`
                  );
                }
                const finalIdentity = await dependencies.fileIdentityResolver.resolveExisting(
                  resolved.canonicalPath
                );
                if (finalIdentity.identity.object !== resolved.identity.object) {
                  throw new Error("Workspace reload file identity changed during read.");
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
                  throw new Error(
                    "Workspace reload rejected: physical file is owned by another tab."
                  );
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
