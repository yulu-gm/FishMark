import { describe, expect, it } from "vitest";

import { getDocumentMetrics } from "./document-metrics";

describe("getDocumentMetrics", () => {
  it("returns 0 for an empty document", () => {
    const metrics = getDocumentMetrics("");

    expect(metrics.characterCount).toBe(0);
    expect(metrics.meaningfulCharacterCount).toBe(0);
  });

  it("uses visible character count as a fallback meaningful count for English text", () => {
    const metrics = getDocumentMetrics("hello world");

    expect(metrics.characterCount).toBe(11);
    expect(metrics.meaningfulCharacterCount).toBe(10);
  });

  it("returns stable meaningful character count for Chinese text", () => {
    const metrics = getDocumentMetrics("你好，世界！");

    expect(metrics.characterCount).toBe(6);
    expect(metrics.meaningfulCharacterCount).toBe(6);
  });

  it("does not count leading/trailing whitespace and empty lines as meaningful characters", () => {
    const metrics = getDocumentMetrics("\n\n  你好 世界  \n\n");

    expect(metrics.characterCount).toBe(13);
    expect(metrics.meaningfulCharacterCount).toBe(4);
  });
});
