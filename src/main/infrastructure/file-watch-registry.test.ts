import type { Stats } from "node:fs";

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
