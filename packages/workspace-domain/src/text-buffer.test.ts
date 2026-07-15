import { describe, expect, it } from "vitest";

import {
  INITIAL_DOCUMENT_REVISION,
  nextDocumentRevision
} from "./document-revision";
import { createStringTextBuffer, type TextChange } from "./text-buffer";

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

describe("createStringTextBuffer", () => {
  it("represents empty text and preserves identity for an empty change list", () => {
    const buffer = createStringTextBuffer("");

    expect(buffer.length).toBe(0);
    expect(buffer.toString()).toBe("");
    expect(buffer.apply([])).toBe(buffer);
  });

  it("preserves Unicode, emoji, and CRLF text", () => {
    const content = "FishMark 鱼\r\nemoji: 🙂";
    const buffer = createStringTextBuffer(content);

    expect(buffer.length).toBe(content.length);
    expect(buffer.toString()).toBe(content);
  });

  it("slices the buffer with an optional end position", () => {
    const buffer = createStringTextBuffer("alpha\r\nbeta🙂");

    expect(buffer.slice(0, 5)).toBe("alpha");
    expect(buffer.slice(7)).toBe("beta🙂");
  });

  it("applies a single replacement", () => {
    const buffer = createStringTextBuffer("alpha beta");

    expect(buffer.apply([{ from: 6, to: 10, insert: "FishMark" }]).toString()).toBe(
      "alpha FishMark"
    );
  });

  it("applies sorted changes against the original buffer without mutation", () => {
    const original = createStringTextBuffer("alpha\r\nbeta🙂");
    const next = original.apply([
      { from: 0, to: 5, insert: "A" },
      { from: 7, to: 11, insert: "B" }
    ]);

    expect(original.toString()).toBe("alpha\r\nbeta🙂");
    expect(next.toString()).toBe("A\r\nB🙂");
    expect(next).not.toBe(original);
  });

  it.each<[string, readonly TextChange[], string]>([
    ["a reversed range", [{ from: 2, to: 1, insert: "" }], "invalid range"],
    ["a negative start", [{ from: -1, to: 0, insert: "" }], "outside buffer"],
    ["a negative end", [{ from: 0, to: -1, insert: "" }], "outside buffer"],
    ["a start past the end", [{ from: 5, to: 5, insert: "" }], "outside buffer"],
    ["an end past the end", [{ from: 3, to: 5, insert: "" }], "outside buffer"],
    ["a fractional start", [{ from: 0.5, to: 1, insert: "" }], "integer"],
    ["a fractional end", [{ from: 0, to: 1.5, insert: "" }], "integer"],
    [
      "unsorted changes",
      [
        { from: 3, to: 4, insert: "" },
        { from: 1, to: 2, insert: "" }
      ],
      "sorted and non-overlapping"
    ],
    [
      "overlapping changes",
      [
        { from: 1, to: 3, insert: "" },
        { from: 2, to: 4, insert: "" }
      ],
      "sorted and non-overlapping"
    ]
  ])("rejects %s", (_name, changes, message) => {
    expect(() => createStringTextBuffer("abcd").apply(changes)).toThrow(message);
  });
});
