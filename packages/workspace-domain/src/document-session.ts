import {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision,
  type DocumentRevision
} from "./document-revision";
import type { DiskVersion } from "./disk-version";
import {
  validateTextChanges,
  type TextBuffer,
  type TextBufferFactory,
  type TextChange
} from "./text-buffer";
import type { FileIdentity } from "./file-identity";

export interface WorkspaceDocumentData {
  readonly fileIdentity: FileIdentity | null;
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
  readonly encoding: "utf-8";
}

export type DocumentSaveState = "idle" | "manual-saving" | "autosaving";

export interface DocumentSessionState {
  readonly tabId: string;
  readonly windowId: string;
  readonly fileIdentity: FileIdentity | null;
  readonly path: string | null;
  readonly name: string;
  readonly encoding: "utf-8";
  readonly text: TextBuffer;
  readonly savedText: TextBuffer;
  readonly revision: DocumentRevision;
  readonly savedRevision: DocumentRevision;
  readonly diskVersion: DiskVersion | null;
  readonly saveState: DocumentSaveState;
  readonly createTextBuffer: TextBufferFactory;
  readonly clientSequenceHighWatermarks: ReadonlyMap<string, number>;
}

export interface DocumentSessionProjection {
  readonly tabId: string;
  readonly windowId: string;
  readonly fileIdentity: FileIdentity | null;
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
  readonly createTextBuffer: TextBufferFactory;
}

export interface CommitSavedDocumentInput {
  readonly capturedRevision: DocumentRevision;
  readonly document: WorkspaceDocumentData;
  readonly diskVersion: DiskVersion | null;
}

export interface ApplyDocumentEditBatchInput {
  readonly baseRevision: unknown;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly changes: unknown;
}

export type ApplyDocumentEditBatchInvalidCode =
  | "invalid-client-id"
  | "invalid-client-sequence"
  | "invalid-base-revision"
  | "empty-change-batch"
  | "invalid-text-changes"
  | "revision-overflow";

export interface ApplyDocumentEditBatchError {
  readonly code: ApplyDocumentEditBatchInvalidCode;
  readonly message: string;
}

export type ApplyDocumentEditBatchResult =
  | {
      readonly kind: "applied";
      readonly session: DocumentSessionState;
      readonly revision: DocumentRevision;
    }
  | {
      readonly kind: "duplicate";
      readonly session: DocumentSessionState;
      readonly revision: DocumentRevision;
    }
  | {
      readonly kind: "revision-conflict";
      readonly session: DocumentSessionState;
      readonly canonicalRevision: DocumentRevision;
    }
  | {
      readonly kind: "sequence-gap";
      readonly session: DocumentSessionState;
      readonly expectedSequence: number;
    }
  | {
      readonly kind: "invalid";
      readonly session: DocumentSessionState;
      readonly error: ApplyDocumentEditBatchError;
    };

export function createDocumentSession({
  tabId,
  windowId,
  document,
  diskVersion = null,
  createTextBuffer
}: CreateDocumentSessionInput): DocumentSessionState {
  const text = createTextBuffer(document.content);

  return freezeSession({
    tabId,
    windowId,
    fileIdentity: document.fileIdentity,
    path: document.path,
    name: document.name,
    encoding: document.encoding,
    text,
    savedText: text,
    revision: INITIAL_DOCUMENT_REVISION,
    savedRevision: INITIAL_DOCUMENT_REVISION,
    diskVersion: copyDiskVersion(diskVersion),
    saveState: "idle",
    createTextBuffer,
    clientSequenceHighWatermarks: new ImmutableHighWatermarks()
  });
}

export function applyDocumentEditBatch(
  session: DocumentSessionState,
  input: ApplyDocumentEditBatchInput
): ApplyDocumentEditBatchResult {
  if (
    typeof input.clientId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.clientId)
  ) {
    return invalidEditBatch(
      session,
      "invalid-client-id",
      "Document edit client ID has an invalid format."
    );
  }
  if (!Number.isSafeInteger(input.clientSequence) || input.clientSequence < 1) {
    return invalidEditBatch(
      session,
      "invalid-client-sequence",
      "Document edit client sequence must be a positive safe integer."
    );
  }

  const acknowledged = session.clientSequenceHighWatermarks.get(input.clientId) ?? 0;
  if (input.clientSequence <= acknowledged) {
    return Object.freeze({
      kind: "duplicate",
      session,
      revision: session.revision
    });
  }

  const expectedSequence = acknowledged + 1;
  if (input.clientSequence !== expectedSequence) {
    return Object.freeze({ kind: "sequence-gap", session, expectedSequence });
  }
  if (!isDocumentRevisionCandidate(input.baseRevision)) {
    return invalidEditBatch(
      session,
      "invalid-base-revision",
      "Document base revision must be a non-negative safe integer."
    );
  }
  const baseRevision = input.baseRevision;
  if (baseRevision !== session.revision) {
    return Object.freeze({
      kind: "revision-conflict",
      session,
      canonicalRevision: session.revision
    });
  }

  if (!isTextChangeCandidateArray(input.changes)) {
    return invalidEditBatch(
      session,
      "invalid-text-changes",
      "Document text changes must be an array of exact change objects."
    );
  }
  const changes = input.changes;
  try {
    validateTextChanges(changes, session.text.length);
  } catch (error) {
    return invalidEditBatch(
      session,
      "invalid-text-changes",
      error instanceof Error ? error.message : "Invalid document text changes."
    );
  }
  if (changes.length === 0) {
    return invalidEditBatch(
      session,
      "empty-change-batch",
      "Document edit batch must contain at least one change."
    );
  }

  let revision: DocumentRevision;
  try {
    revision = nextDocumentRevision(session.revision);
  } catch (error) {
    return invalidEditBatch(
      session,
      "revision-overflow",
      error instanceof Error ? error.message : "Document revision cannot advance."
    );
  }

  const text = session.text.apply(changes);
  const clientSequenceHighWatermarks = highWatermarksWith(
    session.clientSequenceHighWatermarks,
    input.clientId,
    input.clientSequence
  );
  const nextSession = freezeSession({
    ...session,
    text,
    revision,
    savedRevision: text.equals(session.savedText)
      ? revision
      : session.savedRevision,
    clientSequenceHighWatermarks
  });

  return Object.freeze({ kind: "applied", session: nextSession, revision });
}

export function getDocumentClientAcknowledgedSequence(
  session: DocumentSessionState,
  clientId: string
): number {
  return session.clientSequenceHighWatermarks.get(clientId) ?? 0;
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
    fileIdentity: document.fileIdentity,
    path: document.path,
    name: document.name,
    encoding: document.encoding,
    savedText: currentMatchesSavedDocument
      ? session.text
      : session.createTextBuffer(document.content),
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
    fileIdentity: document.fileIdentity,
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
    fileIdentity: session.fileIdentity,
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

class ImmutableHighWatermarks implements ReadonlyMap<string, number> {
  readonly #values: Map<string, number>;

  constructor(entries: Iterable<readonly [string, number]> = []) {
    this.#values = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: string): number | undefined {
    return this.#values.get(key);
  }

  has(key: string): boolean {
    return this.#values.has(key);
  }

  entries(): MapIterator<[string, number]> {
    return this.#values.entries();
  }

  keys(): MapIterator<string> {
    return this.#values.keys();
  }

  values(): MapIterator<number> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (value: number, key: string, map: ReadonlyMap<string, number>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#values) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[string, number]> {
    return this.entries();
  }
}

function highWatermarksWith(
  current: ReadonlyMap<string, number>,
  clientId: string,
  clientSequence: number
): ReadonlyMap<string, number> {
  return new ImmutableHighWatermarks([
    ...current.entries(),
    [clientId, clientSequence]
  ]);
}

function invalidEditBatch(
  session: DocumentSessionState,
  code: ApplyDocumentEditBatchInvalidCode,
  message: string
): ApplyDocumentEditBatchResult {
  return Object.freeze({
    kind: "invalid",
    session,
    error: Object.freeze({ code, message })
  });
}

function isDocumentRevisionCandidate(value: unknown): value is DocumentRevision {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTextChangeCandidateArray(value: unknown): value is readonly TextChange[] {
  return Array.isArray(value) && value.every((change: unknown) =>
    typeof change === "object" &&
    change !== null &&
    !Array.isArray(change) &&
    Object.getPrototypeOf(change) === Object.prototype &&
    Object.keys(change).sort().join(",") === "from,insert,to" &&
    "from" in change &&
    typeof change.from === "number" &&
    "to" in change &&
    typeof change.to === "number" &&
    "insert" in change &&
    typeof change.insert === "string"
  );
}
