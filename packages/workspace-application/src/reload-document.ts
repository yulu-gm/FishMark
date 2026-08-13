import {
  sameFileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceMutationResult,
  type WorkspaceState,
  type WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  DocumentFilePort,
  DocumentReadErrorCode,
  FileIdentityPort,
  KeyedOperationCoordinator,
  RecentFilesPort,
  ResolvedExistingFileIdentity
} from "./ports";
import { requirePersistedMarkdownDocument } from "./document-results";

export type WorkspaceReloadErrorCode =
  | DocumentReadErrorCode
  | "file-identity-changed"
  | "file-identity-conflict"
  | "file-identity-missing";

export type WorkspaceReloadResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "revision-stale" }
  | Extract<WorkspaceMutationResult, { readonly kind: "stale" }>
  | {
      readonly kind: "error";
      readonly error: { readonly code: WorkspaceReloadErrorCode; readonly message: string };
    };

export function createWorkspaceReload(dependencies: {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "getWindowProjectionOrNull" | "replaceTabDocument"
  >;
  tabOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "runExclusive"
  >;
  fileIdentity: Pick<FileIdentityPort, "resolveExisting">;
  file: Pick<DocumentFilePort, "read">;
  recentFiles: RecentFilesPort;
}) {
  return {
    async reloadTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): Promise<WorkspaceReloadResult> {
      return dependencies.tabOperations.runExclusive(input.tabId, async () => {
        let checkpoint;
        try {
          checkpoint = dependencies.workspace.getTabSession(input.tabId);
        } catch {
          return {
            kind: "stale" as const,
            reason: "tab-missing" as const,
            projection: dependencies.workspace.getWindowProjectionOrNull(
              input.expectedWindowId
            )
          };
        }
        if (checkpoint.windowId !== input.expectedWindowId) {
          return {
            kind: "stale" as const,
            reason: "window-changed" as const,
            projection: dependencies.workspace.getWindowProjectionOrNull(
              input.expectedWindowId
            )
          };
        }
        if (checkpoint.path === null || checkpoint.fileIdentity === null) {
          return reloadError("file-identity-missing");
        }
        const targetPath = checkpoint.path;
        return dependencies.fileLocationOperations.runExclusive(
          checkpoint.fileIdentity.location,
          async () => {
            let resolved: ResolvedExistingFileIdentity;
            try {
              resolved = await dependencies.fileIdentity.resolveExisting(targetPath);
            } catch {
              return reloadError("read-failed");
            }
            if (resolved.pathKey !== checkpoint.fileIdentity!.location) {
              return reloadError("file-identity-changed");
            }
            return dependencies.fileObjectOperations.runExclusive(
              resolved.physicalKey,
              async () => {
                let stable: ResolvedExistingFileIdentity;
                try {
                  stable = await dependencies.fileIdentity.resolveExisting(targetPath);
                } catch {
                  return reloadError("file-identity-changed");
                }
                if (!sameFileIdentity(stable.identity, resolved.identity)) {
                  return reloadError("file-identity-changed");
                }
                let result;
                try {
                  result = await dependencies.file.read(resolved.canonicalPath);
                } catch {
                  return reloadError("read-failed");
                }
                if (result.status !== "success") {
                  return result.status === "error"
                    ? reloadError(result.error.code)
                    : reloadError("read-failed");
                }
                let finalIdentity: ResolvedExistingFileIdentity;
                try {
                  finalIdentity = await dependencies.fileIdentity.resolveExisting(
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
                  },
                  diskVersion: result.diskVersion
                });
                if (mutation.kind === "file-identity-conflict") {
                  return reloadError("file-identity-conflict");
                }
                if (mutation.kind === "stale" && mutation.reason === "revision-changed") {
                  return { kind: "revision-stale" };
                }
                if (mutation.kind === "stale") return mutation;
                await dependencies.recentFiles.record(targetPath);
                return { kind: "success", projection: mutation.projection };
              }
            );
          }
        );
      });
    }
  };
}

function reloadError(code: WorkspaceReloadErrorCode): Extract<
  WorkspaceReloadResult,
  { readonly kind: "error" }
> {
  const messages: Record<WorkspaceReloadErrorCode, string> = {
    "dialog-failed": "The file picker could not be opened.",
    "file-not-found": "Selected file could not be found.",
    "not-a-file": "Selected path is not a file.",
    "read-failed": "The Markdown file could not be read.",
    "non-utf8": "Only UTF-8 Markdown files are supported right now.",
    "file-identity-changed": "The Markdown file changed while reloading. Please try again.",
    "file-identity-conflict": "That file is already open in another tab.",
    "file-identity-missing": "The tab has no canonical file identity."
  };
  return { kind: "error", error: { code, message: messages[code] } };
}
