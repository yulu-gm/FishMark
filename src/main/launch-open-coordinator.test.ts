import { afterEach, describe, expect, it, vi } from "vitest";
import { createLaunchOpenCoordinator } from "./launch-open-coordinator";

function fixture(prepare?: Parameters<typeof createLaunchOpenCoordinator>[0]["prepare"]) {
  vi.useFakeTimers();
  const makeWindow = () => ({ destroyed: false, isDestroyed() { return this.destroyed; }, webContents: { isDestroyed: () => false } });
  const first = makeWindow();
  const replacement = makeWindow();
  const watchers = new Map<typeof first, () => void>();
  const send = vi.fn();
  const createWindow = vi.fn(() => replacement);
  const reportFailure = vi.fn();
  const activate = vi.fn();
  const coordinator = createLaunchOpenCoordinator({
    preferredWindow: () => first,
    createWindow, activate, send, reportFailure, prepare,
    watch: (window, lost) => { watchers.set(window, lost); return () => { watchers.delete(window); }; },
    schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); }
  });
  const lastRequest = () => send.mock.lastCall![1] as { requestId: string; targetPath: string };
  return { coordinator, first, replacement, watchers, send, createWindow, reportFailure, activate, lastRequest };
}
afterEach(() => vi.useRealTimers());

describe("launch open coordinator", () => {
  it.each(["lost", "dispose", "suspend"])("revokes pending main grants instead of sending after %s", async (kind) => {
    let issue!: (value: () => void) => void;
    const revoke = vi.fn();
    const prepare = vi.fn(() => new Promise<() => void>((resolve) => { issue = resolve; }));
    const f = fixture(prepare); f.coordinator.setReady(f.first, true); f.coordinator.enqueue(["a.md"]);
    expect(f.send).not.toHaveBeenCalled();
    if (kind === "lost") f.watchers.get(f.first)!();
    if (kind === "dispose") f.coordinator.dispose();
    if (kind === "suspend") f.coordinator.suspend();
    issue(revoke); await Promise.resolve(); await Promise.resolve();
    expect(f.send).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it("recovers a rejected asynchronous main grant without losing the request id", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("grant unavailable")).mockResolvedValue(() => {});
    const f = fixture(prepare); f.coordinator.setReady(f.first, true); f.coordinator.enqueue(["a.md"]);
    await Promise.resolve(); await Promise.resolve(); vi.advanceTimersByTime(100); await Promise.resolve();
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.lastRequest()).toEqual({ requestId: "launch:1", targetPath: "a.md" });
  });
  it("queues multiple startup and second-instance paths behind renderer readiness and completion", () => {
    const f = fixture();
    f.coordinator.enqueue(["a.md", "b.md"]);
    f.coordinator.enqueue(["c.md"]);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.createWindow).not.toHaveBeenCalled();
    f.coordinator.setReady(f.first, true);
    expect(f.send).toHaveBeenCalledTimes(1);
    for (const targetPath of ["a.md", "b.md", "c.md"]) {
      expect(f.lastRequest().targetPath).toBe(targetPath);
      expect(f.coordinator.complete(f.replacement, f.lastRequest().requestId, true)).toBe(false);
      expect(f.coordinator.complete(f.first, "stale", true)).toBe(false);
      expect(f.coordinator.complete(f.first, f.lastRequest().requestId, true)).toBe(true);
    }
    expect(f.coordinator.hasPending()).toBe(false);
    expect(f.reportFailure).not.toHaveBeenCalled();
  });

  it.each([false, true])("recovers a destroyed target (request sent: %s) without losing order", (sent) => {
    const f = fixture();
    if (sent) f.coordinator.setReady(f.first, true);
    f.coordinator.enqueue(["a.md", "b.md"]);
    const requestId = sent ? f.lastRequest().requestId : "launch:1";
    f.first.destroyed = true;
    f.watchers.get(f.first)!();
    vi.advanceTimersByTime(100);
    expect(f.createWindow).toHaveBeenCalledTimes(1);
    f.coordinator.setReady(f.replacement, true);
    expect(f.lastRequest()).toEqual({ requestId, targetPath: "a.md" });
    expect(f.coordinator.complete(f.first, requestId, true)).toBe(false);
    f.coordinator.complete(f.replacement, requestId, true);
    expect(f.lastRequest().targetPath).toBe("b.md");
  });

  it("retries a transient send failure with the same identity before advancing", () => {
    const f = fixture();
    f.send.mockImplementationOnce(() => { throw new Error("send failed"); });
    f.coordinator.setReady(f.first, true);
    f.coordinator.enqueue(["a.md", "b.md"]);
    const request = f.lastRequest();
    vi.advanceTimersByTime(100);
    expect(f.lastRequest()).toEqual(request);
    f.coordinator.complete(f.first, request.requestId, true);
    expect(f.lastRequest().targetPath).toBe("b.md");
    expect(f.reportFailure).not.toHaveBeenCalled();
  });

  it("reports persistent transport failure with bounded retries", () => {
    const f = fixture();
    f.send.mockImplementation(() => { throw new Error("send failed"); });
    f.coordinator.setReady(f.first, true);
    f.coordinator.enqueue(["a.md"]);
    vi.runAllTimers();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.reportFailure).toHaveBeenCalledWith("a.md", expect.any(Error));
    expect(f.coordinator.hasPending()).toBe(false);
  });

  it("waits for reload readiness and ignores completion while delivery is suspended", () => {
    const f = fixture();
    f.coordinator.setReady(f.first, true);
    f.coordinator.enqueue(["a.md"]);
    const request = f.lastRequest();
    f.watchers.get(f.first)!();
    expect(f.coordinator.complete(f.first, request.requestId, true)).toBe(false);
    vi.advanceTimersByTime(100);
    expect(f.send).toHaveBeenCalledTimes(1);
    f.coordinator.setReady(f.first, true);
    expect(f.lastRequest()).toEqual(request);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it("reports readiness timeout but never times out a renderer processing a user dialog", () => {
    const f = fixture();
    f.coordinator.enqueue(["a.md"]);
    vi.advanceTimersByTime(60_000);
    expect(f.reportFailure).toHaveBeenCalledTimes(1);
    f.coordinator.setReady(f.first, true);
    f.coordinator.enqueue(["b.md"]);
    vi.advanceTimersByTime(120_000);
    expect(f.coordinator.hasPending()).toBe(true);
    expect(f.reportFailure).toHaveBeenCalledTimes(1);
  });

  it("stops recovery and timers when the user quits", () => {
    const f = fixture();
    f.coordinator.enqueue(["a.md"]);
    f.coordinator.dispose();
    f.coordinator.enqueue(["b.md"]);
    vi.runAllTimers();
    expect(f.watchers.size).toBe(0);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.reportFailure).not.toHaveBeenCalled();
    expect(f.coordinator.hasPending()).toBe(false);
  });
  it("resumes queued launch requests after the user cancels quitting", () => {
    const f = fixture();
    f.coordinator.setReady(f.first, true);
    f.coordinator.suspend();
    f.coordinator.enqueue(["a.md", "b.md"]);
    expect(f.send).not.toHaveBeenCalled();
    f.coordinator.resume();
    expect(f.lastRequest().targetPath).toBe("a.md");
    f.coordinator.complete(f.first, f.lastRequest().requestId, true);
    expect(f.lastRequest().targetPath).toBe("b.md");
  });
});
