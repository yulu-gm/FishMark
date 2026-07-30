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
  DocumentFilePort,
  DocumentReadErrorCode,
  FileIdentityPort,
  KeyedOperationCoordinator,
  OwnerActivationPort,
  RecentFilesPort,
  ResolvedExistingFileIdentity,
  ResolvedFileIdentity
} from "./ports";
import { requirePersistedMarkdownDocument } from "./document-results";

export type WorkspaceOpenResult =
  | { readonly kind: "success"; readonly projection: WorkspaceWindowProjection }
  | { readonly kind: "cancelled" }
  | { readonly kind: "focused-existing" }
  | {
      readonly kind: "error";
      readonly error: { readonly code: DocumentReadErrorCode; readonly message: string };
    };

export type WorkspaceOpenPathResult = Exclude<
  WorkspaceOpenResult,
  { readonly kind: "cancelled" }
>;

type OwnerCandidate = Readonly<{
  kind: "owner-candidate";
  identity: FileIdentity;
  canonicalPath: string;
  owner: WorkspaceFileOwner;
}>;

export function createWorkspaceOpen(dependencies: {
  workspace: Pick<WorkspaceState, "activateTab" | "getFileOwner" | "openDocument">;
  tabOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  fileLocationOperations: Pick<
    KeyedOperationCoordinator<FileLocationIdentity>,
    "runExclusive"
  >;
  fileObjectOperations: Pick<
    KeyedOperationCoordinator<FileObjectIdentity>,
    "runExclusive"
  >;
  fileIdentity: FileIdentityPort;
  file: Pick<DocumentFilePort, "read">;
  ownerActivation: OwnerActivationPort;
  recentFiles: RecentFilesPort;
  chooseOpenPath: () => Promise<
    | { readonly status: "success"; readonly path: string }
    | { readonly status: "cancelled" }
    | {
        readonly status: "error";
        readonly error: { readonly code: "dialog-failed"; readonly message: string };
      }
  >;
}) {
  const ownerRetryBudget = 3;
  return {
    async open(input: { readonly windowId: string }): Promise<WorkspaceOpenResult> {
      const selected = await dependencies.chooseOpenPath();
      if (selected.status === "cancelled") return { kind: "cancelled" };
      if (selected.status === "error") return { kind: "error", error: selected.error };
      return this.openPath({ windowId: input.windowId, targetPath: selected.path });
    },
    async openPath(input: {
      readonly windowId: string;
      readonly targetPath: string;
    }): Promise<WorkspaceOpenPathResult> {
      for (let attempt = 0; attempt < ownerRetryBudget; attempt += 1) {
        const scanned = await scanAndOpen(input);
        if (scanned.kind !== "owner-candidate") return scanned;
        const validated = await validateStableOwner(input, scanned);
        if (validated === null) continue;
        if (validated.kind !== "owner-candidate") return validated;
        const activation = await dependencies.ownerActivation.activateOwnerWindowTab(
          validated.owner.windowId,
          validated.owner.tabId,
          validated.identity
        );
        if (activation === "activated") {
          await dependencies.recentFiles.record(validated.canonicalPath);
          return { kind: "focused-existing" };
        }
        if (activation === "failed") return readFailure(input.targetPath);
      }
      return readFailure(input.targetPath);
    }
  };

  async function scanAndOpen(input: {
    readonly windowId: string;
    readonly targetPath: string;
  }): Promise<WorkspaceOpenPathResult | OwnerCandidate> {
    let prospective: ResolvedFileIdentity;
    try {
      prospective = await dependencies.fileIdentity.resolveProspective(input.targetPath);
    } catch {
      return readFailure(input.targetPath);
    }
    return dependencies.fileLocationOperations.runExclusive(prospective.pathKey, async () => {
      let confirmed: ResolvedExistingFileIdentity;
      try {
        confirmed = await dependencies.fileIdentity.resolveExisting(input.targetPath);
      } catch {
        return readFailure(input.targetPath);
      }
      if (confirmed.pathKey !== prospective.pathKey) return readFailure(input.targetPath);
      return dependencies.fileObjectOperations.runExclusive(confirmed.physicalKey, async () => {
        let stable: ResolvedExistingFileIdentity;
        try {
          stable = await dependencies.fileIdentity.resolveExisting(input.targetPath);
        } catch {
          return readFailure(input.targetPath);
        }
        if (!sameResolvedIdentity(stable, confirmed)) return readFailure(input.targetPath);
        const owner = dependencies.workspace.getFileOwner(stable.identity);
        if (owner.kind === "ambiguous") return readFailure(input.targetPath);
        if (owner.kind === "owned") return ownerCandidate(stable, owner.owner);

        const readResult = await dependencies.file.read(stable.canonicalPath);
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
          finalIdentity = await dependencies.fileIdentity.resolveExisting(input.targetPath);
        } catch {
          return readFailure(input.targetPath);
        }
        if (!sameResolvedIdentity(finalIdentity, stable)) return readFailure(input.targetPath);
        const result = dependencies.workspace.openDocument(input.windowId, {
          fileIdentity: finalIdentity.identity,
          path: finalIdentity.canonicalPath,
          name: diskDocument.name,
          content: diskDocument.content,
          encoding: diskDocument.encoding
        });
        if (result.kind === "owned-by-other-window") {
          const currentOwner = dependencies.workspace.getFileOwner(finalIdentity.identity);
          if (currentOwner.kind !== "owned") return readFailure(input.targetPath);
          return ownerCandidate(finalIdentity, currentOwner.owner);
        }
        if (result.kind === "file-identity-conflict") return readFailure(input.targetPath);
        await dependencies.recentFiles.record(finalIdentity.canonicalPath);
        return { kind: "success", projection: result.projection };
      });
    });
  }

  async function validateStableOwner(
    input: { readonly windowId: string; readonly targetPath: string },
    candidate: OwnerCandidate
  ): Promise<WorkspaceOpenPathResult | OwnerCandidate | null> {
    return dependencies.tabOperations.runExclusive(candidate.owner.tabId, async () => {
      let prospective: ResolvedFileIdentity;
      try {
        prospective = await dependencies.fileIdentity.resolveProspective(input.targetPath);
      } catch {
        return readFailure(input.targetPath);
      }
      return dependencies.fileLocationOperations.runExclusive(prospective.pathKey, async () => {
        let confirmed: ResolvedExistingFileIdentity;
        try {
          confirmed = await dependencies.fileIdentity.resolveExisting(input.targetPath);
        } catch {
          return null;
        }
        if (
          confirmed.pathKey !== prospective.pathKey ||
          !sameFileIdentity(confirmed.identity, candidate.identity)
        ) return null;
        return dependencies.fileObjectOperations.runExclusive(confirmed.physicalKey, async () => {
          let stable: ResolvedExistingFileIdentity;
          try {
            stable = await dependencies.fileIdentity.resolveExisting(input.targetPath);
          } catch {
            return null;
          }
          if (!sameResolvedIdentity(stable, confirmed)) return null;
          const owner = dependencies.workspace.getFileOwner(stable.identity);
          if (owner.kind !== "owned" || owner.owner.tabId !== candidate.owner.tabId) {
            return null;
          }
          if (owner.owner.windowId === input.windowId) {
            const result: WorkspaceOpenPathResult = {
              kind: "success",
              projection: dependencies.workspace.activateTab(
                owner.owner.windowId,
                owner.owner.tabId
              )
            };
            await dependencies.recentFiles.record(stable.canonicalPath);
            return result;
          }
          return ownerCandidate(stable, owner.owner);
        });
      });
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
  return left.pathKey === right.pathKey && sameFileIdentity(left.identity, right.identity);
}

function readFailure(targetPath: string): WorkspaceOpenPathResult {
  return {
    kind: "error",
    error: { code: "read-failed", message: `Unable to open Markdown file '${targetPath}'.` }
  };
}
