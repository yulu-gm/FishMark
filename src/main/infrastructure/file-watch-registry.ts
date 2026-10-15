import { watch as defaultWatch, type Stats } from "node:fs";
import { stat as defaultStat } from "node:fs/promises";

import { normalizeFilePath } from "../file-path";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../../shared/external-file-change";

type ExternalWatchEventType = "change" | "rename";

type WatchedTarget = {
  readonly id: number;
  send: (channel: string, payload: unknown) => void;
  once?: (event: "destroyed", listener: () => void) => void;
};

type FileSnapshot = {
  readonly mtimeMs: number;
  readonly size: number;
};

type FSWatcherLike = {
  close: () => void;
};

type WatchDependencies = {
  platform: NodeJS.Platform;
  watch: (
    targetPath: string,
    listener: (eventType: ExternalWatchEventType) => void
  ) => FSWatcherLike;
  stat: (targetPath: string) => Promise<Stats>;
  reportCleanupError?: (error: unknown) => void;
  onExternalChange?: (path: string, kind: "modified" | "deleted") => void;
};

type InternalWrite = {
  readonly token: number;
  readonly path: string;
  completionObservationToken: number | null;
};

// A document entry is keyed by its normalized path and shared by every subscribed target
// (window). One watcher observes the path; external changes are broadcast to every live
// subscriber, so an inactive tab in the same window stays covered.
type RegistryEntry = {
  readonly path: string;
  initialization: Promise<void>;
  watcher: FSWatcherLike | null;
  baseline: FileSnapshot | null;
  internalWrite: InternalWrite | null;
  subscribers: Set<WatchedTarget>;
};

const defaultDependencies: WatchDependencies = {
  platform: process.platform,
  watch: (targetPath, listener) =>
    defaultWatch(targetPath, (eventType) =>
      listener(eventType === "rename" ? "rename" : "change")
    ),
  stat: (targetPath) => defaultStat(targetPath)
};

export type FileWatchRegistry = {
  syncWindowPaths: (
    target: WatchedTarget,
    targetPaths: readonly (string | null)[]
  ) => Promise<void>;
  beginInternalWrite: (
    target: WatchedTarget,
    targetPath: string
  ) => Promise<void>;
  completeInternalWrite: (
    target: WatchedTarget,
    targetPath: string
  ) => Promise<void>;
};

export function createFileWatchRegistry(
  dependencies: Partial<WatchDependencies> = {}
): FileWatchRegistry {
  const resolved = { ...defaultDependencies, ...dependencies } as WatchDependencies;
  const entriesByPath = new Map<string, RegistryEntry>();
  const pathsByTarget = new Map<number, Set<string>>();
  const boundTargets = new WeakSet<WatchedTarget>();
  const destroyedTargets = new WeakSet<WatchedTarget>();
  let nextInternalWriteToken = 0;

  function normalizedPath(targetPath: string | null): string | null {
    if (targetPath === null || targetPath.length === 0) return null;
    const normalized = normalizeFilePath(targetPath, resolved.platform);
    return resolved.platform === "win32" ? normalized.replace(/\\/g, "/") : normalized;
  }

  function isLive(target: WatchedTarget): boolean {
    return !destroyedTargets.has(target);
  }

  function bindTargetLifecycle(target: WatchedTarget): void {
    if (target.once === undefined || destroyedTargets.has(target) || boundTargets.has(target)) return;
    boundTargets.add(target);
    target.once("destroyed", () => {
      destroyedTargets.add(target);
      const paths = pathsByTarget.get(target.id);
      pathsByTarget.delete(target.id);
      if (paths !== undefined) {
        for (const path of paths) {
          const entry = entriesByPath.get(path);
          if (entry !== undefined) {
            entry.subscribers.delete(target);
            if (entry.subscribers.size === 0) {
              entriesByPath.delete(path);
              closeEntrySafely(entry);
            }
          }
        }
      }
    });
  }

  async function syncWindowPaths(
    target: WatchedTarget,
    targetPaths: readonly (string | null)[]
  ): Promise<void> {
    if (!isLive(target)) return;
    bindTargetLifecycle(target);
    const desired = new Set<string>();
    for (const rawPath of targetPaths) {
      const path = normalizedPath(rawPath);
      if (path !== null) desired.add(path);
    }

    const previous = pathsByTarget.get(target.id) ?? new Set<string>();
    // Publish intent before asynchronous setup so destruction and newer syncs
    // can revoke even a subscriber whose initial stat has not returned yet.
    pathsByTarget.set(target.id, desired);
    // Unsubscribe paths the target no longer watches.
    for (const oldPath of previous) {
      if (desired.has(oldPath)) continue;
      const entry = entriesByPath.get(oldPath);
      if (entry !== undefined) {
        entry.subscribers.delete(target);
        if (entry.subscribers.size === 0) {
          entriesByPath.delete(oldPath);
          closeEntrySafely(entry);
        }
      }
    }
    // Subscribe to every newly desired path, sharing a watcher across targets.
    for (const path of desired) {
      if (!isLive(target) || pathsByTarget.get(target.id) !== desired) return;
      let entry = entriesByPath.get(path);
      if (entry === undefined) {
        entry = {
          path,
          initialization: Promise.resolve(),
          watcher: null,
          baseline: null,
          internalWrite: null,
          subscribers: new Set([target])
        };
        entriesByPath.set(path, entry);
        const initializing = entry;
        entry.initialization = Promise.resolve().then(() => initializeEntry(initializing));
      }
      entry.subscribers.add(target);
      if (entry.watcher === null) await entry.initialization;
    }
  }

  async function initializeEntry(entry: RegistryEntry): Promise<void> {
    try {
      if (entriesByPath.get(entry.path) !== entry || entry.subscribers.size === 0) return;
      const baseline = await readSnapshot(entry.path, resolved.stat);
      if (entriesByPath.get(entry.path) !== entry || entry.subscribers.size === 0) return;
      entry.baseline = baseline;
      entry.watcher = resolved.watch(entry.path, () => {
        void handleWatchEvent(entry).catch(() => undefined);
      });
      if (entriesByPath.get(entry.path) !== entry || entry.subscribers.size === 0) closeEntrySafely(entry);
    } catch (error) {
      // An obsolete setup must not erase a new entry for the same path.
      if (entriesByPath.get(entry.path) === entry) entriesByPath.delete(entry.path);
      closeEntrySafely(entry);
      throw error;
    }
  }

  async function initializedEntry(target: WatchedTarget, path: string): Promise<RegistryEntry | undefined> {
    const entry = entriesByPath.get(path);
    if (entry === undefined || !isLive(target) || !entry.subscribers.has(target)) return;
    await entry.initialization;
    if (entriesByPath.get(path) === entry && isLive(target) && entry.subscribers.has(target)) return entry;
  }

  async function beginInternalWrite(
    target: WatchedTarget,
    targetPath: string
  ): Promise<void> {
    const path = normalizedPath(targetPath);
    if (path === null) return;
    const entry = await initializedEntry(target, path);
    if (entry === undefined) return;
    entry.internalWrite = {
      token: ++nextInternalWriteToken,
      path,
      completionObservationToken: null
    };
  }

  async function completeInternalWrite(
    target: WatchedTarget,
    targetPath: string
  ): Promise<void> {
    const path = normalizedPath(targetPath);
    if (path === null) return;
    const entry = await initializedEntry(target, path);
    const write = entry?.internalWrite;
    if (entry === undefined || write === undefined || write === null) return;
    if (write.path !== path || !entry.subscribers.has(target)) return;
    try {
      const currentSnapshot = await readSnapshot(path, resolved.stat);
      if (entry.internalWrite === write) {
        entry.baseline = currentSnapshot;
      }
    } finally {
      if (entry.internalWrite === write) {
        entry.internalWrite = null;
      }
    }
  }

  async function handleWatchEvent(entry: RegistryEntry): Promise<void> {
    if (entry.watcher === null || entriesByPath.get(entry.path) !== entry) return;
    if (entry.internalWrite !== null) return;
    const nextSnapshot = await readSnapshot(entry.path, resolved.stat);
    if (entriesByPath.get(entry.path) !== entry) return;
    if (entry.internalWrite !== null) return;
    if (snapshotsEqual(entry.baseline, nextSnapshot)) return;
    entry.baseline = nextSnapshot;
    resolved.onExternalChange?.(
      entry.path,
      nextSnapshot === null ? "deleted" : "modified"
    );
    for (const subscriber of entry.subscribers) {
      if (!isLive(subscriber)) continue;
      sendExternalChange(subscriber, entry.path, nextSnapshot);
    }
  }

  function closeEntrySafely(entry: RegistryEntry): void {
    const watcher = entry.watcher;
    entry.watcher = null;
    entry.internalWrite = null;
    entry.subscribers.clear();
    if (!watcher) return;
    try {
      watcher.close();
    } catch (error) {
      try {
        resolved.reportCleanupError?.(error);
      } catch {
        // Cleanup reporting cannot corrupt authoritative registry state.
      }
    }
  }

  return {
    syncWindowPaths,
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
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function sendExternalChange(
  target: WatchedTarget,
  targetPath: string,
  snapshot: FileSnapshot | null
): void {
  target.send(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, {
    path: targetPath,
    kind: snapshot === null ? "deleted" : "modified"
  });
}

function snapshotsEqual(
  left: FileSnapshot | null,
  right: FileSnapshot | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
