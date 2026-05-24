import { describe, expect, it } from "vitest";

import { createActiveBlockState } from "./active-block";

describe("createActiveBlockState", () => {
  const source = ["# Title", "", "Paragraph", "", "- one", "- two", "", "> quote"].join("\n");

  it("resolves the top-level block containing the current selection", () => {
    expect(
      createActiveBlockState(source, {
        anchor: source.indexOf("Title"),
        head: source.indexOf("Title")
      }).activeBlock?.type
    ).toBe("heading");

    expect(
      createActiveBlockState(source, {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      }).activeBlock?.type
    ).toBe("paragraph");

    expect(
      createActiveBlockState(source, {
        anchor: source.indexOf("- one"),
        head: source.indexOf("- one")
      }).activeBlock?.type
    ).toBe("list");

    expect(
      createActiveBlockState(source, {
        anchor: source.indexOf("> quote"),
        head: source.indexOf("> quote")
      }).activeBlock?.type
    ).toBe("blockquote");
  });

  it("keeps the block active on its trailing newline but not across blank separators", () => {
    expect(createActiveBlockState(source, { anchor: 7, head: 7 }).activeBlock?.type).toBe("heading");
    expect(createActiveBlockState(source, { anchor: 8, head: 8 }).activeBlock).toBeNull();
  });

  it("returns null when the document is empty or the selection is between top-level blocks", () => {
    expect(createActiveBlockState("", { anchor: 0, head: 0 }).activeBlock).toBeNull();
    expect(createActiveBlockState(source, { anchor: 19, head: 19 }).activeBlock).toBeNull();
  });

  it("keeps a non-empty whitespace-only document without an active semantic block", () => {
    const whitespaceOnlySource = " ";
    const activeBlock = createActiveBlockState(whitespaceOnlySource, {
      anchor: whitespaceOnlySource.length,
      head: whitespaceOnlySource.length
    }).activeBlock;

    expect(activeBlock).toBeNull();
  });

  it("resolves thematic breaks as active blocks when the selection lands on the separator", () => {
    const thematicBreakSource = ["Paragraph", "", "---", "", "+++"].join("\n");

    expect(
      createActiveBlockState(thematicBreakSource, {
        anchor: thematicBreakSource.indexOf("---"),
        head: thematicBreakSource.indexOf("---")
      }).activeBlock?.type
    ).toBe("thematicBreak");

    expect(
      createActiveBlockState(thematicBreakSource, {
        anchor: thematicBreakSource.indexOf("+++"),
        head: thematicBreakSource.indexOf("+++")
      }).activeBlock?.type
    ).toBe("thematicBreak");
  });
});
