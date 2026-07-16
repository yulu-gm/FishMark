import { describe, expect, it, vi } from "vitest";

import { createWorkspaceWindowCloseRequestBroker as createBrokerWithSchedulers } from "./workspace-window-close-request-broker";

type Confirmation = Readonly<{ token: string }>;

function createWorkspaceWindowCloseRequestBroker<TConfirmation>(dependencies: {
  readonly scheduleTimeout: (listener: () => void) => () => void;
  readonly schedulePostConfirmationWatchdog?: (
    listener: () => void
  ) => () => void;
}) {
  return createBrokerWithSchedulers<TConfirmation>({
    scheduleTimeout: dependencies.scheduleTimeout,
    schedulePostConfirmationWatchdog:
      dependencies.schedulePostConfirmationWatchdog ?? (() => vi.fn())
  });
}

describe("createWorkspaceWindowCloseRequestBroker", () => {
  it("fails closed and releases the request when COMPLETE never follows confirmation", async () => {
    let postConfirmationWatchdog!: () => void;
    const cancelPostConfirmationWatchdog = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => vi.fn(),
      schedulePostConfirmationWatchdog: (listener) => {
        postConfirmationWatchdog = listener;
        return cancelPostConfirmationWatchdog;
      }
    });
    const handle = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    const identity = {
      requestId: handle.requestId,
      windowId: "window-1"
    };
    const scope = broker.beginConfirmation(identity);
    broker.setConfirmation({
      ...identity,
      confirmation: { token: "confirmed" }
    });

    expect(postConfirmationWatchdog).toBeUndefined();
    scope?.finish();
    expect(postConfirmationWatchdog).toBeTypeOf("function");
    expect(broker.hasPending("window-1")).toBe(true);

    postConfirmationWatchdog();
    await expect(handle.result).resolves.toBeNull();
    await expect(handle.drained).resolves.toBeUndefined();
    expect(broker.hasPending("window-1")).toBe(false);
    expect(cancelPostConfirmationWatchdog).toHaveBeenCalledOnce();
    expect(broker.complete(handle.requestId, "window-1", true)).toBe(false);
  });

  it.each(["complete", "abort"] as const)(
    "cancels the post-confirmation watchdog exactly once on %s",
    async (settlement) => {
      let postConfirmationWatchdog!: () => void;
      const cancelPostConfirmationWatchdog = vi.fn();
      const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
        scheduleTimeout: () => vi.fn(),
        schedulePostConfirmationWatchdog: (listener) => {
          postConfirmationWatchdog = listener;
          return cancelPostConfirmationWatchdog;
        }
      });
      const handle = broker.request({
        windowId: "window-1",
        sendRequest: vi.fn(),
        bindAbort: () => vi.fn()
      });
      const identity = {
        requestId: handle.requestId,
        windowId: "window-1"
      };
      const confirmation = { token: "confirmed" };
      const scope = broker.beginConfirmation(identity);
      broker.setConfirmation({ ...identity, confirmation });
      scope?.finish();
      expect(postConfirmationWatchdog).toBeTypeOf("function");

      if (settlement === "complete") {
        expect(broker.complete(handle.requestId, "window-1", true)).toBe(true);
        await expect(handle.result).resolves.toBe(confirmation);
      } else {
        broker.abortWindow("window-1");
        await expect(handle.result).resolves.toBeNull();
      }
      await handle.drained;
      postConfirmationWatchdog();
      broker.abortWindow("window-1");

      expect(cancelPostConfirmationWatchdog).toHaveBeenCalledOnce();
      expect(broker.hasPending("window-1")).toBe(false);
      expect(broker.complete(handle.requestId, "window-1", true)).toBe(false);
    }
  );

  it("bounds a never-confirmed request and drains it immediately", async () => {
    let timeout!: () => void;
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: (listener) => {
        timeout = listener;
        return cancelTimeout;
      }
    });
    const sendRequest = vi.fn();
    const handle = broker.request({
      windowId: "window-1",
      sendRequest,
      bindAbort: () => unbindAbort
    });

    expect(sendRequest).toHaveBeenCalledWith(handle.requestId);
    timeout();

    await expect(handle.result).resolves.toBeNull();
    await expect(handle.drained).resolves.toBeUndefined();
    expect(broker.hasPending("window-1")).toBe(false);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(broker.complete(handle.requestId, "window-1", true)).toBe(false);
    expect(
      broker.setConfirmation({
        requestId: handle.requestId,
        windowId: "window-1",
        confirmation: { token: "late" }
      })
    ).toBe(false);
  });

  it("returns the stored confirmation only after a matching positive completion", async () => {
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => cancelTimeout
    });
    const handle = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => unbindAbort
    });
    const confirmation = Object.freeze({ token: "confirmed" });
    expect(
      broker.setConfirmation({
        requestId: handle.requestId,
        windowId: "window-1",
        confirmation
      })
    ).toBe(false);
    const scope = broker.beginConfirmation({
      requestId: handle.requestId,
      windowId: "window-1"
    });
    expect(scope).not.toBeNull();

    expect(
      broker.setConfirmation({
        requestId: handle.requestId,
        windowId: "window-1",
        confirmation
      })
    ).toBe(true);
    scope?.finish();
    expect(broker.complete(handle.requestId, "another-window", true)).toBe(false);
    expect(broker.complete(handle.requestId, "window-1", true)).toBe(true);

    await expect(handle.result).resolves.toBe(confirmation);
    await expect(handle.drained).resolves.toBeUndefined();
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
  });

  it("does not let a timed-out generation contaminate its successor", async () => {
    const timeouts: Array<() => void> = [];
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: (listener) => {
        timeouts.push(listener);
        return vi.fn();
      }
    });
    const first = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    timeouts[0]!();
    await first.result;
    await first.drained;

    const second = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    const secondConfirmation = { token: "second" };
    const secondScope = broker.beginConfirmation({
      requestId: second.requestId,
      windowId: "window-1"
    });
    expect(secondScope).not.toBeNull();

    expect(
      broker.setConfirmation({
        requestId: first.requestId,
        windowId: "window-1",
        confirmation: { token: "stale-first" }
      })
    ).toBe(false);
    expect(broker.complete(first.requestId, "window-1", true)).toBe(false);
    expect(
      broker.setConfirmation({
        requestId: second.requestId,
        windowId: "window-1",
        confirmation: secondConfirmation
      })
    ).toBe(true);
    secondScope?.finish();
    expect(broker.complete(second.requestId, "window-1", true)).toBe(true);
    await expect(second.result).resolves.toBe(secondConfirmation);
  });

  it("disarms the transport timeout at the first exact confirmation and rejects duplicates", async () => {
    vi.useFakeTimers();
    try {
      const schedulePostConfirmationWatchdog = vi.fn(() => vi.fn());
      const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
        scheduleTimeout: (listener) => {
          const timeout = setTimeout(listener, 15_000);
          return () => clearTimeout(timeout);
        },
        schedulePostConfirmationWatchdog
      });
      const handle = broker.request({
        windowId: "window-1",
        sendRequest: vi.fn(),
        bindAbort: () => vi.fn()
      });
      const identity = {
        requestId: handle.requestId,
        windowId: "window-1"
      };
      const scope = broker.beginConfirmation(identity);
      expect(scope).not.toBeNull();
      expect(broker.beginConfirmation(identity)).toBeNull();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(broker.hasPending("window-1")).toBe(true);
      expect(scope?.isActive()).toBe(true);
      expect(broker.beginConfirmation(identity)).toBeNull();
      expect(schedulePostConfirmationWatchdog).not.toHaveBeenCalled();

      const confirmation = { token: "after-long-prompt" };
      expect(
        broker.setConfirmation({ ...identity, confirmation })
      ).toBe(true);
      scope?.finish();
      expect(schedulePostConfirmationWatchdog).toHaveBeenCalledOnce();
      expect(broker.beginConfirmation(identity)).toBeNull();
      expect(broker.complete(handle.requestId, "window-1", true)).toBe(true);
      await expect(handle.result).resolves.toBe(confirmation);
      await expect(handle.drained).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["renderer-abort", "window-close"] as const)(
    "keeps an active confirmation drain pending after %s",
    async (mode) => {
      let abort!: () => void;
      const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
        scheduleTimeout: () => vi.fn()
      });
      const handle = broker.request({
        windowId: "window-1",
        sendRequest: vi.fn(),
        bindAbort: (listener) => {
          abort = listener;
          return vi.fn();
        }
      });
      const scope = broker.beginConfirmation({
        requestId: handle.requestId,
        windowId: "window-1"
      });
      expect(scope).not.toBeNull();
      let drained = false;
      void handle.drained.then(() => {
        drained = true;
      });

      if (mode === "renderer-abort") {
        abort();
      } else {
        broker.abortWindow("window-1");
      }

      await expect(handle.result).resolves.toBeNull();
      await Promise.resolve();
      expect(drained).toBe(false);
      expect(scope?.isActive()).toBe(false);
      expect(
        broker.beginConfirmation({
          requestId: handle.requestId,
          windowId: "window-1"
        })
      ).toBeNull();

      scope?.finish();
      scope?.finish();
      await expect(handle.drained).resolves.toBeUndefined();
      expect(drained).toBe(true);
    }
  );

  it("settles null when completion rejects the close even with a confirmation", async () => {
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => vi.fn()
    });
    const handle = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    const scope = broker.beginConfirmation({
      requestId: handle.requestId,
      windowId: "window-1"
    });

    broker.setConfirmation({
      requestId: handle.requestId,
      windowId: "window-1",
      confirmation: { token: "ignored" }
    });
    scope?.finish();
    expect(broker.complete(handle.requestId, "window-1", false)).toBe(true);

    await expect(handle.result).resolves.toBeNull();
  });

  it("fails closed when positive completion arrives without a confirmation", async () => {
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => vi.fn()
    });
    const handle = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });

    expect(broker.complete(handle.requestId, "window-1", true)).toBe(true);

    await expect(handle.result).resolves.toBeNull();
  });

  it("aborts exactly once when either renderer lifecycle signal fires", async () => {
    let abort!: () => void;
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => cancelTimeout
    });
    const handle = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: (listener) => {
        abort = listener;
        return unbindAbort;
      }
    });

    abort();
    broker.abortWindow("window-1");
    abort();

    await expect(handle.result).resolves.toBeNull();
    await expect(handle.drained).resolves.toBeUndefined();
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(broker.hasPending("window-1")).toBe(false);
  });

  it("rejects the authoritative send error without leaking cleanup", async () => {
    const failure = new Error("send failed");
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => cancelTimeout
    });

    const handle = broker.request({
      windowId: "window-1",
      sendRequest: () => {
        throw failure;
      },
      bindAbort: () => unbindAbort
    });

    await expect(handle.result).rejects.toBe(failure);
    await expect(handle.drained).resolves.toBeUndefined();
    expect(broker.hasPending("window-1")).toBe(false);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
  });

  it("rejects bind and scheduler setup errors while cleaning installed resources", async () => {
    const bindFailure = new Error("bind failed");
    const scheduleFailure = new Error("schedule failed");
    const brokerAfterBindFailure = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: vi.fn()
    });
    const bindHandle = brokerAfterBindFailure.request({
      windowId: "window-bind",
      sendRequest: vi.fn(),
      bindAbort: () => {
        throw bindFailure;
      }
    });
    await expect(bindHandle.result).rejects.toBe(bindFailure);
    await expect(bindHandle.drained).resolves.toBeUndefined();
    expect(brokerAfterBindFailure.hasPending("window-bind")).toBe(false);

    const unbindAbort = vi.fn();
    const brokerAfterScheduleFailure = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => {
        throw scheduleFailure;
      }
    });
    const scheduleHandle = brokerAfterScheduleFailure.request({
      windowId: "window-schedule",
      sendRequest: vi.fn(),
      bindAbort: () => unbindAbort
    });
    await expect(scheduleHandle.result).rejects.toBe(scheduleFailure);
    await expect(scheduleHandle.drained).resolves.toBeUndefined();
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(brokerAfterScheduleFailure.hasPending("window-schedule")).toBe(false);
  });
});
