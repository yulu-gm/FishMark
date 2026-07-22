import { watch as defaultWatch, type Stats } from "node:fs";
import { stat as defaultStat } from "node:fs/promises";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../shared/external-file-change";

type ExternalWatchEventType = "change" | "rename";

type WatchedWebContents = {
  id: number;
  send: (channel: string, payload: unknown) => void;
  once?: (event: "destroyed", listener: () => void) => void;
};

type FileSnapshot = {
  mtimeMs: number;
  size: number;
};

type WatchDependencies = {
  watch: (
    targetPath: string,
    listener: (eventType: ExternalWatchEventType) => void
  ) => FSWatcherLike;
  stat: (targetPath: string) => Promise<Stats>;
};

type FSWatcherLike = {
  close: () => void;
};

type WatchEntry = {
  readonly generation: number;
  readonly path: string;
  watcher: FSWatcherLike | null;
  baseline: FileSnapshot | null;
  internalWritePath: string | null;
  deferredSnapshot: FileSnapshot | null | undefined;
};

type WatchController = {
  readonly webContents: WatchedWebContents;
  generation: number;
  desiredPath: string | null;
  entry: WatchEntry | null;
  queue: Promise<void>;
  destroyed: boolean;
};

const defaultDependencies: WatchDependencies = {
  watch: (targetPath, listener) =>
    defaultWatch(targetPath, (eventType) =>
      listener(eventType === "rename" ? "rename" : "change")
    ),
  stat: (targetPath) => defaultStat(targetPath)
};

export function createExternalFileWatchService(
  dependencies: WatchDependencies = defaultDependencies
): {
  syncDocumentPath: (
    webContents: WatchedWebContents,
    targetPath: string | null
  ) => Promise<void>;
  beginInternalWrite: (
    webContents: WatchedWebContents,
    targetPath: string
  ) => Promise<void>;
  completeInternalWrite: (
    webContents: WatchedWebContents,
    targetPath: string
  ) => Promise<void>;
} {
  const controllers = new Map<number, WatchController>();
  const destroyedWebContents = new WeakSet<WatchedWebContents>();

  function getController(webContents: WatchedWebContents): WatchController | null {
    if (destroyedWebContents.has(webContents)) {
      return null;
    }

    const existing = controllers.get(webContents.id);
    if (existing?.webContents === webContents && !existing.destroyed) {
      return existing;
    }
    if (existing) {
      destroyedWebContents.add(existing.webContents);
      destroyController(existing);
    }

    const controller: WatchController = {
      webContents,
      generation: 0,
      desiredPath: null,
      entry: null,
      queue: Promise.resolve(),
      destroyed: false
    };
    controllers.set(webContents.id, controller);
    webContents.once?.("destroyed", () => {
      destroyedWebContents.add(webContents);
      if (controllers.get(webContents.id) === controller) {
        destroyController(controller);
        controllers.delete(webContents.id);
      }
    });
    return controller;
  }

  function enqueue(
    controller: WatchController,
    operation: () => Promise<void> | void
  ): Promise<void> {
    const queued = controller.queue
      .catch(() => undefined)
      .then(async () => {
        if (isLiveController(controller)) {
          await operation();
        }
      });
    controller.queue = queued;
    return queued;
  }

  function syncDocumentPath(
    webContents: WatchedWebContents,
    targetPath: string | null
  ): Promise<void> {
    const controller = getController(webContents);
    if (!controller) {
      return Promise.resolve();
    }

    const normalizedPath = targetPath && targetPath.length > 0 ? targetPath : null;
    if (controller.desiredPath !== normalizedPath) {
      controller.desiredPath = normalizedPath;
      controller.generation += 1;
    }
    const generation = controller.generation;

    return enqueue(controller, async () => {
      if (!isCurrentIntent(controller, generation, normalizedPath)) {
        return;
      }
      if (normalizedPath === null) {
        closeEntry(controller.entry);
        controller.entry = null;
        return;
      }

      const baseline = await readSnapshot(normalizedPath, dependencies.stat);
      if (!isCurrentIntent(controller, generation, normalizedPath)) {
        return;
      }

      const currentEntry = controller.entry;
      if (
        currentEntry?.path === normalizedPath &&
        currentEntry.generation === generation
      ) {
        currentEntry.baseline = baseline;
        return;
      }

      const nextEntry: WatchEntry = {
        generation,
        path: normalizedPath,
        watcher: null,
        baseline,
        internalWritePath: null,
        deferredSnapshot: undefined
      };
      const watcher = dependencies.watch(normalizedPath, () => {
        const callback = enqueue(controller, () =>
          handleWatchEvent(controller, nextEntry)
        );
        const handledCallback = callback.catch(() => undefined);
        void handledCallback;
        return handledCallback;
      });
      if (!isCurrentIntent(controller, generation, normalizedPath)) {
        watcher.close();
        return;
      }
      nextEntry.watcher = watcher;
      closeEntry(currentEntry);
      controller.entry = nextEntry;
    });
  }

  function beginInternalWrite(
    webContents: WatchedWebContents,
    targetPath: string
  ): Promise<void> {
    const controller = getController(webContents);
    if (!controller) {
      return Promise.resolve();
    }
    return enqueue(controller, () => {
      const entry = controller.entry;
      if (!entry || !isCurrentEntry(controller, entry) || entry.path !== targetPath) {
        return;
      }
      entry.internalWritePath = targetPath;
      entry.deferredSnapshot = undefined;
    });
  }

  function completeInternalWrite(
    webContents: WatchedWebContents,
    targetPath: string
  ): Promise<void> {
    const controller = getController(webContents);
    if (!controller) {
      return Promise.resolve();
    }
    return enqueue(controller, async () => {
      const entry = controller.entry;
      if (
        !entry ||
        !isCurrentEntry(controller, entry) ||
        entry.path !== targetPath ||
        entry.internalWritePath !== targetPath
      ) {
        return;
      }

      try {
        const currentSnapshot = await readSnapshot(targetPath, dependencies.stat);
        if (!isCurrentEntry(controller, entry)) {
          return;
        }
        const deferredSnapshot = entry.deferredSnapshot;
        entry.baseline = currentSnapshot;
        if (
          deferredSnapshot !== undefined &&
          !snapshotsEqual(deferredSnapshot, currentSnapshot)
        ) {
          sendExternalChange(controller.webContents, targetPath, currentSnapshot);
        }
      } finally {
        if (isCurrentEntry(controller, entry)) {
          entry.internalWritePath = null;
          entry.deferredSnapshot = undefined;
        }
      }
    });
  }

  async function handleWatchEvent(
    controller: WatchController,
    entry: WatchEntry
  ): Promise<void> {
    if (!isCurrentEntry(controller, entry)) {
      return;
    }
    const nextSnapshot = await readSnapshot(entry.path, dependencies.stat);
    if (!isCurrentEntry(controller, entry)) {
      return;
    }
    if (entry.internalWritePath === entry.path) {
      entry.deferredSnapshot = nextSnapshot;
      return;
    }
    if (snapshotsEqual(entry.baseline, nextSnapshot)) {
      return;
    }
    entry.baseline = nextSnapshot;
    sendExternalChange(controller.webContents, entry.path, nextSnapshot);
  }

  function isLiveController(controller: WatchController): boolean {
    return (
      !controller.destroyed &&
      controllers.get(controller.webContents.id) === controller
    );
  }

  function isCurrentIntent(
    controller: WatchController,
    generation: number,
    targetPath: string | null
  ): boolean {
    return (
      isLiveController(controller) &&
      controller.generation === generation &&
      controller.desiredPath === targetPath
    );
  }

  function isCurrentEntry(
    controller: WatchController,
    entry: WatchEntry
  ): boolean {
    return (
      isCurrentIntent(controller, entry.generation, entry.path) &&
      controller.entry === entry
    );
  }

  function destroyController(controller: WatchController): void {
    controller.destroyed = true;
    controller.generation += 1;
    controller.desiredPath = null;
    closeEntry(controller.entry);
    controller.entry = null;
  }

  return {
    syncDocumentPath,
    beginInternalWrite,
    completeInternalWrite
  };
}

async function readSnapshot(
  targetPath: string,
  stat: (targetPath: string) => Promise<Stats>
): Promise<FileSnapshot | null> {
  try {
    const snapshot = await stat(targetPath);
    return { mtimeMs: snapshot.mtimeMs, size: snapshot.size };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function sendExternalChange(
  webContents: WatchedWebContents,
  targetPath: string,
  snapshot: FileSnapshot | null
): void {
  webContents.send(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
    path: targetPath,
    kind: snapshot === null ? "deleted" : "modified"
  });
}

function closeEntry(entry: WatchEntry | null): void {
  entry?.watcher?.close();
  if (entry) {
    entry.watcher = null;
    entry.internalWritePath = null;
    entry.deferredSnapshot = undefined;
  }
}

function snapshotsEqual(left: FileSnapshot | null, right: FileSnapshot | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
