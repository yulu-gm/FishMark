import { describe, expect, it, vi } from "vitest";

import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";

type Confirmation = Readonly<{ token: string }>;

describe("createWorkspaceWindowCloseRequestBroker", () => {
  it("bounds a never-resolving request and ignores late completion", async () => {
    let timeout!: () => void;
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: (listener) => {
        timeout = listener;
        return cancelTimeout;
      }
    });
    let requestId = "";
    const request = broker.request({
      windowId: "window-1",
      sendRequest: (id) => {
        requestId = id;
      },
      bindAbort: () => unbindAbort
    });

    expect(broker.hasPending("window-1")).toBe(true);
    expect(requestId).toMatch(/^window-1:/);

    timeout();

    await expect(request).resolves.toBeNull();
    expect(broker.hasPending("window-1")).toBe(false);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(
      broker.complete(requestId, "window-1", true)
    ).toBe(false);
    expect(broker.setConfirmation("window-1", { token: "late" })).toBe(false);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
  });

  it("returns the stored confirmation only after a matching positive completion", async () => {
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => cancelTimeout
    });
    let requestId = "";
    const request = broker.request({
      windowId: "window-1",
      sendRequest: (id) => {
        requestId = id;
      },
      bindAbort: () => unbindAbort
    });
    const confirmation = Object.freeze({ token: "confirmed" });

    expect(broker.setConfirmation("window-1", confirmation)).toBe(true);
    expect(broker.complete(requestId, "another-window", true)).toBe(false);
    expect(broker.complete(requestId, "window-1", true)).toBe(true);

    await expect(request).resolves.toBe(confirmation);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();
  });

  it("settles null when completion rejects the close even with a confirmation", async () => {
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => vi.fn()
    });
    let requestId = "";
    const request = broker.request({
      windowId: "window-1",
      sendRequest: (id) => {
        requestId = id;
      },
      bindAbort: () => vi.fn()
    });

    broker.setConfirmation("window-1", { token: "ignored" });
    expect(broker.complete(requestId, "window-1", false)).toBe(true);

    await expect(request).resolves.toBeNull();
  });

  it("fails closed when positive completion arrives without a confirmation", async () => {
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => vi.fn()
    });
    let requestId = "";
    const request = broker.request({
      windowId: "window-1",
      sendRequest: (id) => {
        requestId = id;
      },
      bindAbort: () => vi.fn()
    });

    expect(broker.complete(requestId, "window-1", true)).toBe(true);

    await expect(request).resolves.toBeNull();
  });

  it("aborts exactly once when either renderer lifecycle signal fires", async () => {
    let abort!: () => void;
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const broker = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => cancelTimeout
    });
    const request = broker.request({
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

    await expect(request).resolves.toBeNull();
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

    const request = broker.request({
      windowId: "window-1",
      sendRequest: () => {
        throw failure;
      },
      bindAbort: () => unbindAbort
    });

    await expect(request).rejects.toBe(failure);
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
    await expect(
      brokerAfterBindFailure.request({
        windowId: "window-bind",
        sendRequest: vi.fn(),
        bindAbort: () => {
          throw bindFailure;
        }
      })
    ).rejects.toBe(bindFailure);
    expect(brokerAfterBindFailure.hasPending("window-bind")).toBe(false);

    const unbindAbort = vi.fn();
    const brokerAfterScheduleFailure = createWorkspaceWindowCloseRequestBroker<Confirmation>({
      scheduleTimeout: () => {
        throw scheduleFailure;
      }
    });
    await expect(
      brokerAfterScheduleFailure.request({
        windowId: "window-schedule",
        sendRequest: vi.fn(),
        bindAbort: () => unbindAbort
      })
    ).rejects.toBe(scheduleFailure);
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(brokerAfterScheduleFailure.hasPending("window-schedule")).toBe(false);
  });
});
