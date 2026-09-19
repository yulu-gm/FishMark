import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import {
  assertPlanRevisionCurrent,
  checkPlanRevision,
  createEditorLocalRevision,
  createSelectionMapper,
  requiresStructureRefresh,
  sameEditorSelection
} from "./selection-mapper";
import { editorStructureCacheField, readEditorStructureCache } from "./transaction-adapter";

function stateWith(source: string, anchor = 0): EditorState {
  return EditorState.create({
    doc: source,
    selection: { anchor, head: anchor },
    extensions: [editorStructureCacheField]
  });
}

describe("selection mapper", () => {
  it("reuses one document snapshot across selection-only reads", () => {
    const mapper = createSelectionMapper();
    const cache = createDocumentStructureCache("alpha\n\nbeta");
    const first = mapper.contextFor({ snapshot: snapshotOf(cache), selection: { anchor: 0, head: 0 } });
    const second = mapper.contextFor({ snapshot: snapshotOf(cache), selection: { anchor: 3, head: 3 } });

    // The document-derived snapshot is shared; only the selection-derived part changes.
    expect(second.snapshot).toBe(first.snapshot);
    expect(second.selectionContext.activeOffset).toBe(3);
    expect(second.revision).toBe(first.revision);
  });

  it("returns the same context object for an identical selection", () => {
    const mapper = createSelectionMapper();
    const snapshot = snapshotOf(createDocumentStructureCache("alpha"));

    expect(mapper.contextFor({ snapshot, selection: { anchor: 1, head: 2 } }))
      .toBe(mapper.contextFor({ snapshot, selection: { anchor: 1, head: 2 } }));
    expect(mapper.contextFor({ snapshot, selection: { anchor: 1, head: 2 } }))
      .not.toBe(mapper.contextFor({ snapshot, selection: { anchor: 2, head: 1 } }));
  });

  it("only a document change requires a structure refresh", () => {
    expect(requiresStructureRefresh(true)).toBe(true);
    expect(requiresStructureRefresh(false)).toBe(false);
  });

  it("compares selections by both ends", () => {
    expect(sameEditorSelection({ anchor: 1, head: 2 }, { anchor: 1, head: 2 })).toBe(true);
    expect(sameEditorSelection({ anchor: 1, head: 2 }, { anchor: 2, head: 1 })).toBe(false);
  });

  it("reports a stale plan and a foreign-session plan distinctly", () => {
    const current = createEditorLocalRevision(2, 5);

    expect(checkPlanRevision({ planRevision: 5, planGeneration: 2, current }))
      .toEqual({ kind: "current", revision: 5 });
    expect(checkPlanRevision({ planRevision: 4, planGeneration: 2, current }))
      .toEqual({ kind: "stale", planRevision: 4, currentRevision: 5 });
    expect(checkPlanRevision({ planRevision: 5, planGeneration: 1, current }))
      .toEqual({ kind: "foreign-session", planGeneration: 1, currentGeneration: 2 });
  });

  it("throws from the assertion only for a non-current plan", () => {
    expect(() => assertPlanRevisionCurrent({ kind: "current", revision: 5 })).not.toThrow();
    expect(() => assertPlanRevisionCurrent({
      kind: "stale",
      planRevision: 4,
      currentRevision: 5
    })).toThrow(/revision 4/);
    expect(() => assertPlanRevisionCurrent({
      kind: "foreign-session",
      planGeneration: 1,
      currentGeneration: 2
    })).toThrow(/generation 1/);
  });

  it("rejects invalid local revisions and selections", () => {
    expect(() => createEditorLocalRevision(0, 1)).toThrow(RangeError);
    expect(() => createEditorLocalRevision(1, -1)).toThrow(RangeError);
    expect(() => createSelectionMapper().contextFor({
      snapshot: snapshotOf(createDocumentStructureCache("alpha")),
      selection: { anchor: -1, head: 0 }
    })).toThrow(RangeError);
  });

  it("reads the cache revision as the local document revision", () => {
    const state = stateWith("alpha");
    const revised = state.update({ changes: { from: 5, insert: " beta" } }).state;

    expect(readEditorStructureCache(revised).revision)
      .toBeGreaterThan(readEditorStructureCache(state).revision);
  });
});

function snapshotOf(cache: ReturnType<typeof createDocumentStructureCache>) {
  return createEditorDerivedSnapshotFromCache(cache);
}
