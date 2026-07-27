import type {
  FileLocationIdentity,
  FileObjectIdentity,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  OpenMarkdownFileErrorCode,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import type { ResolvedExistingFileIdentity } from "./file-identity-resolver";
import type { KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { requirePersistedMarkdownDocument } from "./persisted-markdown-document";

export type WorkspaceOpenResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "focused-existing" }
  | { readonly kind: "error"; readonly error: { readonly code: OpenMarkdownFileErrorCode; readonly message: string } };

type Dependencies = {
  readonly workspace: Pick<
    WorkspaceState,
    "activateTab" | "getFileOwner" | "openDocument"
  >;
  readonly fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  readonly fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "runExclusive"
  >;
  readonly resolveExisting: (
    targetPath: string
  ) => Promise<ResolvedExistingFileIdentity>;
  readonly openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
  readonly activateOwnerWindowTab: (
    windowId: string,
    tabId: string
  ) => Promise<void>;
  readonly recordRecentFilePath: (targetPath: string) => Promise<void>;
};

export function createWorkspaceOpenApplication(dependencies: Dependencies) {
  return {
    async openPath(input: {
      readonly windowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceOpenResult> {
      let resolved: ResolvedExistingFileIdentity;
      try {
        resolved = await dependencies.resolveExisting(input.targetPath);
      } catch {
        return readFailure(input.targetPath);
      }

      return dependencies.fileLocationOperations.runExclusive(resolved.pathKey, async () => {
        const confirmed = await dependencies.resolveExisting(input.targetPath);
        if (confirmed.pathKey !== resolved.pathKey) {
          return readFailure(input.targetPath);
        }
        return dependencies.fileObjectOperations.runExclusive(confirmed.physicalKey, async () => {
        const stable = await dependencies.resolveExisting(input.targetPath);
        if (stable.identity.object !== confirmed.identity.object) {
          return readFailure(input.targetPath);
        }
        const owner = dependencies.workspace.getFileOwner(confirmed.identity);
        if (owner !== null) {
          if (owner.windowId === input.windowId) {
            return {
              kind: "success",
              projection: dependencies.workspace.activateTab(input.windowId, owner.tabId)
            };
          }
          await dependencies.activateOwnerWindowTab(owner.windowId, owner.tabId);
          return { kind: "focused-existing" };
        }

        const readResult = await dependencies.openMarkdownFileFromPath(
          confirmed.canonicalPath
        );
        if (readResult.status !== "success") {
          return readResult.status === "error"
            ? { kind: "error", error: readResult.error }
            : readFailure(confirmed.canonicalPath);
        }
        const diskDocument = requirePersistedMarkdownDocument(
          readResult.document,
          "Open adapter"
        );
        const finalIdentity = await dependencies.resolveExisting(input.targetPath);
        if (finalIdentity.identity.object !== confirmed.identity.object) {
          return readFailure(input.targetPath);
        }
        const result = dependencies.workspace.openDocument(input.windowId, {
          fileIdentity: confirmed.identity,
          path: confirmed.canonicalPath,
          name: diskDocument.name,
          content: diskDocument.content,
          encoding: diskDocument.encoding
        });
        if (result.kind === "owned-by-other-window") {
          const currentOwner = dependencies.workspace.getFileOwner(confirmed.identity);
          if (currentOwner === null) {
            throw new Error("Physical file ownership changed during open commit.");
          }
          await dependencies.activateOwnerWindowTab(
            currentOwner.windowId,
            currentOwner.tabId
          );
          return { kind: "focused-existing" };
        }
        await dependencies.recordRecentFilePath(confirmed.canonicalPath);
        return { kind: "success", projection: result.projection };
        });
      });
    }
  };
}

function readFailure(targetPath: string): WorkspaceOpenResult {
  return {
    kind: "error",
    error: {
      code: "read-failed",
      message: `Unable to open Markdown file '${targetPath}'.`
    }
  };
}
