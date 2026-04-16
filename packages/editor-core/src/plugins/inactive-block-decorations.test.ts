import { describe, expect, it, vi } from "vitest";

import { parseBlockMap } from "@yulora/markdown-engine";

import { createBlockMapCache } from "../derived-state/block-map-cache";
import { deriveInactiveBlockDecorationsState } from "./inactive-block-decorations";

describe("deriveInactiveBlockDecorationsState", () => {
  it("reuses the cached block map across selection-only updates", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const parseSpy = vi.fn(parseBlockMap);
    const blockMapCache = createBlockMapCache(parseSpy);

    const initialResult = deriveInactiveBlockDecorationsState({
      source,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      blockMapCache
    });

    const nextResult = deriveInactiveBlockDecorationsState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      hasEditorFocus: false,
      blockMapCache
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(initialResult.activeBlockState.activeBlock?.type).toBe("heading");
    expect(nextResult.activeBlockState.activeBlock?.type).toBe("paragraph");
    expect(nextResult.activeBlockState.blockMap).toBe(initialResult.activeBlockState.blockMap);
  });
});
