import { describe, expect, it } from "vitest";

import { resolveLineStartOffset } from "./source-utils";

describe("resolveLineStartOffset", () => {
  it("keeps offset zero on the first physical line even when the document starts with a newline", () => {
    expect(resolveLineStartOffset("\n### Todo", 0)).toBe(0);
  });

  it("resolves the line start after a leading newline", () => {
    expect(resolveLineStartOffset("\n### Todo", 1)).toBe(1);
  });
});
