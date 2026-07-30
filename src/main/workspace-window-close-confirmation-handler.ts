import type {
  ConfirmWorkspaceWindowCloseRequest,
  ConfirmWorkspaceWindowCloseResult as ApplicationConfirmWorkspaceWindowCloseResult,
  WorkspaceWindowCloseConfirmation
} from "@fishmark/workspace-application";
import type { ConfirmWorkspaceWindowCloseResult } from "../shared/workspace";
import type {
  WorkspaceWindowCloseConfirmationScope,
  WorkspaceWindowCloseRequestIdentity
} from "./workspace-window-close-request-broker";

type WorkspaceWindowCloseConfirmationHandlerDependencies = {
  broker: {
    beginConfirmation(
      identity: WorkspaceWindowCloseRequestIdentity
    ): WorkspaceWindowCloseConfirmationScope | null;
    setConfirmation(input: WorkspaceWindowCloseRequestIdentity & {
      readonly confirmation: WorkspaceWindowCloseConfirmation;
    }): boolean;
  };
  closeWorkspace: {
    confirmWindowClose(
      input: ConfirmWorkspaceWindowCloseRequest
    ): Promise<ApplicationConfirmWorkspaceWindowCloseResult>;
  };
};

function assertNever(value: never): never {
  throw new Error(`Unexpected workspace close confirmation result: ${String(value)}`);
}

export function createWorkspaceWindowCloseConfirmationHandler(
  dependencies: WorkspaceWindowCloseConfirmationHandlerDependencies
) {
  return async function handleWorkspaceWindowCloseConfirmation(
    identity: WorkspaceWindowCloseRequestIdentity
  ): Promise<ConfirmWorkspaceWindowCloseResult> {
    const scope = dependencies.broker.beginConfirmation(identity);
    if (scope === null) {
      return { status: "cancelled" };
    }

    try {
      const result =
        await dependencies.closeWorkspace.confirmWindowClose({
          windowId: identity.windowId,
          isActive: scope.isActive
        });
      switch (result.status) {
        case "cancelled":
          return { status: "cancelled" } satisfies ConfirmWorkspaceWindowCloseResult;
        case "error":
          return {
            status: "error",
            error: {
              code: result.error.code,
              message: result.error.message
            }
          } satisfies ConfirmWorkspaceWindowCloseResult;
        case "confirmed":
          return dependencies.broker.setConfirmation({
            ...identity,
            confirmation: result.confirmation
          })
            ? { status: "confirmed" } satisfies ConfirmWorkspaceWindowCloseResult
            : { status: "cancelled" } satisfies ConfirmWorkspaceWindowCloseResult;
        default:
          return assertNever(result);
      }
    } finally {
      scope.finish();
    }
  };
}
