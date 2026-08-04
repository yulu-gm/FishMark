export type DocumentRevision = number;

export type DocumentTextChange = {
  from: number;
  to: number;
  insert: string;
};

export type ApplyDocumentEditsInput = {
  tabId: string;
  clientId: string;
  clientSequence: number;
  baseRevision: DocumentRevision;
  changes: readonly DocumentTextChange[];
};

export type DecodedApplyDocumentEditsCandidate = {
  readonly tabId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseRevision: unknown;
  readonly changes: unknown;
};

export type DocumentEditErrorCode =
  | "invalid-request"
  | "unknown-tab"
  | "tab-owner-changed"
  | "invalid-client-id"
  | "invalid-client-sequence"
  | "invalid-base-revision"
  | "invalid-text-changes"
  | "empty-change-batch"
  | "revision-overflow"
  | "runtime-context-unavailable"
  | "internal-error";

export type DocumentEditError = {
  code: DocumentEditErrorCode;
  message: string;
};

export type ApplyDocumentEditsResult =
  | {
      kind: "applied" | "duplicate";
      acknowledgedSequence: number;
      revision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "revision-conflict";
      canonicalRevision: DocumentRevision;
      canonicalText: string;
      isDirty: boolean;
    }
  | {
      kind: "sequence-gap";
      expectedSequence: number;
      canonicalRevision: DocumentRevision;
    }
  | { kind: "error"; error: DocumentEditError };

export type FlushDocumentEditsInput = {
  tabId: string;
  clientId: string;
  throughSequence: number;
};

export type FlushDocumentEditsResult =
  | {
      kind: "flushed";
      acknowledgedSequence: number;
      revision: DocumentRevision;
      savedRevision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "sequence-gap";
      expectedSequence: number;
      canonicalRevision: DocumentRevision;
    }
  | { kind: "error"; error: DocumentEditError };

export type DocumentEditDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly errorCode?: "invalid-client-id" | "invalid-client-sequence";
    };

export const APPLY_DOCUMENT_EDITS_CHANNEL = "fishmark:apply-document-edits";
export const FLUSH_DOCUMENT_EDITS_CHANNEL = "fishmark:flush-document-edits";

export const DOCUMENT_EDIT_ERROR_MESSAGES: Readonly<Record<DocumentEditErrorCode, string>> =
  Object.freeze({
    "invalid-request": "Invalid document edit request.",
    "unknown-tab": "Unknown document tab.",
    "tab-owner-changed": "Document tab owner changed.",
    "invalid-client-id": "Document edit client ID has an invalid format.",
    "invalid-client-sequence": "Document edit client sequence is invalid.",
    "invalid-base-revision": "Document base revision is invalid.",
    "invalid-text-changes": "Document text changes are invalid.",
    "empty-change-batch": "Document edit batch must not be empty.",
    "revision-overflow": "Document revision cannot advance.",
    "runtime-context-unavailable": "Document runtime context is unavailable.",
    "internal-error": "Document edit operation failed."
  });

const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_TAB_ID_LENGTH = 128;

export function decodeApplyDocumentEditsInput(
  input: unknown
): DocumentEditDecodeResult<DecodedApplyDocumentEditsCandidate> {
  if (
    !hasExactKeys(input, [
      "baseRevision",
      "changes",
      "clientId",
      "clientSequence",
      "tabId"
    ]) ||
    !isTabId(input.tabId)
  ) {
    return { ok: false };
  }
  if (typeof input.clientId !== "string" || !CLIENT_ID_PATTERN.test(input.clientId)) {
    return { ok: false, errorCode: "invalid-client-id" };
  }
  if (
    typeof input.clientSequence !== "number" ||
    !Number.isSafeInteger(input.clientSequence) ||
    input.clientSequence < 1
  ) {
    return { ok: false, errorCode: "invalid-client-sequence" };
  }

  // baseRevision and changes deliberately remain statefully validated in domain order.
  return {
    ok: true,
    value: {
      tabId: input.tabId,
      clientId: input.clientId,
      clientSequence: input.clientSequence,
      baseRevision: input.baseRevision,
      changes: input.changes
    }
  };
}

export function decodeFlushDocumentEditsInput(
  input: unknown
): DocumentEditDecodeResult<FlushDocumentEditsInput> {
  if (
    !hasExactKeys(input, ["clientId", "tabId", "throughSequence"]) ||
    !isTabId(input.tabId)
  ) {
    return { ok: false };
  }
  if (typeof input.clientId !== "string" || !CLIENT_ID_PATTERN.test(input.clientId)) {
    return { ok: false, errorCode: "invalid-client-id" };
  }
  if (
    typeof input.throughSequence !== "number" ||
    !Number.isSafeInteger(input.throughSequence) ||
    input.throughSequence < 0
  ) {
    return { ok: false, errorCode: "invalid-client-sequence" };
  }
  return {
    ok: true,
    value: {
      tabId: input.tabId,
      clientId: input.clientId,
      throughSequence: input.throughSequence
    }
  };
}

function isTabId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TAB_ID_LENGTH;
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[]
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]);
}
