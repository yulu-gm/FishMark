import type { Stats } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../shared/external-file-change";
import { createExternalFileWatchService } from "./external-file-watch-service";

type WatchCallback = (eventType: "change" | "rename") => void | Promise<void>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStats(input: { mtimeMs: number; size: number }): Stats {
  return {
    mtimeMs: input.mtimeMs,
    size: input.size
  } as Stats;
}

describe("createExternalFileWatchService", () => {
  it("emits a modified event when the watched file snapshot changes", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const close = vi.fn();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockResolvedValueOnce(createStats({ mtimeMs: 2, size: 12 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close } as { close: () => void };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/today.md");
    await watchCallbacks.get("C:/notes/today.md")?.("change");

    expect(webContents.send).toHaveBeenCalledWith(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
      path: "C:/notes/today.md",
      kind: "modified"
    });
  });

  it("emits a deleted event when the watched file disappears", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() } as { close: () => void };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/today.md");
    await watchCallbacks.get("C:/notes/today.md")?.("rename");

    expect(webContents.send).toHaveBeenCalledWith(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
      path: "C:/notes/today.md",
      kind: "deleted"
    });
  });

  it("closes the previous watcher when the current document path changes", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValue(createStats({ mtimeMs: 1, size: 10 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: targetPath === "C:/notes/first.md" ? firstClose : secondClose } as {
          close: () => void;
        };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/first.md");
    await service.syncDocumentPath(webContents, "C:/notes/second.md");

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).not.toHaveBeenCalled();
  });

  it("suppresses watch callbacks triggered by the app's own save for the active file", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockResolvedValueOnce(createStats({ mtimeMs: 2, size: 18 }))
      .mockResolvedValueOnce(createStats({ mtimeMs: 2, size: 18 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() } as { close: () => void };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/today.md");
    await service.beginInternalWrite(webContents, "C:/notes/today.md");
    await watchCallbacks.get("C:/notes/today.md")?.("change");
    await service.completeInternalWrite(webContents, "C:/notes/today.md");

    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("invalidates a deferred callback before a newer path sync can install its watcher", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    let callbackCompletion = Promise.resolve();
    const callbackSnapshot = createDeferred<Stats>();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockReturnValueOnce(callbackSnapshot.promise)
      .mockResolvedValueOnce(createStats({ mtimeMs: 10, size: 20 }));
    const webContents = createWebContents();
    const watch = vi.fn((targetPath: string, listener: WatchCallback) => {
      watchCallbacks.set(targetPath, (eventType) => {
        callbackCompletion = Promise.resolve(listener(eventType));
        return callbackCompletion;
      });
      return { close: vi.fn() };
    });
    const service = createExternalFileWatchService({ watch, stat });

    await service.syncDocumentPath(webContents, "C:/notes/a.md");
    watchCallbacks.get("C:/notes/a.md")?.("change");
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(2));
    const syncB = service.syncDocumentPath(webContents, "C:/notes/b.md");
    await Promise.resolve();

    expect(watch).toHaveBeenCalledTimes(1);
    callbackSnapshot.resolve(createStats({ mtimeMs: 2, size: 11 }));
    await syncB;
    await callbackCompletion;

    expect(webContents.send).not.toHaveBeenCalled();
    expect(watch).toHaveBeenLastCalledWith("C:/notes/b.md", expect.any(Function));
  });

  it("does not let a deferred write completion mutate a newer path generation", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const completionSnapshot = createDeferred<Stats>();
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockReturnValueOnce(completionSnapshot.promise)
      .mockResolvedValueOnce(createStats({ mtimeMs: 10, size: 20 }))
      .mockResolvedValueOnce(createStats({ mtimeMs: 10, size: 20 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/a.md");
    await service.beginInternalWrite(webContents, "C:/notes/a.md");
    const completeA = service.completeInternalWrite(webContents, "C:/notes/a.md");
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(2));
    const syncB = service.syncDocumentPath(webContents, "C:/notes/b.md");
    await Promise.resolve();
    expect(stat).toHaveBeenCalledTimes(2);
    completionSnapshot.resolve(createStats({ mtimeMs: 2, size: 11 }));
    await Promise.all([completeA, syncB]);

    watchCallbacks.get("C:/notes/b.md")?.("change");
    await vi.waitFor(() => expect(stat).toHaveBeenCalledTimes(4));
    await Promise.resolve();
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("clears internal-write suppression after completion stat fails", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const completionError = new Error("stat failed");
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockRejectedValueOnce(completionError)
      .mockResolvedValueOnce(createStats({ mtimeMs: 2, size: 11 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/a.md");
    await service.beginInternalWrite(webContents, "C:/notes/a.md");
    await expect(
      service.completeInternalWrite(webContents, "C:/notes/a.md")
    ).rejects.toBe(completionError);
    watchCallbacks.get("C:/notes/a.md")?.("change");

    await vi.waitFor(() =>
      expect(webContents.send).toHaveBeenCalledWith(
        EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
        { path: "C:/notes/a.md", kind: "modified" }
      )
    );
  });

  it("does not install or retain a watcher when web contents is destroyed during sync", async () => {
    const baseline = createDeferred<Stats>();
    let destroyed!: () => void;
    const webContents = {
      id: 7,
      send: vi.fn<(channel: string, payload: unknown) => void>(),
      once: vi.fn((event: "destroyed", listener: () => void) => {
        expect(event).toBe("destroyed");
        destroyed = listener;
      })
    };
    const watch = vi.fn(() => ({ close: vi.fn() }));
    const service = createExternalFileWatchService({
      watch,
      stat: vi.fn(() => baseline.promise)
    });

    const sync = service.syncDocumentPath(webContents, "C:/notes/a.md");
    await vi.waitFor(() => expect(destroyed).toBeTypeOf("function"));
    destroyed();
    baseline.resolve(createStats({ mtimeMs: 1, size: 10 }));
    await sync;

    expect(watch).not.toHaveBeenCalled();
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("runs different web contents queues independently", async () => {
    const firstBaseline = createDeferred<Stats>();
    const stat = vi.fn((targetPath: string) =>
      targetPath.endsWith("first.md")
        ? firstBaseline.promise
        : Promise.resolve(createStats({ mtimeMs: 2, size: 20 }))
    );
    const watch = vi.fn(() => ({ close: vi.fn() }));
    const service = createExternalFileWatchService({ watch, stat });

    const firstSync = service.syncDocumentPath(
      createWebContents(1),
      "C:/notes/first.md"
    );
    await service.syncDocumentPath(createWebContents(2), "C:/notes/second.md");

    expect(watch).toHaveBeenCalledWith("C:/notes/second.md", expect.any(Function));
    firstBaseline.resolve(createStats({ mtimeMs: 1, size: 10 }));
    await firstSync;
  });

  it("contains callback stat failures and keeps the same web contents queue usable", async () => {
    const watchCallbacks = new Map<string, WatchCallback>();
    const callbackError = new Error("callback stat failed");
    const stat = vi
      .fn<(targetPath: string) => Promise<Stats>>()
      .mockResolvedValueOnce(createStats({ mtimeMs: 1, size: 10 }))
      .mockRejectedValueOnce(callbackError)
      .mockResolvedValueOnce(createStats({ mtimeMs: 2, size: 20 }));
    const webContents = createWebContents();
    const service = createExternalFileWatchService({
      watch: vi.fn((targetPath: string, listener: WatchCallback) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });

    await service.syncDocumentPath(webContents, "C:/notes/a.md");
    await watchCallbacks.get("C:/notes/a.md")?.("change");
    await expect(
      service.syncDocumentPath(webContents, "C:/notes/b.md")
    ).resolves.toBeUndefined();

    expect(webContents.send).not.toHaveBeenCalled();
    expect(stat).toHaveBeenCalledTimes(3);
  });
});

function createWebContents(id = 1): {
  id: number;
  send: ReturnType<typeof vi.fn<(channel: string, payload: unknown) => void>>;
  once: ReturnType<typeof vi.fn<(event: "destroyed", listener: () => void) => void>>;
} {
  return {
    id,
    send: vi.fn<(channel: string, payload: unknown) => void>(),
    once: vi.fn<(event: "destroyed", listener: () => void) => void>()
  };
}
