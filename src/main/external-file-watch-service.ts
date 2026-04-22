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
  watch: (targetPath: string, listener: (eventType: ExternalWatchEventType) => void) => FSWatcherLike;
  stat: (targetPath: string) => Promise<Stats>;
};

type FSWatcherLike = {
  close: () => void;
};

type WatchEntry = {
  path: string | null;
  watcher: FSWatcherLike | null;
  baseline: FileSnapshot | null;
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
  syncDocumentPath: (webContents: WatchedWebContents, targetPath: string | null) => Promise<void>;
} {
  const entries = new Map<number, WatchEntry>();

  async function syncDocumentPath(
    webContents: WatchedWebContents,
    targetPath: string | null
  ): Promise<void> {
    const currentEntry = entries.get(webContents.id) ?? {
      path: null,
      watcher: null,
      baseline: null
    };

    if (!entries.has(webContents.id) && webContents.once) {
      webContents.once("destroyed", () => {
        closeEntry(entries.get(webContents.id) ?? null);
        entries.delete(webContents.id);
      });
    }

    if (!targetPath) {
      closeEntry(currentEntry);
      entries.set(webContents.id, {
        path: null,
        watcher: null,
        baseline: null
      });
      return;
    }

    const baseline = await readSnapshot(targetPath, dependencies.stat);

    if (currentEntry.path !== targetPath) {
      closeEntry(currentEntry);
      currentEntry.watcher = dependencies.watch(targetPath, async () => {
        await handleWatchEvent(webContents, targetPath);
      });
    }

    currentEntry.path = targetPath;
    currentEntry.baseline = baseline;
    entries.set(webContents.id, currentEntry);
  }

  async function handleWatchEvent(
    webContents: WatchedWebContents,
    expectedPath: string
  ): Promise<void> {
    const entry = entries.get(webContents.id);

    if (!entry || entry.path !== expectedPath) {
      return;
    }

    const nextSnapshot = await readSnapshot(expectedPath, dependencies.stat);

    if (snapshotsEqual(entry.baseline, nextSnapshot)) {
      return;
    }

    entry.baseline = nextSnapshot;
    webContents.send(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
      path: expectedPath,
      kind: nextSnapshot === null ? "deleted" : "modified"
    });
  }

  return {
    syncDocumentPath
  };
}

async function readSnapshot(
  targetPath: string,
  stat: (targetPath: string) => Promise<Stats>
): Promise<FileSnapshot | null> {
  try {
    const snapshot = await stat(targetPath);
    return {
      mtimeMs: snapshot.mtimeMs,
      size: snapshot.size
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function closeEntry(entry: WatchEntry | null): void {
  entry?.watcher?.close();
  if (entry) {
    entry.watcher = null;
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
