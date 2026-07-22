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

type FSWatcherLike = {
  close: () => void;
};

type WatchDependencies = {
  watch: (
    targetPath: string,
    listener: (eventType: ExternalWatchEventType) => void
  ) => FSWatcherLike;
  stat: (targetPath: string) => Promise<Stats>;
  reportCleanupError?: (error: unknown) => void;
};

type InternalWrite = {
  readonly token: number;
  readonly entryIdentity: number;
  readonly path: string;
  completionObservationToken: number | null;
};

type WatchEntry = {
  readonly identity: number;
  readonly pathEpoch: number;
  readonly path: string;
  watcher: FSWatcherLike | null;
  baseline: FileSnapshot | null;
  internalWrite: InternalWrite | null;
};

type PendingSync = {
  readonly token: number;
  readonly pathEpoch: number;
  readonly path: string | null;
  readonly observationToken: number | null;
  readonly admission: Promise<void>;
  settleAdmission: () => void;
};

type WatchController = {
  readonly webContents: WatchedWebContents;
  desiredPath: string | null;
  pathEpoch: number;
  latestSyncToken: number;
  pendingSync: PendingSync | null;
  entry: WatchEntry | null;
  latestObservationToken: number;
  nextEntryIdentity: number;
  nextInternalWriteToken: number;
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
      tombstoneController(existing);
    }

    const controller: WatchController = {
      webContents,
      desiredPath: null,
      pathEpoch: 0,
      latestSyncToken: 0,
      pendingSync: null,
      entry: null,
      latestObservationToken: 0,
      nextEntryIdentity: 0,
      nextInternalWriteToken: 0,
      destroyed: false
    };
    controllers.set(webContents.id, controller);
    webContents.once?.("destroyed", () => {
      destroyedWebContents.add(webContents);
      if (controllers.get(webContents.id) === controller) {
        tombstoneController(controller);
      }
    });
    return controller;
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
      controller.pathEpoch += 1;
    }

    const currentEntry = controller.entry;
    const isOwnWriteObservation =
      currentEntry !== null &&
      isCurrentEntry(controller, currentEntry) &&
      currentEntry.path === normalizedPath &&
      currentEntry.internalWrite !== null;
    const observationToken = isOwnWriteObservation
      ? null
      : issueObservation(controller);
    const pending = createPendingSync(
      ++controller.latestSyncToken,
      controller.pathEpoch,
      normalizedPath,
      observationToken
    );
    controller.pendingSync?.settleAdmission();
    controller.pendingSync = pending;

    return performSync(controller, pending).finally(() => {
      if (controller.pendingSync === pending) {
        controller.pendingSync = null;
      }
      pending.settleAdmission();
    });
  }

  async function performSync(
    controller: WatchController,
    pending: PendingSync
  ): Promise<void> {
    if (pending.path === null) {
      if (isCommittableSync(controller, pending)) {
        const oldEntry = controller.entry;
        controller.entry = null;
        closeEntrySafely(oldEntry);
      }
      return;
    }

    let baseline: FileSnapshot | null;
    try {
      baseline = await readSnapshot(pending.path, dependencies.stat);
    } catch (error) {
      rollbackFailedCurrentSync(controller, pending);
      throw error;
    }

    if (pending.observationToken === null || !isCommittableSync(controller, pending)) {
      return;
    }

    const currentEntry = controller.entry;
    if (
      currentEntry?.path === pending.path &&
      currentEntry.pathEpoch === pending.pathEpoch
    ) {
      currentEntry.baseline = baseline;
      return;
    }

    const nextEntry: WatchEntry = {
      identity: ++controller.nextEntryIdentity,
      pathEpoch: pending.pathEpoch,
      path: pending.path,
      watcher: null,
      baseline,
      internalWrite: null
    };
    let watcher: FSWatcherLike;
    try {
      watcher = dependencies.watch(pending.path, () => {
        const handled = handleWatchEvent(controller, nextEntry).catch(
          () => undefined
        );
        void handled;
        return handled;
      });
    } catch (error) {
      rollbackFailedCurrentSync(controller, pending);
      throw error;
    }

    if (!isCommittableSync(controller, pending)) {
      closeWatcherSafely(watcher);
      return;
    }

    nextEntry.watcher = watcher;
    controller.entry = nextEntry;
    closeEntrySafely(currentEntry);
  }

  async function beginInternalWrite(
    webContents: WatchedWebContents,
    targetPath: string
  ): Promise<void> {
    const controller = getController(webContents);
    if (!controller) {
      return;
    }

    while (isLiveController(controller)) {
      const pending = controller.pendingSync;
      if (pending === null) {
        break;
      }
      await pending.admission;
    }
    if (!isLiveController(controller)) {
      return;
    }

    const entry = controller.entry;
    if (!entry || !isCurrentEntry(controller, entry) || entry.path !== targetPath) {
      return;
    }
    issueObservation(controller);
    entry.internalWrite = {
      token: ++controller.nextInternalWriteToken,
      entryIdentity: entry.identity,
      path: targetPath,
      completionObservationToken: null
    };
  }

  async function completeInternalWrite(
    webContents: WatchedWebContents,
    targetPath: string
  ): Promise<void> {
    const controller = getController(webContents);
    if (!controller) {
      return;
    }
    const entry = controller.entry;
    const write = entry?.internalWrite;
    if (
      !entry ||
      !write ||
      !isCurrentEntry(controller, entry) ||
      entry.path !== targetPath ||
      write.path !== targetPath ||
      write.entryIdentity !== entry.identity
    ) {
      return;
    }

    const observationToken = issueObservation(controller);
    write.completionObservationToken = observationToken;
    try {
      const currentSnapshot = await readSnapshot(targetPath, dependencies.stat);
      if (
        isCurrentEntry(controller, entry) &&
        entry.internalWrite === write &&
        write.completionObservationToken === observationToken &&
        controller.latestObservationToken === observationToken
      ) {
        entry.baseline = currentSnapshot;
      }
    } finally {
      if (
        controller.entry === entry &&
        entry.internalWrite === write &&
        write.completionObservationToken === observationToken
      ) {
        entry.internalWrite = null;
      }
    }
  }

  async function handleWatchEvent(
    controller: WatchController,
    entry: WatchEntry
  ): Promise<void> {
    if (!isCurrentEntry(controller, entry)) {
      return;
    }

    const writeAtStart = entry.internalWrite;
    const observationToken = writeAtStart === null
      ? issueObservation(controller)
      : null;
    const nextSnapshot = await readSnapshot(entry.path, dependencies.stat);

    if (observationToken === null) {
      return;
    }
    if (
      !isCurrentEntry(controller, entry) ||
      entry.internalWrite !== null ||
      controller.latestObservationToken !== observationToken ||
      snapshotsEqual(entry.baseline, nextSnapshot)
    ) {
      return;
    }
    entry.baseline = nextSnapshot;
    sendExternalChange(controller.webContents, entry.path, nextSnapshot);
  }

  function issueObservation(controller: WatchController): number {
    controller.latestObservationToken += 1;
    return controller.latestObservationToken;
  }

  function isLiveController(controller: WatchController): boolean {
    return (
      !controller.destroyed &&
      controllers.get(controller.webContents.id) === controller
    );
  }

  function isCurrentPathIntent(
    controller: WatchController,
    pathEpoch: number,
    targetPath: string | null
  ): boolean {
    return (
      isLiveController(controller) &&
      controller.pathEpoch === pathEpoch &&
      controller.desiredPath === targetPath
    );
  }

  function isCurrentSync(controller: WatchController, pending: PendingSync): boolean {
    return (
      isCurrentPathIntent(controller, pending.pathEpoch, pending.path) &&
      controller.latestSyncToken === pending.token
    );
  }

  function isCommittableSync(
    controller: WatchController,
    pending: PendingSync
  ): boolean {
    return (
      isCurrentSync(controller, pending) &&
      pending.observationToken !== null &&
      controller.latestObservationToken === pending.observationToken
    );
  }

  function isCurrentEntry(
    controller: WatchController,
    entry: WatchEntry
  ): boolean {
    return (
      isCurrentPathIntent(controller, entry.pathEpoch, entry.path) &&
      controller.entry === entry
    );
  }

  function rollbackFailedCurrentSync(
    controller: WatchController,
    pending: PendingSync
  ): void {
    if (!isCurrentSync(controller, pending)) {
      return;
    }
    const entry = controller.entry;
    if (entry && !isCurrentEntry(controller, entry)) {
      controller.entry = null;
      closeEntrySafely(entry);
    }
  }

  function tombstoneController(controller: WatchController): void {
    if (controller.destroyed) {
      return;
    }
    controller.destroyed = true;
    controller.pathEpoch += 1;
    controller.latestSyncToken += 1;
    controller.latestObservationToken += 1;
    controller.desiredPath = null;
    const pending = controller.pendingSync;
    controller.pendingSync = null;
    pending?.settleAdmission();
    const entry = controller.entry;
    controller.entry = null;
    if (controllers.get(controller.webContents.id) === controller) {
      controllers.delete(controller.webContents.id);
    }
    closeEntrySafely(entry);
  }

  function closeEntrySafely(entry: WatchEntry | null): void {
    if (!entry) {
      return;
    }
    const watcher = entry.watcher;
    entry.watcher = null;
    entry.internalWrite = null;
    closeWatcherSafely(watcher);
  }

  function closeWatcherSafely(watcher: FSWatcherLike | null): void {
    if (!watcher) {
      return;
    }
    try {
      watcher.close();
    } catch (error) {
      try {
        dependencies.reportCleanupError?.(error);
      } catch {
        // Cleanup reporting cannot corrupt authoritative watcher state.
      }
    }
  }

  return {
    syncDocumentPath,
    beginInternalWrite,
    completeInternalWrite
  };
}

function createPendingSync(
  token: number,
  pathEpoch: number,
  path: string | null,
  observationToken: number | null
): PendingSync {
  let settleAdmission!: () => void;
  const admission = new Promise<void>((resolve) => {
    let settled = false;
    settleAdmission = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
  });
  return {
    token,
    pathEpoch,
    path,
    observationToken,
    admission,
    settleAdmission
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
