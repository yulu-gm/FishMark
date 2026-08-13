import type {
  DiskVersion,
  FileIdentity,
  WorkspaceSessionSnapshot,
  WorkspaceSnapshot
} from "@fishmark/workspace-domain";

// Serialization/deserialization boundary for recovery state. The domain `WorkspaceSnapshot`
// is already plain JSON data, but disk content is untrusted, so loading parses and validates
// every field instead of casting, so semantically-invalid-but-parseable files are quarantined
// rather than replayed into a live workspace.
export type RecoveryEditBatchEntry = {
  readonly kind: "edit-batch";
  readonly tabId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseRevision: number;
  readonly changes: readonly {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[];
};

export function parseWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.windows) || !Array.isArray(value.sessions)) return null;
  if (value.lastFocusedWindowId !== null && typeof value.lastFocusedWindowId !== "string") {
    return null;
  }
  if (!isNonNegativeInteger(value.nextTabId)) return null;

  const windows: {
    windowId: string;
    tabIds: string[];
    activeTabId: string | null;
  }[] = [];
  for (const window of value.windows) {
    if (!isRecord(window)) return null;
    if (typeof window.windowId !== "string" || window.windowId.length === 0) return null;
    if (!Array.isArray(window.tabIds)) return null;
    for (const tabId of window.tabIds) {
      if (typeof tabId !== "string" || tabId.length === 0) return null;
    }
    if (window.activeTabId !== null && typeof window.activeTabId !== "string") return null;
    windows.push({
      windowId: window.windowId,
      tabIds: window.tabIds as string[],
      activeTabId: window.activeTabId as string | null
    });
  }

  const sessions: WorkspaceSessionSnapshot[] = [];
  for (const session of value.sessions) {
    if (!isRecord(session)) return null;
    if (typeof session.tabId !== "string" || session.tabId.length === 0) return null;
    if (typeof session.windowId !== "string" || session.windowId.length === 0) return null;
    if (!isFileIdentity(session.fileIdentity)) return null;
    if (session.path !== null && typeof session.path !== "string") return null;
    if (typeof session.name !== "string") return null;
    if (typeof session.content !== "string") return null;
    if (typeof session.savedContent !== "string") return null;
    if (session.encoding !== "utf-8") return null;
    if (!isNonNegativeInteger(session.revision)) return null;
    if (!isNonNegativeInteger(session.savedRevision)) return null;
    if (!isSaveState(session.saveState)) return null;
    if (!isDiskVersion(session.diskVersion)) return null;
    sessions.push({
      tabId: session.tabId,
      windowId: session.windowId,
      fileIdentity: session.fileIdentity,
      path: session.path,
      name: session.name,
      content: session.content,
      savedContent: session.savedContent,
      encoding: session.encoding,
      revision: session.revision,
      savedRevision: session.savedRevision,
      saveState: session.saveState,
      diskVersion: session.diskVersion
    });
  }

  return {
    windows,
    sessions,
    lastFocusedWindowId: value.lastFocusedWindowId as string | null,
    nextTabId: value.nextTabId
  };
}

export function parseEditBatchEntry(value: unknown): RecoveryEditBatchEntry | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "edit-batch") return null;
  if (typeof value.tabId !== "string" || value.tabId.length === 0) return null;
  if (typeof value.clientId !== "string" || value.clientId.length === 0) return null;
  if (!isNonNegativeInteger(value.clientSequence)) return null;
  if (!isNonNegativeInteger(value.baseRevision)) return null;
  if (!Array.isArray(value.changes)) return null;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const change of value.changes) {
    if (!isRecord(change)) return null;
    if (!isNonNegativeInteger(change.from)) return null;
    if (!isNonNegativeInteger(change.to)) return null;
    if (typeof change.insert !== "string") return null;
    changes.push({ from: change.from, to: change.to, insert: change.insert });
  }
  return {
    kind: "edit-batch",
    tabId: value.tabId,
    clientId: value.clientId,
    clientSequence: value.clientSequence,
    baseRevision: value.baseRevision,
    changes
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFileIdentity(value: unknown): value is FileIdentity {
  return (
    isRecord(value) &&
    typeof value.location === "string" &&
    value.location.length > 0 &&
    typeof value.object === "string" &&
    value.object.length > 0
  );
}

function isSaveState(value: unknown): value is WorkspaceSessionSnapshot["saveState"] {
  return value === "idle" || value === "manual-saving" || value === "autosaving";
}

function isDiskVersion(value: unknown): value is DiskVersion | null {
  if (value === null) return true;
  return (
    isRecord(value) &&
    typeof value.normalizedPath === "string" &&
    isNonNegativeInteger(value.mtimeMs) &&
    isNonNegativeInteger(value.size) &&
    typeof value.contentHash === "string" &&
    value.contentHash.length > 0
  );
}
