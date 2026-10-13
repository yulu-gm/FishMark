import { describe, expect, it, vi } from "vitest";
import { createWindowCloseIntent } from "./window-close-intent";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("window close intent", () => {
  it("sends a fresh request after a cancelled handshake completes, coalescing repeated close events", async () => {
    const broker = createWorkspaceWindowCloseRequestBroker<string>({
      scheduleTimeout: () => () => {}, schedulePostConfirmationWatchdog: () => () => {}
    });
    const requestIds: string[] = [];
    const released: string[] = [];
    const coordinator = createWindowCloseIntent({
      attempt: async () => {
        const request = broker.request({ windowId: "one", sendRequest: id => requestIds.push(id), bindAbort: () => () => {} });
        const result = await request.result;
        await request.drained;
        released.push(request.requestId);
        return result === null ? "cancelled" : "closed";
      }, reportError: vi.fn()
    });
    const pending = coordinator.request();
    const first = requestIds[0]!;
    const scope = broker.beginConfirmation({ requestId: first, windowId: "one" })!;
    broker.setConfirmation({ requestId: first, windowId: "one", confirmation: null });
    scope.finish();
    coordinator.cancelQueued();
    coordinator.request(); coordinator.request(); coordinator.request();
    expect(requestIds).toHaveLength(1);
    broker.complete(first, "one", false);
    await vi.waitFor(() => expect(requestIds).toHaveLength(2));
    expect(released).toEqual([first]);
    const second = requestIds[1]!;
    expect(second).not.toBe(first);
    broker.complete(second, "one", false);
    await pending;
    expect(requestIds).toHaveLength(2);
    expect(broker.hasPending("one")).toBe(false);
  });

  it("owns the interval before the broker request while acquiring a lease", async () => {
    const lease = deferred<"cancelled">();
    const attempt = vi.fn().mockImplementationOnce(() => lease.promise).mockResolvedValue("cancelled");
    const owner = createWindowCloseIntent({ attempt, reportError: vi.fn() });
    const pending = owner.request();
    owner.request(); owner.request();
    expect(attempt).toHaveBeenCalledTimes(1);
    lease.resolve("cancelled");
    await pending;
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not prompt again after cancellation without a new close", async () => {
    const attempt = vi.fn().mockResolvedValue("cancelled");
    const owner = createWindowCloseIntent({ attempt, reportError: vi.fn() });
    await owner.request();
    expect(attempt).toHaveBeenCalledOnce();
  });

  it("Cancel drops repeated clicks made before its response, preserving a later new close", async () => {
    const gate = deferred<"cancelled">();
    const attempt = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue("cancelled");
    const owner = createWindowCloseIntent({ attempt, reportError: vi.fn() });
    const pending = owner.request(); owner.request(); owner.request();
    owner.cancelQueued();
    gate.resolve("cancelled");
    await pending;
    expect(attempt).toHaveBeenCalledOnce();
    await owner.request();
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it.each(["closed", "dispose"] as const)("drops queued intent after %s", async outcome => {
    const gate = deferred<"closed" | "cancelled">();
    const attempt = vi.fn(() => gate.promise);
    const owner = createWindowCloseIntent({ attempt, reportError: vi.fn() });
    const pending = owner.request(); owner.request();
    if (outcome === "dispose") owner.dispose();
    gate.resolve(outcome === "closed" ? "closed" : "cancelled");
    await pending;
    expect(attempt).toHaveBeenCalledOnce();
    if (outcome === "dispose") { await owner.request(); expect(attempt).toHaveBeenCalledOnce(); }
  });

  it("clears queued intent after errors and accepts a later explicit request", async () => {
    const gate = deferred<"cancelled">();
    const attempt = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue("cancelled");
    const reportError = vi.fn().mockResolvedValue(undefined);
    const owner = createWindowCloseIntent({ attempt, reportError });
    const pending = owner.request(); owner.request();
    const error = new Error("lease failed"); gate.reject(error);
    await pending;
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
    expect(attempt).toHaveBeenCalledOnce();
    await owner.request(); expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("keeps different window queues independent", async () => {
    const gate = deferred<"cancelled">();
    const first = createWindowCloseIntent({ attempt: () => gate.promise, reportError: vi.fn() });
    const attempt = vi.fn().mockResolvedValue("cancelled");
    const second = createWindowCloseIntent({ attempt, reportError: vi.fn() });
    const pending = first.request();
    await second.request(); expect(attempt).toHaveBeenCalledOnce();
    gate.resolve("cancelled"); await pending;
  });
});
