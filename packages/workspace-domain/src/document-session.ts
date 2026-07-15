import {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision,
  type DocumentRevision
} from "./document-revision";
import type { DiskVersion } from "./disk-version";
import { createStringTextBuffer, type TextBuffer } from "./text-buffer";

export interface WorkspaceDocumentData {
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
  readonly encoding: "utf-8";
}

export type DocumentSaveState = "idle" | "manual-saving" | "autosaving";

export interface DocumentSessionState {
  readonly tabId: string;
  readonly windowId: string;
  readonly path: string | null;
  readonly name: string;
  readonly encoding: "utf-8";
  readonly text: TextBuffer;
  readonly savedText: TextBuffer;
  readonly revision: DocumentRevision;
  readonly savedRevision: DocumentRevision;
  readonly diskVersion: DiskVersion | null;
  readonly saveState: DocumentSaveState;
}

export interface DocumentSessionProjection {
  readonly tabId: string;
  readonly windowId: string;
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
  readonly encoding: "utf-8";
  readonly revision: DocumentRevision;
  readonly savedRevision: DocumentRevision;
  readonly isDirty: boolean;
  readonly saveState: DocumentSaveState;
  readonly diskVersion: DiskVersion | null;
}

export interface CreateDocumentSessionInput {
  readonly tabId: string;
  readonly windowId: string;
  readonly document: WorkspaceDocumentData;
  readonly diskVersion?: DiskVersion | null;
}

export interface CommitSavedDocumentInput {
  readonly capturedRevision: DocumentRevision;
  readonly document: WorkspaceDocumentData;
  readonly diskVersion: DiskVersion | null;
}

export function createDocumentSession({
  tabId,
  windowId,
  document,
  diskVersion = null
}: CreateDocumentSessionInput): DocumentSessionState {
  const text = createStringTextBuffer(document.content);

  return freezeSession({
    tabId,
    windowId,
    path: document.path,
    name: document.name,
    encoding: document.encoding,
    text,
    savedText: text,
    revision: INITIAL_DOCUMENT_REVISION,
    savedRevision: INITIAL_DOCUMENT_REVISION,
    diskVersion: copyDiskVersion(diskVersion),
    saveState: "idle"
  });
}

export function replaceDocumentText(
  session: DocumentSessionState,
  content: string
): DocumentSessionState {
  if (content === session.text.toString()) {
    return session;
  }

  const text = session.text.apply([
    { from: 0, to: session.text.length, insert: content }
  ]);
  const revision = nextDocumentRevision(session.revision);

  return freezeSession({
    ...session,
    text,
    revision,
    savedRevision:
      content === session.savedText.toString() ? revision : session.savedRevision
  });
}

export function commitSavedDocument(
  session: DocumentSessionState,
  { capturedRevision, document, diskVersion }: CommitSavedDocumentInput
): DocumentSessionState {
  validateCapturedRevision(capturedRevision, session.revision);

  const currentContent = session.text.toString();
  if (capturedRevision === session.revision && document.content !== currentContent) {
    throw new Error("Saved document content must match the captured document revision.");
  }

  const currentMatchesSavedDocument = currentContent === document.content;

  return freezeSession({
    ...session,
    path: document.path,
    name: document.name,
    encoding: document.encoding,
    savedText: currentMatchesSavedDocument
      ? session.text
      : createStringTextBuffer(document.content),
    savedRevision: currentMatchesSavedDocument ? session.revision : capturedRevision,
    diskVersion: copyDiskVersion(diskVersion),
    saveState: "idle"
  });
}

export function replaceDocumentFromDisk(
  session: DocumentSessionState,
  document: WorkspaceDocumentData,
  diskVersion: DiskVersion | null
): DocumentSessionState {
  const hasTextChange = document.content !== session.text.toString();
  const text = hasTextChange
    ? session.text.apply([
        { from: 0, to: session.text.length, insert: document.content }
      ])
    : session.text;
  const revision = hasTextChange
    ? nextDocumentRevision(session.revision)
    : session.revision;

  return freezeSession({
    ...session,
    path: document.path,
    name: document.name,
    encoding: document.encoding,
    text,
    savedText: text,
    revision,
    savedRevision: revision,
    diskVersion: copyDiskVersion(diskVersion),
    saveState: "idle"
  });
}

export function moveDocumentSession(
  session: DocumentSessionState,
  windowId: string
): DocumentSessionState {
  if (windowId === session.windowId) {
    return session;
  }

  return freezeSession({ ...session, windowId });
}

export function projectDocumentSession(
  session: DocumentSessionState
): DocumentSessionProjection {
  return Object.freeze({
    tabId: session.tabId,
    windowId: session.windowId,
    path: session.path,
    name: session.name,
    content: session.text.toString(),
    encoding: session.encoding,
    revision: session.revision,
    savedRevision: session.savedRevision,
    isDirty: session.revision !== session.savedRevision,
    saveState: session.saveState,
    diskVersion: copyDiskVersion(session.diskVersion)
  });
}

function copyDiskVersion(diskVersion: DiskVersion | null): DiskVersion | null {
  return diskVersion === null
    ? null
    : Object.freeze({
        normalizedPath: diskVersion.normalizedPath,
        mtimeMs: diskVersion.mtimeMs,
        size: diskVersion.size,
        contentHash: diskVersion.contentHash
      });
}

function freezeSession(session: DocumentSessionState): DocumentSessionState {
  return Object.freeze(session);
}

function validateCapturedRevision(
  capturedRevision: DocumentRevision,
  currentRevision: DocumentRevision
): void {
  if (!Number.isSafeInteger(capturedRevision) || capturedRevision < 0) {
    throw new RangeError("Captured revision must be a non-negative safe integer.");
  }
  if (capturedRevision > currentRevision) {
    throw new RangeError("Captured revision cannot be newer than the document revision.");
  }
}
