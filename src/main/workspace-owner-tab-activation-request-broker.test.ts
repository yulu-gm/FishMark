import { describe, expect, it, vi } from "vitest";

import { createWorkspaceOwnerTabActivationRequestBroker } from "./workspace-owner-tab-activation-request-broker";

describe("workspace owner-tab activation request broker", () => {
  it("settles only an exact confirmation and cleans request resources", async () => {
    let timeout!: () => void;
    let abort!: () => void;
    const cancelTimeout = vi.fn();
    const unbindAbort = vi.fn();
    const sendRequest = vi.fn();
    const broker = createWorkspaceOwnerTabActivationRequestBroker({
      scheduleTimeout: (listener) => {
        timeout = listener;
        return cancelTimeout;
      }
    });
    const handle = broker.request({
      windowId: "window-1",
      tabId: "tab-1",
      sendRequest,
      bindAbort: (listener) => {
        abort = listener;
        return unbindAbort;
      }
    });
    const requestId = sendRequest.mock.calls[0]![0].requestId as string;

    expect(broker.complete({ requestId, windowId: "window-2", tabId: "tab-1", success: true })).toBe(false);
    expect(broker.complete({ requestId, windowId: "window-1", tabId: "tab-other", success: true })).toBe(false);
    expect(broker.complete({ requestId, windowId: "window-1", tabId: "tab-1", success: true })).toBe(true);
    await expect(handle.result).resolves.toBe(true);
    expect(cancelTimeout).toHaveBeenCalledOnce();
    expect(unbindAbort).toHaveBeenCalledOnce();

    timeout();
    abort();
    expect(broker.hasPending("window-1")).toBe(false);
  });

  it.each(["timeout", "owner-destroyed"] as const)(
    "fails closed and cleans a request on %s",
    async (reason) => {
      let timeout!: () => void;
      let abort!: () => void;
      const cancelTimeout = vi.fn();
      const unbindAbort = vi.fn();
      const broker = createWorkspaceOwnerTabActivationRequestBroker({
        scheduleTimeout: (listener) => {
          timeout = listener;
          return cancelTimeout;
        }
      });
      const handle = broker.request({
        windowId: "window-1",
        tabId: "tab-1",
        sendRequest: vi.fn(),
        bindAbort: (listener) => {
          abort = listener;
          return unbindAbort;
        }
      });

      if (reason === "timeout") {
        timeout();
      } else {
        abort();
      }

      await expect(handle.result).resolves.toBe(false);
      expect(cancelTimeout).toHaveBeenCalledOnce();
      expect(unbindAbort).toHaveBeenCalledOnce();
      expect(broker.hasPending("window-1")).toBe(false);
    }
  );

  it("disposes an abort binding installed after synchronous owner destruction", async () => {
    const unbindAbort = vi.fn();
    const scheduleTimeout = vi.fn();
    const broker = createWorkspaceOwnerTabActivationRequestBroker({
      scheduleTimeout
    });

    const handle = broker.request({
      windowId: "window-1",
      tabId: "tab-1",
      sendRequest: vi.fn(),
      bindAbort: (listener) => {
        listener();
        return unbindAbort;
      }
    });

    await expect(handle.result).resolves.toBe(false);
    expect(unbindAbort).toHaveBeenCalledOnce();
    expect(scheduleTimeout).not.toHaveBeenCalled();
  });
});
