import type {
  WorkspaceMutationResult,
  WorkspaceMutationStaleReason,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

const STALE_REASON_MESSAGES: Readonly<
  Record<WorkspaceMutationStaleReason, string>
> = Object.freeze({
  "tab-missing": "tab no longer exists",
  "window-missing": "owner window no longer exists",
  "window-changed": "tab owner changed",
  "revision-changed": "document revision changed"
});

export function requireAppliedWorkspaceMutation(
  result: WorkspaceMutationResult,
  operation: string
): WorkspaceWindowProjection {
  if (result.kind === "applied") {
    return result.projection;
  }

  throw new Error(
    `Workspace ${operation} rejected: ${STALE_REASON_MESSAGES[result.reason]}.`
  );
}
