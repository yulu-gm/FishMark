import { describe, expect, it, vi } from "vitest";

import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";

type Confirmation = Readonly<{ token: string }>;

describe("createWorkspaceWindowCloseRequestBroker", () => {
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

    expect(broker.getPendingIdentity("window-1")).toEqual({
      requestId: handle.requestId,
      windowId: "window-1"
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
    ).toBe(true);
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
    expect(broker.complete(second.requestId, "window-1", true)).toBe(true);
    await expect(second.result).resolves.toBe(secondConfirmation);
  });

  it.each(["timeout", "abort"] as const)(
    "keeps an active confirmation drain pending after %s",
    async (mode) => {
      let timeout!: () => void;
      let abort!: () => void;
      const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
        scheduleTimeout: (listener) => {
          timeout = listener;
          return vi.fn();
        }
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

      if (mode === "timeout") {
        timeout();
      } else {
        abort();
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

    broker.setConfirmation({
      requestId: handle.requestId,
      windowId: "window-1",
      confirmation: { token: "ignored" }
    });
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
