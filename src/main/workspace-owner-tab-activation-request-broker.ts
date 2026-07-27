type Dependencies = {
  readonly scheduleTimeout: (listener: () => void) => () => void;
};

type PendingRequest = {
  readonly requestId: string;
  readonly windowId: string;
  readonly tabId: string;
  settled: boolean;
  cancelTimeout: (() => void) | null;
  unbindAbort: (() => void) | null;
  readonly resolve: (success: boolean) => void;
};

export type WorkspaceOwnerTabActivationRequestHandle = Readonly<{
  requestId: string;
  result: Promise<boolean>;
}>;

export function createWorkspaceOwnerTabActivationRequestBroker(
  dependencies: Dependencies
) {
  const pendingByRequestId = new Map<string, PendingRequest>();
  const pendingByWindowId = new Map<string, PendingRequest>();
  let nextRequestId = 1;

  function settle(pending: PendingRequest, success: boolean): boolean {
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
    const cleanup = [pending.cancelTimeout, pending.unbindAbort];
    pending.cancelTimeout = null;
    pending.unbindAbort = null;
    for (const dispose of cleanup) {
      try {
        dispose?.();
      } catch {
        // Settlement remains authoritative over transport cleanup failures.
      }
    }
    pending.resolve(success);
    return true;
  }

  function installCleanup(
    pending: PendingRequest,
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
    request(input: {
      readonly windowId: string;
      readonly tabId: string;
      readonly sendRequest: (request: {
        readonly requestId: string;
        readonly tabId: string;
      }) => void;
      readonly bindAbort: (listener: () => void) => () => void;
    }): WorkspaceOwnerTabActivationRequestHandle {
      const requestId = `${input.windowId}:${nextRequestId++}`;
      if (pendingByWindowId.has(input.windowId)) {
        return Object.freeze({ requestId, result: Promise.resolve(false) });
      }
      let resolve!: (success: boolean) => void;
      const result = new Promise<boolean>((settleResult) => {
        resolve = settleResult;
      });
      const pending: PendingRequest = {
        requestId,
        windowId: input.windowId,
        tabId: input.tabId,
        settled: false,
        cancelTimeout: null,
        unbindAbort: null,
        resolve
      };
      pendingByRequestId.set(requestId, pending);
      pendingByWindowId.set(input.windowId, pending);
      try {
        installCleanup(
          pending,
          "unbindAbort",
          input.bindAbort(() => settle(pending, false))
        );
        if (pending.settled) {
          return Object.freeze({ requestId, result });
        }
        installCleanup(
          pending,
          "cancelTimeout",
          dependencies.scheduleTimeout(() => settle(pending, false))
        );
        if (pending.settled) {
          return Object.freeze({ requestId, result });
        }
        input.sendRequest({ requestId, tabId: input.tabId });
      } catch {
        settle(pending, false);
      }
      return Object.freeze({ requestId, result });
    },

    complete(input: {
      readonly requestId: string;
      readonly windowId: string;
      readonly tabId: string;
      readonly success: boolean;
    }): boolean {
      const pending = pendingByRequestId.get(input.requestId);
      if (
        pending === undefined ||
        pending.windowId !== input.windowId ||
        pending.tabId !== input.tabId ||
        pendingByWindowId.get(input.windowId) !== pending
      ) {
        return false;
      }
      return settle(pending, input.success);
    },

    abortWindow(windowId: string): void {
      const pending = pendingByWindowId.get(windowId);
      if (pending !== undefined) {
        settle(pending, false);
      }
    },

    hasPending(windowId: string): boolean {
      return pendingByWindowId.has(windowId);
    }
  };
}
