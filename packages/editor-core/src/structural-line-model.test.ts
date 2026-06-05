import { parseMarkdownDocument } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import {
  createStructuralLineModel,
  resolveStructuralLineDeleteRange
} from "./structural-line-model";

describe("StructuralLineModel", () => {
  it("classifies the first blank body line between blocks as structural and the next as editable extra blank", () => {
    const source = ["Alpha", "", "", "Beta"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.getLineRole(3)).toBe("extra-blank");
    expect(model.getLineRole(1)).toBe("editable-content");
    expect(model.getLineRole(4)).toBe("editable-content");
  });

  it("classifies a bare quote line between quote inner blocks as a structural separator", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.findPreviousEditableLine(source.indexOf("222"))?.number).toBe(1);
    expect(model.findSeparatorBeforeLine(source.indexOf("> 222"))?.lineNumber).toBe(2);
  });

  it("keeps a trailing editable quote line distinct from a quote structural separator", () => {
    const source = ["> 1", ">"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("editable-empty");
  });

  it("returns deletion range for a quote structural separator including its trailing newline", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));
    const separator = model.findSeparatorBeforeLine(source.indexOf("> 222"));

    expect(separator).not.toBeNull();
    expect(resolveStructuralLineDeleteRange(source, separator!)).toEqual({
      from: "> 1\n".length,
      to: "> 1\n>\n".length
    });
  });

  it("normalizes quote separator metadata to physical CRLF line boundaries", () => {
    const source = ["> 1", ">", "> 222"].join("\r\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));
    const separator = model.findSeparatorBeforeLine(source.indexOf("> 222"));

    expect(separator).not.toBeNull();
    expect(separator?.lineStartOffset).toBe("> 1\r\n".length);
    expect(separator?.lineEndOffset).toBe("> 1\r\n>".length);
    expect(separator?.lineBreakTo).toBe("> 1\r\n>\r\n".length);
    expect(resolveStructuralLineDeleteRange(source, separator!)).toEqual({
      from: "> 1\r\n".length,
      to: "> 1\r\n>\r\n".length
    });
  });
});
