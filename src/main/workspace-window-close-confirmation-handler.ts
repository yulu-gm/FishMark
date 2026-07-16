import type {
  ConfirmWorkspaceWindowCloseRequest,
  WorkspaceWindowCloseConfirmation
} from "./workspace-close-coordinator";
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
  closeCoordinator: {
    confirmWindowClose(
      input: ConfirmWorkspaceWindowCloseRequest
    ): Promise<WorkspaceWindowCloseConfirmation | null>;
  };
};

export function createWorkspaceWindowCloseConfirmationHandler(
  dependencies: WorkspaceWindowCloseConfirmationHandlerDependencies
) {
  return async function handleWorkspaceWindowCloseConfirmation(
    identity: WorkspaceWindowCloseRequestIdentity
  ): Promise<boolean> {
    const scope = dependencies.broker.beginConfirmation(identity);
    if (scope === null) {
      return false;
    }

    try {
      const confirmation =
        await dependencies.closeCoordinator.confirmWindowClose({
          windowId: identity.windowId,
          isActive: scope.isActive
        });
      return confirmation !== null &&
        dependencies.broker.setConfirmation({
          ...identity,
          confirmation
        });
    } finally {
      scope.finish();
    }
  };
}
