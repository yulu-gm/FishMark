import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import {
  applyEditorPlan,
  createEditorModelBridgeExtension,
  editorStructureCacheField,
  readEditorSemanticContext,
  readEditorStructureCache,
  runEditorPlanCommand
} from "./editor-model-bridge";

function stateWith(source: string, anchor = source.length): EditorState {
  return EditorState.create({
    doc: source,
    selection: { anchor, head: anchor },
    extensions: [editorStructureCacheField]
  });
}

describe("editor model bridge", () => {
  it("keeps a document structure cache that follows ordinary edits incrementally", () => {
    const state = stateWith("Alpha");
    const before = readEditorStructureCache(state);
    const after = state.update({ changes: { from: 5, to: 5, insert: " Beta" } }).state;
    const cache = readEditorStructureCache(after);

    expect(before.tree.root.source.endOffset).toBe(5);
    expect(cache.source).toBe("Alpha Beta");
    expect(cache.revision).toBe(before.revision + 1);
    expect(cache.tree.root.source.endOffset).toBe(10);
    expect(cache.tree).not.toBe(before.tree);
  });

  it("reparses when a transaction changes several ranges at once", () => {
    const state = stateWith("Alpha Beta");
    const before = readEditorStructureCache(state);
    const after = state.update({
      changes: [
        { from: 0, to: 1, insert: "A" },
        { from: 6, to: 7, insert: "B" }
      ]
    }).state;
    const cache = readEditorStructureCache(after);

    expect(cache.source).toBe("Alpha Beta");
    expect(cache.revision).toBe(1);
    expect(cache).not.toBe(before);
  });

  it("reads a semantic context from the cached tree", () => {
    const context = readEditorSemanticContext(stateWith("- one\n- two", 3));

    expect(context.revision).toBe(1);
    expect(context.nodeAt(2)?.kind).toBe("paragraph");
    expect(context.lineAt(3)?.lineNumber).toBe(1);
  });

  it("applies one plan as one transaction and reports unhandled plans", () => {
    const state = stateWith("Alpha");
    const dispatch = vi.fn();
    const view = { state, dispatch } as unknown as Parameters<typeof applyEditorPlan>[0];
    const context = readEditorSemanticContext(state);
    const plan = runEditorPlanCommand(
      view,
      (current) => ({
        revision: current.revision,
        commandId: "insert-text",
        intent: "edit",
        edits: [{ from: 5, to: 5, insert: "!" }],
        selection: { anchor: 6, head: 6 }
      }),
      "input.type"
    );

    expect(plan).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      changes: [{ from: 5, to: 5, insert: "!" }],
      selection: { anchor: 6, head: 6 },
      userEvent: "input.type"
    });
    expect(context.revision).toBe(1);
    expect(applyEditorPlan(view, null)).toBe(false);
  });

  it("stays out of the current extension list until the cutover routes commands through it", () => {
    expect(editorStructureCacheField).toBeDefined();
    expect(createEditorModelBridgeExtension()).toBe(editorStructureCacheField);
  });
});

