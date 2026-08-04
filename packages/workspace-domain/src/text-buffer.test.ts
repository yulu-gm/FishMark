import { describe, expect, it } from "vitest";

import {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision
} from "./document-revision";
import { runTextBufferConformance } from "../test/text-buffer-conformance";
import {
  createStringTextBuffer,
  validateTextChanges
} from "./text-buffer";

describe("document revisions", () => {
  it("starts at zero and advances by one", () => {
    expect(INITIAL_DOCUMENT_REVISION).toBe(0);
    expect(nextDocumentRevision(INITIAL_DOCUMENT_REVISION)).toBe(1);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid revision %#",
    (revision) => {
      expect(() => nextDocumentRevision(revision)).toThrow(
        "Document revision must be a non-negative safe integer."
      );
    }
  );

  it("rejects safe-integer overflow", () => {
    expect(() => nextDocumentRevision(Number.MAX_SAFE_INTEGER)).toThrow(
      "Document revision exhausted the safe integer range."
    );
  });
});

runTextBufferConformance("String", createStringTextBuffer);

describe("validateTextChanges", () => {
  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid buffer length %#",
    (bufferLength) => {
      expect(() => validateTextChanges([], bufferLength)).toThrow(
        "Text buffer length must be a non-negative safe integer."
      );
    }
  );
});
