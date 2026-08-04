import { describe, expect, expectTypeOf, it } from "vitest";

import {
  APPLY_DOCUMENT_EDITS_CHANNEL,
  FLUSH_DOCUMENT_EDITS_CHANNEL,
  decodeApplyDocumentEditsInput,
  decodeFlushDocumentEditsInput,
  type ApplyDocumentEditsInput,
  type ApplyDocumentEditsResult,
  type DecodedApplyDocumentEditsCandidate,
  type DocumentEditErrorCode
} from "./document-edit";

describe("document edit shared contract", () => {
  it("owns stable runtime channels and structured-clone-safe DTOs", () => {
    expect(APPLY_DOCUMENT_EDITS_CHANNEL).toBe("fishmark:apply-document-edits");
    expect(FLUSH_DOCUMENT_EDITS_CHANNEL).toBe("fishmark:flush-document-edits");
    const result: ApplyDocumentEditsResult = {
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 2,
      isDirty: true
    };
    expect(structuredClone(result)).toEqual(result);
    expect(result).not.toHaveProperty("canonicalText");
  });

  it("decodes an exact apply envelope without pre-validating stale retry payload bytes", () => {
    const input = {
      tabId: "tab-1",
      clientId: "client:a.1",
      clientSequence: 1,
      baseRevision: Number.NaN,
      changes: null
    };
    const decoded = decodeApplyDocumentEditsInput(input);
    expect(decoded).toEqual({ ok: true, value: input });
    expect(decoded.ok && decoded.value).not.toBe(input);
    if (decoded.ok) {
      expectTypeOf(decoded.value).toEqualTypeOf<DecodedApplyDocumentEditsCandidate>();
      expectTypeOf(decoded.value.baseRevision).toEqualTypeOf<unknown>();
      expectTypeOf(decoded.value.changes).toEqualTypeOf<unknown>();
    }
    expectTypeOf<ApplyDocumentEditsInput["baseRevision"]>().toEqualTypeOf<number>();
    expectTypeOf<ApplyDocumentEditsInput["changes"]>().toEqualTypeOf<
      readonly { from: number; to: number; insert: string }[]
    >();
  });

  it.each([
    null,
    [],
    {},
    { tabId: "tab-1", clientId: "a", clientSequence: 1, baseRevision: 0 },
    { tabId: "tab-1", clientId: "a", clientSequence: 1, baseRevision: 0, changes: [], extra: true },
    { tabId: "", clientId: "a", clientSequence: 1, baseRevision: 0, changes: [] }
  ])("rejects malformed apply envelope %#", (input) => {
    expect(decodeApplyDocumentEditsInput(input)).toEqual({ ok: false });
  });

  it("distinguishes invalid client identity and sequence from malformed structure", () => {
    expect(decodeApplyDocumentEditsInput({
      tabId: "tab-1", clientId: "-bad", clientSequence: 1,
      baseRevision: 0, changes: []
    })).toEqual({ ok: false, errorCode: "invalid-client-id" });
    expect(decodeApplyDocumentEditsInput({
      tabId: "tab-1", clientId: "a", clientSequence: 0,
      baseRevision: 0, changes: []
    })).toEqual({ ok: false, errorCode: "invalid-client-sequence" });
  });

  it("decodes flush zero and rejects unsafe or extra fields", () => {
    const valid = { tabId: "tab-1", clientId: "a", throughSequence: 0 };
    const decoded = decodeFlushDocumentEditsInput(valid);
    expect(decoded).toEqual({ ok: true, value: valid });
    expect(decoded.ok && decoded.value).not.toBe(valid);
    expect(decodeFlushDocumentEditsInput({ ...valid, throughSequence: -1 })).toEqual({
      ok: false, errorCode: "invalid-client-sequence"
    });
    expect(decodeFlushDocumentEditsInput({ ...valid, throughSequence: Number.MAX_SAFE_INTEGER + 1 })).toEqual({
      ok: false, errorCode: "invalid-client-sequence"
    });
    expect(decodeFlushDocumentEditsInput({ ...valid, extra: true })).toEqual({ ok: false });
  });

  it("keeps the public error-code union closed", () => {
    expectTypeOf<DocumentEditErrorCode>().toEqualTypeOf<
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
      | "internal-error"
    >();
  });
});
