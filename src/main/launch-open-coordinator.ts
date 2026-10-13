import type { OpenWorkspacePathRequest } from "../shared/workspace";

type LaunchWindow = {
  isDestroyed(): boolean;
  webContents: { isDestroyed(): boolean };
};

/** A launch stays queued until its owning renderer completes it. */
export function createLaunchOpenCoordinator<TWindow extends LaunchWindow>(input: {
  preferredWindow(): TWindow | null;
  createWindow(): TWindow;
  activate(window: TWindow): void;
  send(window: TWindow, request: OpenWorkspacePathRequest): void | Promise<void>;
  prepare?(window: TWindow, request: OpenWorkspacePathRequest): Promise<() => void>;
  revoke?(window: TWindow, requestId: string): void;
  watch(window: TWindow, lost: () => void): () => void;
  schedule(callback: () => void, delayMs: number): () => void;
  reportFailure(targetPath: string, error: unknown): void;
}) {
  const queue: { requestId: string; targetPath: string; attempts: number }[] = [];
  const ready = new Set<TWindow>();
  const watched = new Map<TWindow, () => void>();
  let target: TWindow | null = null;
  let inFlight = false;
  let cancelDeadline: (() => void) | null = null;
  let cancelRetry: (() => void) | null = null;
  let nextId = 0;
  let deliveryAttempt = 0;
  let disposed = false;
  let suspended = false;
  const live = (window: TWindow) => !window.isDestroyed() && !window.webContents.isDestroyed();

  function clearTimers() {
    cancelDeadline?.(); cancelDeadline = null;
    cancelRetry?.(); cancelRetry = null;
  }
  function fail(error: unknown) {
    const head = queue.shift();
    if (head && target) input.revoke?.(target, head.requestId);
    clearTimers();
    target = null;
    inFlight = false;
    if (head) input.reportFailure(head.targetPath, error);
    pump();
  }
  function retry(error: unknown) {
    if (target && queue[0]) input.revoke?.(target, queue[0].requestId);
    inFlight = false;
    clearTimers();
    const head = queue[0];
    if (!head || disposed || suspended) return;
    if (head.attempts >= 3) { fail(error); return; }
    // Keep the id on retry; preload deduplicates an already received request.
    cancelRetry = input.schedule(() => { cancelRetry = null; pump(); }, 100);
  }
  function watch(window: TWindow) {
    if (watched.has(window)) return;
    watched.set(window, input.watch(window, () => {
      ready.delete(window);
      if (!live(window)) {
        watched.get(window)?.();
        watched.delete(window);
      }
      if (target === window && queue.length) {
        input.revoke?.(window, queue[0]!.requestId);
        target = null;
        retry(new Error("The editor window became unavailable."));
      }
    }));
  }
  function pump() {
    if (disposed || suspended || inFlight || cancelRetry) return;
    const head = queue[0];
    if (!head) return;
    try {
      if (!target || !live(target)) {
        const preferred = input.preferredWindow();
        target = preferred && live(preferred) ? preferred : input.createWindow();
        head.attempts += 1;
        watch(target);
        input.activate(target);
      }
      if (!ready.has(target)) {
        cancelDeadline ??= input.schedule(() => fail(new Error("The editor did not become ready. Please open this file again.")), 60_000);
        return;
      }
      cancelDeadline?.(); cancelDeadline = null;
      inFlight = true;
      const attempt = ++deliveryAttempt;
      input.activate(target);
      const sendingWindow = target;
      const request = { requestId: head.requestId, targetPath: head.targetPath };
      const current = () => !disposed && !suspended && deliveryAttempt === attempt && target === sendingWindow && queue[0] === head && inFlight && ready.has(sendingWindow);
      const failed = (error: unknown) => {
        if (deliveryAttempt === attempt && target === sendingWindow && queue[0] === head && inFlight) {
          head.attempts += 1;
          retry(error);
        }
      };
      const deliver = () => {
        if (!current()) return;
        try {
          const sent = input.send(sendingWindow, request);
          if (sent) void sent.catch(failed);
        } catch (error) { failed(error); }
      };
      if (input.prepare) void input.prepare(sendingWindow, request).then((revoke) => {
        if (!current()) {
          revoke();
          if (deliveryAttempt === attempt && target === sendingWindow && queue[0] === head) inFlight = false;
          return;
        }
        deliver();
      }).catch(failed);
      else deliver();
      // Do not time out an open already being processed: the user may be
      // responding to a dialog. Renderer loss explicitly triggers recovery.
    } catch (error) {
      head.attempts += 1;
      retry(error);
    }
  }
  return {
    enqueue(paths: readonly string[]) {
      if (disposed) return;
      for (const targetPath of paths) queue.push({ requestId: `launch:${++nextId}`, targetPath, attempts: 0 });
      pump();
    },
    setReady(window: TWindow, value: boolean) {
      if (disposed || !live(window)) return;
      watch(window);
      if (value) ready.add(window); else ready.delete(window);
      pump();
    },
    complete(window: TWindow, requestId: string, success: boolean) {
      if (disposed || !live(window) || window !== target || !inFlight || queue[0]?.requestId !== requestId) return false;
      const head = queue.shift()!;
      input.revoke?.(window, head.requestId);
      clearTimers();
      inFlight = false;
      if (!queue.length) target = null;
      if (!success) input.reportFailure(head.targetPath, new Error("The editor could not process this open request."));
      pump();
      return true;
    },
    hasPending: () => queue.length > 0,
    suspend() { suspended = true; clearTimers(); },
    resume() { suspended = false; pump(); },
    dispose() {
      disposed = true;
      if (target && queue[0]) input.revoke?.(target, queue[0].requestId);
      clearTimers();
      for (const unwatch of watched.values()) unwatch();
      watched.clear(); ready.clear(); queue.length = 0;
    }
  };
}
