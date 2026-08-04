import { describe, expect, it } from "vitest";

import type {
  TextBufferFactory,
  TextChange
} from "../src/text-buffer";

export function runTextBufferConformance(
  name: string,
  createTextBuffer: TextBufferFactory
): void {
  describe(`${name} TextBuffer conformance`, () => {
    it("represents empty text and preserves identity for an empty change list", () => {
      const buffer = createTextBuffer("");

      expect(buffer.length).toBe(0);
      expect(buffer.toString()).toBe("");
      expect(buffer.apply([])).toBe(buffer);
    });

    it.each([
      "FishMark 鱼",
      "emoji: 🙂",
      "combining: e\u0301",
      "alpha\r\nbeta",
      "lf\ncrlf\r\ncr\rend",
      "lone\rcarriage"
    ])("round-trips exact text %#", (content) => {
      const buffer = createTextBuffer(content);

      expect(buffer.length).toBe(content.length);
      expect(buffer.toString()).toBe(content);
    });

    it("slices with UTF-16 offsets and an optional end position", () => {
      const buffer = createTextBuffer("鱼🙂e\u0301\r\nend");

      expect(buffer.slice(1, 3)).toBe("🙂");
      expect(buffer.slice(5)).toBe("\r\nend");
    });

    it("applies multiple edits against original offsets without mutating the old buffer", () => {
      const originalText = "alpha\r\nbeta🙂\ngamma";
      const original = createTextBuffer(originalText);
      const next = original.apply([
        { from: 0, to: 5, insert: "A" },
        { from: 7, to: 11, insert: "B" },
        { from: 13, to: 14, insert: "!" }
      ]);

      expect(original.toString()).toBe(originalText);
      expect(next.toString()).toBe("A\r\nB🙂!gamma");
      expect(next).not.toBe(original);
    });

    it("allows adjacent replacements", () => {
      const next = createTextBuffer("abcd").apply([
        { from: 0, to: 2, insert: "A" },
        { from: 2, to: 4, insert: "B" }
      ]);

      expect(next.toString()).toBe("AB");
    });

    it("keeps same-position insertions in change-list order", () => {
      const next = createTextBuffer("ab").apply([
        { from: 1, to: 1, insert: "first" },
        { from: 1, to: 1, insert: "second" }
      ]);

      expect(next.toString()).toBe("afirstsecondb");
    });

    it("handles a 20,000-line document and a large insertion", () => {
      const originalText = Array.from(
        { length: 20_000 },
        (_, index) => `line-${index}`
      ).join("\n");
      const marker = "line-19999";
      const from = originalText.lastIndexOf(marker);
      const insertion = "鱼🙂e\u0301\r\n".repeat(100_000);
      const original = createTextBuffer(originalText);
      const next = original.apply([
        { from, to: from + marker.length, insert: insertion }
      ]);

      expect(next.slice(from, from + insertion.length)).toBe(insertion);
      expect(next.length).toBe(
        originalText.length - marker.length + insertion.length
      );
      expect(original.toString()).toBe(originalText);
    });

    it("compares exact content", () => {
      const first = createTextBuffer("alpha\r\n🙂");
      const equal = createTextBuffer("alpha\r\n🙂");
      const different = createTextBuffer("alpha\n🙂");

      expect(first.equals(first)).toBe(true);
      expect(first.equals(equal)).toBe(true);
      expect(equal.equals(first)).toBe(true);
      expect(first.equals(different)).toBe(false);
    });

    it.each<[string, readonly TextChange[], string]>([
      ["a reversed range", [{ from: 2, to: 1, insert: "" }], "invalid range"],
      ["a negative start", [{ from: -1, to: 0, insert: "" }], "outside buffer"],
      ["a negative end", [{ from: 0, to: -1, insert: "" }], "outside buffer"],
      ["a start past the end", [{ from: 5, to: 5, insert: "" }], "outside buffer"],
      ["an end past the end", [{ from: 3, to: 5, insert: "" }], "outside buffer"],
      ["a fractional start", [{ from: 0.5, to: 1, insert: "" }], "safe integers"],
      ["a fractional end", [{ from: 0, to: 1.5, insert: "" }], "safe integers"],
      ["a NaN start", [{ from: Number.NaN, to: 1, insert: "" }], "safe integers"],
      ["an infinite end", [{ from: 0, to: Number.POSITIVE_INFINITY, insert: "" }], "safe integers"],
      ["an unsafe start", [{ from: Number.MAX_SAFE_INTEGER + 1, to: 4, insert: "" }], "safe integers"],
      ["an unsafe end", [{ from: 0, to: Number.MAX_SAFE_INTEGER + 1, insert: "" }], "safe integers"],
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
    ])("rejects %s atomically", (_description, changes, message) => {
      const buffer = createTextBuffer("abcd");

      expect(() => buffer.apply(changes)).toThrow(message);
      expect(buffer.toString()).toBe("abcd");
    });

    it.each<[string, unknown, string]>([
      ["a null change", [null], "non-null object"],
      ["a primitive change", [1], "non-null object"],
      ["a missing insert", [{ from: 0, to: 1 }], "insert must be a string"],
      ["a non-string insert", [{ from: 0, to: 1, insert: 42 }], "insert must be a string"]
    ])("rejects runtime-malformed %s before applying", (_description, malformed, message) => {
      const buffer = createTextBuffer("abcd");
      const changes = malformed as readonly TextChange[];

      expect(() => buffer.apply(changes)).toThrow(message);
      expect(buffer.toString()).toBe("abcd");
    });
  });
}
