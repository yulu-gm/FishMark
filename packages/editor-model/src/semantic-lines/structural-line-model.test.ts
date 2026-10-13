import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { applyIncrementalEdit, createDocumentStructureCache } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import {
  createStructuralLineModel,
  resolveStructuralLineDeleteRange
} from "./structural-line-model";

const snapshotOf = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

describe("StructuralLineModel", () => {
  it("reuses document geometry across queries without sharing mutable lines", () => {
    const snapshot = snapshotOf("Alpha\n\nBeta");
    const model = createStructuralLineModel(snapshot);
    expect(model.findNextEditableLine(0)?.text).toBe("Beta");
    expect(model.findPreviousEditableLine(snapshot.source.length)?.text).toBe("Alpha");
    const line = model.getLineAtOffset(0)!;
    expect(() => Object.assign(line, { text: "corrupted" })).toThrow(TypeError);
    expect(createStructuralLineModel(snapshot)).toBe(model);
    expect(model.getLineAtOffset(0)?.text).toBe("Alpha");
    expect(model.findPreviousEditableLine(0)).toBeNull();
    expect(model.findNextEditableLine(snapshot.source.length)).toBeNull();
  });

  it("isolates equal revisions and retains old geometry after a document edit", () => {
    const cache = createDocumentStructureCache("Alpha\r\n\r\nBeta");
    const original = createEditorDerivedSnapshotFromCache(cache);
    const oldModel = createStructuralLineModel(original);
    const other = snapshotOf("> one\n>\n> two");
    expect(other.revision).toBe(original.revision);
    expect(createStructuralLineModel(other)).not.toBe(oldModel);
    expect(createStructuralLineModel(other).findSeparatorAt(6)?.lineStartOffset).toBe(6);
    const edited = applyIncrementalEdit(cache, { fromOffset: 0, toOffset: 5, insertedText: "Changed" }).cache;
    const nextModel = createStructuralLineModel(createEditorDerivedSnapshotFromCache(edited));
    expect(nextModel).not.toBe(oldModel);
    expect(nextModel.getLineAtOffset(0)?.text).toBe("Changed");
    expect(nextModel.findSeparatorAt(9)?.nextBlockStart).toBe(11);
    expect(oldModel.getLineAtOffset(0)?.text).toBe("Alpha");
    expect(oldModel.findSeparatorAt(7)?.nextBlockStart).toBe(9);
    expect(createStructuralLineModel(original)).toBe(oldModel);
  });

  it("classifies the first blank body line between blocks as structural and the next as editable extra blank", () => {
    const source = ["Alpha", "", "", "Beta"].join("\n");
    const model = createStructuralLineModel(snapshotOf(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.getLineRole(3)).toBe("extra-blank");
    expect(model.getLineRole(1)).toBe("editable-content");
    expect(model.getLineRole(4)).toBe("editable-content");
  });

  it("classifies a bare quote line between quote inner blocks as a structural separator", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(snapshotOf(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.findPreviousEditableLine(source.indexOf("222"))?.number).toBe(1);
    expect(model.findSeparatorBeforeLine(source.indexOf("> 222"))?.lineNumber).toBe(2);
  });

  it("keeps a trailing editable quote line distinct from a quote structural separator", () => {
    const source = ["> 1", ">"].join("\n");
    const model = createStructuralLineModel(snapshotOf(source));

    expect(model.getLineRole(2)).toBe("editable-empty");
  });

  it("returns deletion range for a quote structural separator including its trailing newline", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(snapshotOf(source));
    const separator = model.findSeparatorBeforeLine(source.indexOf("> 222"));

    expect(separator).not.toBeNull();
    expect(resolveStructuralLineDeleteRange(source, separator!)).toEqual({
      from: "> 1\n".length,
      to: "> 1\n>\n".length
    });
  });

  it("normalizes quote separator metadata to physical CRLF line boundaries", () => {
    const source = ["> 1", ">", "> 222"].join("\r\n");
    const model = createStructuralLineModel(snapshotOf(source));
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
