type WorkspaceWindowCloseRequestBrokerDependencies = {
  scheduleTimeout: (listener: () => void) => () => void;
};

type WorkspaceWindowCloseRequestInput = {
  readonly windowId: string;
  readonly sendRequest: (requestId: string) => void;
  readonly bindAbort: (listener: () => void) => () => void;
};

type PendingWorkspaceWindowCloseRequest<TConfirmation> = {
  readonly requestId: string;
  readonly windowId: string;
  confirmation: TConfirmation | null | undefined;
  settled: boolean;
  cancelTimeout: (() => void) | null;
  unbindAbort: (() => void) | null;
  resolve: (confirmation: TConfirmation | null) => void;
  reject: (error: unknown) => void;
};

export function createWorkspaceWindowCloseRequestBroker<TConfirmation>(
  dependencies: WorkspaceWindowCloseRequestBrokerDependencies
) {
  const pendingByRequestId = new Map<
    string,
    PendingWorkspaceWindowCloseRequest<TConfirmation>
  >();
  const pendingByWindowId = new Map<
    string,
    PendingWorkspaceWindowCloseRequest<TConfirmation>
  >();
  let nextRequestId = 1;

  function cleanup(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>
  ): void {
    const cancelTimeout = pending.cancelTimeout;
    const unbindAbort = pending.unbindAbort;
    pending.cancelTimeout = null;
    pending.unbindAbort = null;

    for (const dispose of [cancelTimeout, unbindAbort]) {
      try {
        dispose?.();
      } catch {
        // Request settlement must remain authoritative over resource cleanup.
      }
    }
  }

  function settle(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>,
    outcome:
      | {
          readonly kind: "resolve";
          readonly confirmation: TConfirmation | null;
        }
      | { readonly kind: "reject"; readonly error: unknown }
  ): boolean {
    if (pending.settled) {
      return false;
    }

    pending.settled = true;
    if (pendingByRequestId.get(pending.requestId) === pending) {
      pendingByRequestId.delete(pending.requestId);
    }
    if (pendingByWindowId.get(pending.windowId) === pending) {
      pendingByWindowId.delete(pending.windowId);
    }
    cleanup(pending);

    if (outcome.kind === "reject") {
      pending.reject(outcome.error);
    } else {
      pending.resolve(outcome.confirmation);
    }
    return true;
  }

  function installCleanup(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>,
    field: "cancelTimeout" | "unbindAbort",
    dispose: () => void
  ): void {
    if (pending.settled) {
      try {
        dispose();
      } catch {
        // A synchronously settled request still owns its installed resource.
      }
      return;
    }
    pending[field] = dispose;
  }

  return {
    request(
      input: WorkspaceWindowCloseRequestInput
    ): Promise<TConfirmation | null> {
      if (pendingByWindowId.has(input.windowId)) {
        return Promise.resolve(null);
      }

      const requestId = `${input.windowId}:${nextRequestId++}`;
      let resolveRequest!: (confirmation: TConfirmation | null) => void;
      let rejectRequest!: (error: unknown) => void;
      const request = new Promise<TConfirmation | null>((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      });
      const pending: PendingWorkspaceWindowCloseRequest<TConfirmation> = {
        requestId,
        windowId: input.windowId,
        confirmation: undefined,
        settled: false,
        cancelTimeout: null,
        unbindAbort: null,
        resolve: resolveRequest,
        reject: rejectRequest
      };
      pendingByRequestId.set(requestId, pending);
      pendingByWindowId.set(input.windowId, pending);

      try {
        installCleanup(
          pending,
          "unbindAbort",
          input.bindAbort(() => {
            settle(pending, { kind: "resolve", confirmation: null });
          })
        );
        if (pending.settled) {
          return request;
        }

        installCleanup(
          pending,
          "cancelTimeout",
          dependencies.scheduleTimeout(() => {
            settle(pending, { kind: "resolve", confirmation: null });
          })
        );
        if (pending.settled) {
          return request;
        }

        input.sendRequest(requestId);
      } catch (error) {
        settle(pending, { kind: "reject", error });
      }

      return request;
    },

    hasPending(windowId: string): boolean {
      return pendingByWindowId.has(windowId);
    },

    setConfirmation(
      windowId: string,
      confirmation: TConfirmation | null
    ): boolean {
      const pending = pendingByWindowId.get(windowId);
      if (pending === undefined || pending.settled) {
        return false;
      }
      pending.confirmation = confirmation;
      return true;
    },

    complete(
      requestId: string,
      windowId: string,
      shouldClose: boolean
    ): boolean {
      const pending = pendingByRequestId.get(requestId);
      if (
        pending === undefined ||
        pending.windowId !== windowId ||
        pending.settled
      ) {
        return false;
      }
      return settle(pending, {
        kind: "resolve",
        confirmation: shouldClose ? (pending.confirmation ?? null) : null
      });
    },

    abortWindow(windowId: string): void {
      const pending = pendingByWindowId.get(windowId);
      if (pending !== undefined) {
        settle(pending, { kind: "resolve", confirmation: null });
      }
    }
  };
}
