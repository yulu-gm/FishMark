type WorkspaceWindowCloseRequestBrokerDependencies = {
  scheduleTimeout: (listener: () => void) => () => void;
  schedulePostConfirmationWatchdog: (
    listener: () => void
  ) => () => void;
};

type WorkspaceWindowCloseRequestInput = {
  readonly windowId: string;
  readonly sendRequest: (requestId: string) => void;
  readonly bindAbort: (listener: () => void) => () => void;
};

export type WorkspaceWindowCloseRequestIdentity = Readonly<{
  requestId: string;
  windowId: string;
}>;

export type WorkspaceWindowCloseRequestHandle<TConfirmation> = Readonly<{
  requestId: string;
  result: Promise<TConfirmation | null>;
  drained: Promise<void>;
}>;

export type WorkspaceWindowCloseConfirmationScope = Readonly<{
  isActive(): boolean;
  finish(): void;
}>;

type PendingWorkspaceWindowCloseRequest<TConfirmation> = {
  readonly requestId: string;
  readonly windowId: string;
  confirmation: TConfirmation | null | undefined;
  settled: boolean;
  confirmationStarted: boolean;
  activeConfirmations: number;
  drained: boolean;
  cancelTimeout: (() => void) | null;
  cancelPostConfirmationWatchdog: (() => void) | null;
  unbindAbort: (() => void) | null;
  resolveResult: (confirmation: TConfirmation | null) => void;
  rejectResult: (error: unknown) => void;
  resolveDrained: () => void;
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
    const cancelPostConfirmationWatchdog =
      pending.cancelPostConfirmationWatchdog;
    const unbindAbort = pending.unbindAbort;
    pending.cancelTimeout = null;
    pending.cancelPostConfirmationWatchdog = null;
    pending.unbindAbort = null;

    for (const dispose of [
      cancelTimeout,
      cancelPostConfirmationWatchdog,
      unbindAbort
    ]) {
      try {
        dispose?.();
      } catch {
        // Request settlement must remain authoritative over resource cleanup.
      }
    }
  }

  function drainIfIdle(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>
  ): void {
    if (
      pending.settled &&
      pending.activeConfirmations === 0 &&
      !pending.drained
    ) {
      pending.drained = true;
      pending.resolveDrained();
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
      pending.rejectResult(outcome.error);
    } else {
      pending.resolveResult(outcome.confirmation);
    }
    drainIfIdle(pending);
    return true;
  }

  function installCleanup(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>,
    field:
      | "cancelTimeout"
      | "cancelPostConfirmationWatchdog"
      | "unbindAbort",
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

  function getMatchingPending(
    identity: WorkspaceWindowCloseRequestIdentity
  ): PendingWorkspaceWindowCloseRequest<TConfirmation> | null {
    const pending = pendingByRequestId.get(identity.requestId);
    return pending !== undefined &&
      !pending.settled &&
      pending.windowId === identity.windowId &&
      pendingByWindowId.get(identity.windowId) === pending
      ? pending
      : null;
  }

  function armPostConfirmationWatchdog(
    pending: PendingWorkspaceWindowCloseRequest<TConfirmation>
  ): void {
    if (
      pending.settled ||
      pending.activeConfirmations !== 0 ||
      pending.cancelPostConfirmationWatchdog !== null
    ) {
      return;
    }

    try {
      installCleanup(
        pending,
        "cancelPostConfirmationWatchdog",
        dependencies.schedulePostConfirmationWatchdog(() => {
          settle(pending, { kind: "resolve", confirmation: null });
        })
      );
    } catch (error) {
      settle(pending, { kind: "reject", error });
    }
  }

  return {
    request(
      input: WorkspaceWindowCloseRequestInput
    ): WorkspaceWindowCloseRequestHandle<TConfirmation> {
      const requestId = `${input.windowId}:${nextRequestId++}`;
      if (pendingByWindowId.has(input.windowId)) {
        return Object.freeze({
          requestId,
          result: Promise.resolve(null),
          drained: Promise.resolve()
        });
      }

      let resolveResult!: (confirmation: TConfirmation | null) => void;
      let rejectResult!: (error: unknown) => void;
      const result = new Promise<TConfirmation | null>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });
      let resolveDrained!: () => void;
      const drained = new Promise<void>((resolve) => {
        resolveDrained = resolve;
      });
      const pending: PendingWorkspaceWindowCloseRequest<TConfirmation> = {
        requestId,
        windowId: input.windowId,
        confirmation: undefined,
        settled: false,
        confirmationStarted: false,
        activeConfirmations: 0,
        drained: false,
        cancelTimeout: null,
        cancelPostConfirmationWatchdog: null,
        unbindAbort: null,
        resolveResult,
        rejectResult,
        resolveDrained
      };
      const handle = Object.freeze({ requestId, result, drained });
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
          return handle;
        }

        installCleanup(
          pending,
          "cancelTimeout",
          dependencies.scheduleTimeout(() => {
            if (!pending.confirmationStarted) {
              settle(pending, { kind: "resolve", confirmation: null });
            }
          })
        );
        if (pending.settled) {
          return handle;
        }

        input.sendRequest(requestId);
      } catch (error) {
        settle(pending, { kind: "reject", error });
      }

      return handle;
    },

    hasPending(windowId: string): boolean {
      return pendingByWindowId.has(windowId);
    },

    beginConfirmation(
      identity: WorkspaceWindowCloseRequestIdentity
    ): WorkspaceWindowCloseConfirmationScope | null {
      const pending = getMatchingPending(identity);
      if (pending === null || pending.confirmationStarted) {
        return null;
      }
      pending.confirmationStarted = true;
      const cancelTimeout = pending.cancelTimeout;
      pending.cancelTimeout = null;
      try {
        cancelTimeout?.();
      } catch {
        // Entering confirmation still disarms the transport timeout logically.
      }
      pending.activeConfirmations += 1;
      let finished = false;
      return Object.freeze({
        isActive(): boolean {
          return !finished && getMatchingPending(identity) === pending;
        },
        finish(): void {
          if (finished) {
            return;
          }
          finished = true;
          pending.activeConfirmations -= 1;
          armPostConfirmationWatchdog(pending);
          drainIfIdle(pending);
        }
      });
    },

    setConfirmation(input: {
      readonly requestId: string;
      readonly windowId: string;
      readonly confirmation: TConfirmation | null;
    }): boolean {
      const pending = getMatchingPending(input);
      if (
        pending === null ||
        !pending.confirmationStarted ||
        pending.activeConfirmations !== 1
      ) {
        return false;
      }
      pending.confirmation = input.confirmation;
      return true;
    },

    complete(
      requestId: string,
      windowId: string,
      shouldClose: boolean
    ): boolean {
      const pending = getMatchingPending({ requestId, windowId });
      if (pending === null) {
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
