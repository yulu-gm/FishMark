import type { Stats } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../shared/external-file-change";
import { createExternalFileWatchService } from "./external-file-watch-service";

type WatchCallback = (eventType: "change" | "rename") => void;

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
});

function createWebContents(): {
  id: number;
  send: ReturnType<typeof vi.fn<(channel: string, payload: unknown) => void>>;
  once: ReturnType<typeof vi.fn<(event: "destroyed", listener: () => void) => void>>;
} {
  return {
    id: 1,
    send: vi.fn<(channel: string, payload: unknown) => void>(),
    once: vi.fn<(event: "destroyed", listener: () => void) => void>()
  };
}
