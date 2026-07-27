import {
  sameFileIdentity,
  type FileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity,
  type WorkspaceFileOwner,
  type WorkspaceState,
  type WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  OpenMarkdownFileErrorCode,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import type {
  ResolvedExistingFileIdentity,
  ResolvedFileIdentity
} from "./file-identity-resolver";
import type { KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { requirePersistedMarkdownDocument } from "./persisted-markdown-document";

export type WorkspaceOpenResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "focused-existing" }
  | { readonly kind: "error"; readonly error: { readonly code: OpenMarkdownFileErrorCode; readonly message: string } };

type OwnerCandidate = Readonly<{
  kind: "owner-candidate";
  identity: FileIdentity;
  canonicalPath: string;
  owner: WorkspaceFileOwner;
}>;

type Dependencies = {
  readonly workspace: Pick<
    WorkspaceState,
    "activateTab" | "getFileOwner" | "openDocument"
  >;
  readonly tabOperations: Pick<
    KeyedOperationCoordinator<string>,
    "runExclusive"
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
  readonly resolveProspective: (targetPath: string) => Promise<ResolvedFileIdentity>;
  readonly openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
  readonly activateOwnerWindowTab: (
    windowId: string,
    tabId: string,
    identity: FileIdentity
  ) => Promise<"activated" | "retry" | "failed">;
  readonly recordRecentFilePath: (targetPath: string) => Promise<void>;
};

export function createWorkspaceOpenApplication(dependencies: Dependencies) {
  const ownerRetryBudget = 3;
  return {
    async openPath(input: {
      readonly windowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceOpenResult> {
      for (let attempt = 0; attempt < ownerRetryBudget; attempt += 1) {
        const scanned = await scanAndOpen(input);
        if (scanned.kind !== "owner-candidate") {
          return scanned;
        }
        const validated = await validateStableOwner(input, scanned);
        if (validated === null) {
          continue;
        }
        if (validated.kind !== "owner-candidate") {
          return validated;
        }
        const activation = await dependencies.activateOwnerWindowTab(
          validated.owner.windowId,
          validated.owner.tabId,
          validated.identity
        );
        if (activation === "activated") {
          await dependencies.recordRecentFilePath(validated.canonicalPath);
          return { kind: "focused-existing" };
        }
        if (activation === "failed") {
          return readFailure(input.targetPath);
        }
      }
      return readFailure(input.targetPath);
    }
  };

  async function scanAndOpen(input: {
    readonly windowId: string;
    readonly targetPath: string;
  }): Promise<WorkspaceOpenResult | OwnerCandidate> {
    let prospective: ResolvedFileIdentity;
    try {
      prospective = await dependencies.resolveProspective(input.targetPath);
    } catch {
      return readFailure(input.targetPath);
    }

    return dependencies.fileLocationOperations.runExclusive(
      prospective.pathKey,
      async () => {
        let confirmed: ResolvedExistingFileIdentity;
        try {
          confirmed = await dependencies.resolveExisting(input.targetPath);
        } catch {
          return readFailure(input.targetPath);
        }
        if (confirmed.pathKey !== prospective.pathKey) {
          return readFailure(input.targetPath);
        }
        return dependencies.fileObjectOperations.runExclusive(
          confirmed.physicalKey,
          async () => {
            let stable: ResolvedExistingFileIdentity;
            try {
              stable = await dependencies.resolveExisting(input.targetPath);
            } catch {
              return readFailure(input.targetPath);
            }
            if (!sameResolvedIdentity(stable, confirmed)) {
              return readFailure(input.targetPath);
            }
            const owner = dependencies.workspace.getFileOwner(stable.identity);
            if (owner.kind === "ambiguous") {
              return readFailure(input.targetPath);
            }
            if (owner.kind === "owned") {
              return ownerCandidate(stable, owner.owner);
            }

            const readResult = await dependencies.openMarkdownFileFromPath(
              stable.canonicalPath
            );
            if (readResult.status !== "success") {
              return readResult.status === "error"
                ? { kind: "error", error: readResult.error }
                : readFailure(stable.canonicalPath);
            }
            const diskDocument = requirePersistedMarkdownDocument(
              readResult.document,
              "Open adapter"
            );
            let finalIdentity: ResolvedExistingFileIdentity;
            try {
              finalIdentity = await dependencies.resolveExisting(input.targetPath);
            } catch {
              return readFailure(input.targetPath);
            }
            if (!sameResolvedIdentity(finalIdentity, stable)) {
              return readFailure(input.targetPath);
            }
            const result = dependencies.workspace.openDocument(input.windowId, {
              fileIdentity: finalIdentity.identity,
              path: finalIdentity.canonicalPath,
              name: diskDocument.name,
              content: diskDocument.content,
              encoding: diskDocument.encoding
            });
            if (result.kind === "owned-by-other-window") {
              const currentOwner = dependencies.workspace.getFileOwner(
                finalIdentity.identity
              );
              if (currentOwner.kind !== "owned") {
                return readFailure(input.targetPath);
              }
              return ownerCandidate(finalIdentity, currentOwner.owner);
            }
            if (result.kind === "file-identity-conflict") {
              return readFailure(input.targetPath);
            }
            await dependencies.recordRecentFilePath(finalIdentity.canonicalPath);
            return { kind: "success", projection: result.projection };
          }
        );
      }
    );
  }

  async function validateStableOwner(
    input: { readonly windowId: string; readonly targetPath: string },
    candidate: OwnerCandidate
  ): Promise<WorkspaceOpenResult | OwnerCandidate | null> {
    return dependencies.tabOperations.runExclusive(candidate.owner.tabId, async () => {
      let prospective: ResolvedFileIdentity;
      try {
        prospective = await dependencies.resolveProspective(input.targetPath);
      } catch {
        return readFailure(input.targetPath);
      }
      return dependencies.fileLocationOperations.runExclusive(
        prospective.pathKey,
        async () => {
          let confirmed: ResolvedExistingFileIdentity;
          try {
            confirmed = await dependencies.resolveExisting(input.targetPath);
          } catch {
            return null;
          }
          if (
            confirmed.pathKey !== prospective.pathKey ||
            !sameFileIdentity(confirmed.identity, candidate.identity)
          ) {
            return null;
          }
          return dependencies.fileObjectOperations.runExclusive(
            confirmed.physicalKey,
            async () => {
              let stable: ResolvedExistingFileIdentity;
              try {
                stable = await dependencies.resolveExisting(input.targetPath);
              } catch {
                return null;
              }
              if (!sameResolvedIdentity(stable, confirmed)) {
                return null;
              }
              const owner = dependencies.workspace.getFileOwner(stable.identity);
              if (
                owner.kind !== "owned" ||
                owner.owner.tabId !== candidate.owner.tabId
              ) {
                return null;
              }
              if (owner.owner.windowId === input.windowId) {
                const result: WorkspaceOpenResult = {
                  kind: "success",
                  projection: dependencies.workspace.activateTab(
                    owner.owner.windowId,
                    owner.owner.tabId
                  )
                };
                await dependencies.recordRecentFilePath(stable.canonicalPath);
                return result;
              }
              return ownerCandidate(stable, owner.owner);
            }
          );
        }
      );
    });
  }
}

function ownerCandidate(
  resolved: ResolvedExistingFileIdentity,
  owner: WorkspaceFileOwner
): OwnerCandidate {
  return {
    kind: "owner-candidate",
    identity: resolved.identity,
    canonicalPath: resolved.canonicalPath,
    owner
  };
}

function sameResolvedIdentity(
  left: ResolvedExistingFileIdentity,
  right: ResolvedExistingFileIdentity
): boolean {
  return left.pathKey === right.pathKey &&
    sameFileIdentity(left.identity, right.identity);
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
