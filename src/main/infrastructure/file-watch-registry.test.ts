import type { Stats } from "node:fs";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../../shared/external-file-change";
import { createFileWatchRegistry } from "./file-watch-registry";

type WatchListener = (eventType: "change" | "rename") => void;

function stats(mtimeMs: number, size: number): Stats {
  return { mtimeMs, size } as Stats;
}

function createTarget(id = 1) {
  return {
    id,
    send: vi.fn<(channel: string, payload: unknown) => void>(),
    once: vi.fn<(event: "destroyed", listener: () => void) => void>()
  };
}

function lifecycleTarget(id = 1) {
  const target = Object.assign(new EventEmitter(), { id, send: vi.fn() });
  return target;
}

function pendingSnapshot() {
  let resolve!: (value: Stats) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Stats>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("file watcher target lifecycle", () => {
  it("binds exactly one listener for100 identical target syncs", async () => {
    const target = lifecycleTarget(), close = vi.fn(), watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({ watch, stat: async () => stats(1, 2) });
    for (let i = 0; i < 100; i++) await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(target.listenerCount("destroyed")).toBe(1);
    expect(watch).toHaveBeenCalledTimes(1);
    target.emit("destroyed");
    expect(target.listenerCount("destroyed")).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("retains one lifecycle binding through empty paths and re-subscription", async () => {
    const target = lifecycleTarget(), close = vi.fn(), watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({ watch, stat: async () => stats(1, 2) });
    await registry.syncWindowPaths(target, []);
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    await registry.syncWindowPaths(target, []);
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(target.listenerCount("destroyed")).toBe(1);
    expect(watch).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    target.emit("destroyed");
    expect(close).toHaveBeenCalledTimes(2);
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(target.listenerCount("destroyed")).toBe(0);
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it.each(["stat", "watch"])("retries failed %s initialization without rebinding lifecycle", async stage => {
    const failure = new Error("initialization failed"), target = lifecycleTarget(), close = vi.fn();
    let first = true;
    const stat = vi.fn(async () => { if (stage === "stat" && first) { first = false; throw failure; } return stats(1, 2); });
    const watch = vi.fn(() => { if (stage === "watch" && first) { first = false; throw failure; } return { close }; });
    const registry = createFileWatchRegistry({ watch, stat });
    await expect(registry.syncWindowPaths(target, ["C:/notes/a.md"])).rejects.toBe(failure);
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(target.listenerCount("destroyed")).toBe(1);
    target.emit("destroyed");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps one shared watcher until both distinct windows leave", async () => {
    const a = lifecycleTarget(1), b = lifecycleTarget(2), close = vi.fn(), watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({ watch, stat: async () => stats(1, 2) });
    await registry.syncWindowPaths(a, ["C:/notes/shared.md"]);
    await registry.syncWindowPaths(b, ["C:/notes/shared.md"]);
    await registry.syncWindowPaths(a, ["C:/notes/shared.md"]);
    expect(a.listenerCount("destroyed")).toBe(1); expect(b.listenerCount("destroyed")).toBe(1);
    a.emit("destroyed"); expect(close).not.toHaveBeenCalled();
    b.emit("destroyed"); expect(close).toHaveBeenCalledTimes(1);
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it("does not create a watcher after destruction during baseline stat", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot(), watch = vi.fn(() => ({ close: vi.fn() }));
    const stat = vi.fn(() => pending.promise), registry = createFileWatchRegistry({ watch, stat });
    const syncing = registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    target.emit("destroyed"); pending.resolve(stats(1, 2)); await syncing;
    expect(watch).not.toHaveBeenCalled(); expect(target.send).not.toHaveBeenCalled();
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(watch).not.toHaveBeenCalled(); expect(target.listenerCount("destroyed")).toBe(0);
  });

  it("does not revive cleared paths or add later stale paths after a pending stat", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot(), watch = vi.fn(() => ({ close: vi.fn() }));
    const stat = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(stats(1, 2));
    const registry = createFileWatchRegistry({ watch, stat });
    const syncing = registry.syncWindowPaths(target, ["C:/notes/a.md", "C:/notes/b.md"]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    await registry.syncWindowPaths(target, []); pending.resolve(stats(1, 2)); await syncing;
    expect(watch).not.toHaveBeenCalled(); expect(stat).toHaveBeenCalledTimes(1);
    await registry.syncWindowPaths(target, ["C:/notes/b.md"]); expect(watch).toHaveBeenCalledTimes(1);
    target.emit("destroyed");
  });

  it("finishes a shared initialization for the surviving subscriber only", async () => {
    const a = lifecycleTarget(1), b = lifecycleTarget(2), pending = pendingSnapshot(), close = vi.fn();
    const watch = vi.fn(() => ({ close })), stat = vi.fn(() => pending.promise);
    const registry = createFileWatchRegistry({ watch, stat });
    const first = registry.syncWindowPaths(a, ["C:/notes/shared.md"]);
    const second = registry.syncWindowPaths(b, ["C:/notes/shared.md"]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    a.emit("destroyed"); pending.resolve(stats(1, 2)); await Promise.all([first, second]);
    expect(stat).toHaveBeenCalledTimes(1); expect(watch).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled(); b.emit("destroyed"); expect(close).toHaveBeenCalledTimes(1);
  });

  it("shares initialization failure and allows both windows to retry", async () => {
    const a = lifecycleTarget(1), b = lifecycleTarget(2), pending = pendingSnapshot(), failure = new Error("stat failed"), close = vi.fn();
    const stat = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(stats(1, 2)), watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({ watch, stat });
    const first = registry.syncWindowPaths(a, ["C:/notes/shared.md"]).catch(error => error);
    const second = registry.syncWindowPaths(b, ["C:/notes/shared.md"]).catch(error => error);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    pending.reject(failure); expect(await first).toBe(failure); expect(await second).toBe(failure);
    await registry.syncWindowPaths(a, ["C:/notes/shared.md"]); await registry.syncWindowPaths(b, ["C:/notes/shared.md"]);
    a.emit("destroyed"); expect(close).not.toHaveBeenCalled(); b.emit("destroyed"); expect(close).toHaveBeenCalledTimes(1);
    expect(a.listenerCount("destroyed")).toBe(0); expect(b.listenerCount("destroyed")).toBe(0);
  });

  it("does not remove a replacement entry when obsolete stat rejects", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot(), failure = new Error("obsolete stat"), close = vi.fn();
    const stat = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(stats(1, 2)), watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({ watch, stat });
    const old = registry.syncWindowPaths(target, ["C:/notes/a.md"]).catch(error => error);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    await registry.syncWindowPaths(target, []); await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    pending.reject(failure); expect(await old).toBe(failure);
    expect(watch).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    target.emit("destroyed"); expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes a just-created watcher if the target is destroyed synchronously during watch setup", async () => {
    const target = lifecycleTarget(), close = vi.fn();
    const watch = vi.fn(() => { target.emit("destroyed"); return { close }; });
    const registry = createFileWatchRegistry({ watch, stat: async () => stats(1, 2) });
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    expect(close).toHaveBeenCalledTimes(1);
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]); expect(watch).toHaveBeenCalledTimes(1);
  });

  it("does not deliver an in-flight external stat after destruction", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot(), close = vi.fn();
    let callback!: WatchListener;
    const watch = vi.fn((_path: string, listener: WatchListener) => { callback = listener; return { close }; });
    const stat = vi.fn().mockResolvedValueOnce(stats(1, 2)).mockReturnValueOnce(pending.promise);
    const registry = createFileWatchRegistry({ watch, stat });
    await registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    callback("change"); target.emit("destroyed"); pending.resolve(stats(2, 3));
    await Promise.resolve(); await Promise.resolve();
    expect(target.send).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  });

  it("waits for initial baseline before internal writes can update it", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot();
    let callback!: WatchListener, began = false;
    const watch = vi.fn((_path: string, listener: WatchListener) => { callback = listener; return { close: vi.fn() }; });
    const stat = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(stats(3, 4));
    const registry = createFileWatchRegistry({ watch, stat });
    const syncing = registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    const writing = registry.beginInternalWrite(target, "C:/notes/a.md").then(() => { began = true; });
    await Promise.resolve(); expect(began).toBe(false);
    pending.resolve(stats(1, 2)); await Promise.all([syncing, writing]);
    await registry.completeInternalWrite(target, "C:/notes/a.md");
    callback("change"); await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(3));
    expect(target.send).not.toHaveBeenCalled(); target.emit("destroyed");
  });

  it("does not resume a pending internal-write hook for a destroyed target", async () => {
    const target = lifecycleTarget(), pending = pendingSnapshot(), watch = vi.fn(() => ({ close: vi.fn() }));
    const stat = vi.fn(() => pending.promise), registry = createFileWatchRegistry({ watch, stat });
    const syncing = registry.syncWindowPaths(target, ["C:/notes/a.md"]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(1));
    const writing = registry.beginInternalWrite(target, "C:/notes/a.md");
    target.emit("destroyed"); pending.resolve(stats(1, 2)); await Promise.all([syncing, writing]);
    await registry.completeInternalWrite(target, "C:/notes/a.md");
    expect(watch).not.toHaveBeenCalled(); expect(stat).toHaveBeenCalledTimes(1);
  });
});

describe("createFileWatchRegistry", () => {
  it("watches every subscribed path, including inactive tabs in one window", async () => {
    const watchCallbacks = new Map<string, WatchListener>();
    let snapshot = { mtimeMs: 1, size: 10 };
    const stat = vi.fn(async () => ({ ...snapshot }) as Stats);
    const registry = createFileWatchRegistry({
      watch: vi.fn((targetPath: string, listener: WatchListener) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });
    const sender = createTarget();

    await registry.syncWindowPaths(sender, [
      "C:/notes/active.md",
      "C:/notes/inactive.md"
    ]);
    snapshot = { mtimeMs: 2, size: 12 };
    await watchCallbacks.get("C:/notes/inactive.md")?.("change");

    await vi.waitFor(() =>
      expect(sender.send).toHaveBeenCalledWith(
        EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
        { path: "C:/notes/inactive.md", kind: "modified" }
      )
    );
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("emits a deleted event when a watched file disappears", async () => {
    const watchCallbacks = new Map<string, WatchListener>();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(stats(1, 10))
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "ENOENT" }));
    const registry = createFileWatchRegistry({
      watch: vi.fn((targetPath: string, listener: WatchListener) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });
    const sender = createTarget();

    await registry.syncWindowPaths(sender, ["C:/notes/today.md"]);
    await watchCallbacks.get("C:/notes/today.md")?.("change");

    await vi.waitFor(() =>
      expect(sender.send).toHaveBeenCalledWith(
        EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
        { path: "C:/notes/today.md", kind: "deleted" }
      )
    );
  });

  it("shares one watcher across windows watching the same path", async () => {
    const watchCallbacks = new Map<string, WatchListener>();
    let snapshot = { mtimeMs: 1, size: 10 };
    const stat = vi.fn(async () => ({ ...snapshot }) as Stats);
    const watch = vi.fn((targetPath: string, listener: WatchListener) => {
      watchCallbacks.set(targetPath, listener);
      return { close: vi.fn() };
    });
    const registry = createFileWatchRegistry({ watch, stat });
    const first = createTarget(1);
    const second = createTarget(2);

    await registry.syncWindowPaths(first, ["C:/notes/shared.md"]);
    await registry.syncWindowPaths(second, ["C:/notes/shared.md"]);
    expect(watch).toHaveBeenCalledTimes(1);

    snapshot = { mtimeMs: 2, size: 12 };
    await watchCallbacks.get("C:/notes/shared.md")?.("change");

    await vi.waitFor(() => {
      expect(first.send).toHaveBeenCalledWith(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
        path: "C:/notes/shared.md",
        kind: "modified"
      });
      expect(second.send).toHaveBeenCalledWith(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
        path: "C:/notes/shared.md",
        kind: "modified"
      });
    });
  });

  it("suppresses watch callbacks during the app's own write, then resumes delivery", async () => {
    const watchCallbacks = new Map<string, WatchListener>();
    let snapshot = { mtimeMs: 1, size: 10 };
    const stat = vi.fn(async () => ({ ...snapshot }) as Stats);
    const registry = createFileWatchRegistry({
      watch: vi.fn((targetPath: string, listener: WatchListener) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });
    const sender = createTarget();

    await registry.syncWindowPaths(sender, ["C:/notes/a.md"]);
    await registry.beginInternalWrite(sender, "C:/notes/a.md");
    snapshot = { mtimeMs: 2, size: 20 };
    await watchCallbacks.get("C:/notes/a.md")?.("change");
    await registry.completeInternalWrite(sender, "C:/notes/a.md");
    expect(sender.send).not.toHaveBeenCalled();

    snapshot = { mtimeMs: 3, size: 30 };
    await watchCallbacks.get("C:/notes/a.md")?.("change");
    await vi.waitFor(() =>
      expect(sender.send).toHaveBeenCalledWith(
        EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
        { path: "C:/notes/a.md", kind: "modified" }
      )
    );
  });

  it("closes a watcher once its last subscriber is destroyed", async () => {
    let destroyed!: () => void;
    const sender = createTarget();
    sender.once = vi.fn((_event, listener: () => void) => {
      destroyed = listener;
    });
    const close = vi.fn();
    const watch = vi.fn(() => ({ close }));
    const registry = createFileWatchRegistry({
      watch,
      stat: vi.fn(async () => stats(1, 10))
    });

    await registry.syncWindowPaths(sender, ["C:/notes/a.md"]);
    expect(destroyed).toBeTypeOf("function");
    destroyed();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the watcher for a path a window stops subscribing to", async () => {
    const closed: string[] = [];
    const watch = vi.fn((targetPath: string) => ({
      close: () => closed.push(targetPath)
    }));
    const registry = createFileWatchRegistry({
      watch,
      stat: vi.fn(async () => stats(1, 10))
    });
    const sender = createTarget();

    await registry.syncWindowPaths(sender, ["C:/notes/a.md", "C:/notes/b.md"]);
    await registry.syncWindowPaths(sender, ["C:/notes/a.md"]);

    expect(closed).toEqual(["C:/notes/b.md"]);
  });

  it("normalizes paths and skips null and empty entries", async () => {
    const watched: string[] = [];
    const registry = createFileWatchRegistry({
      platform: "win32",
      watch: vi.fn((targetPath: string) => {
        watched.push(targetPath);
        return { close: vi.fn() };
      }),
      stat: vi.fn(async () => stats(1, 10))
    });
    const sender = createTarget();

    await registry.syncWindowPaths(sender, ["C:\\notes\\a.md", null, ""]);

    expect(watched).toEqual(["C:/notes/a.md"]);
  });

  it("propagates a baseline stat failure and leaves no entry behind", async () => {
    const failure = new Error("stat failed");
    const watch = vi.fn(() => ({ close: vi.fn() }));
    const registry = createFileWatchRegistry({
      watch,
      stat: vi.fn(async () => {
        throw failure;
      })
    });
    const sender = createTarget();

    await expect(
      registry.syncWindowPaths(sender, ["C:/notes/a.md"])
    ).rejects.toBe(failure);
    expect(watch).not.toHaveBeenCalled();

    await registry.syncWindowPaths(sender, ["C:/notes/a.md"]).catch(() => undefined);
    expect(watch).not.toHaveBeenCalled();
  });
});

it.each([
  ["win32", "\\\\server\\share\\中文 空格.md", "//server/share/中文 空格.md"],
  ["linux", "/notes/a\\b.md", "/notes/a\\b.md"],
  ["darwin", "/Notes/Case.MD", "/Notes/Case.MD"]
] as const)("preserves %s watcher path semantics", async (platform, input, expected) => {
  const watch = vi.fn(() => ({ close: vi.fn() }));
  const registry = createFileWatchRegistry({ platform, watch, stat: async () => stats(1, 2) });
  await registry.syncWindowPaths(createTarget(), [input]);
  expect(watch).toHaveBeenCalledWith(expected, expect.any(Function));
});
