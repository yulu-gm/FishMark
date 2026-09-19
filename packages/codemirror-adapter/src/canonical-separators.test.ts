import { Compartment, EditorState, Facet } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { beginCompositionEffect, compositionStateField, editorStructureCacheField, finishCompositionEffect } from "./transaction-adapter";
import { createCanonicalSeparatorField } from "./canonical-separators";

const viewMode = Facet.define<"source" | "wysiwym", "source" | "wysiwym">({ combine: (values) => values[0] ?? "wysiwym" });
const modeConfiguration = new Compartment();
const canonicalSeparatorDecorations = createCanonicalSeparatorField((state) => state.facet(viewMode));

function stateFor(source: string, head = source.length) {
  return EditorState.create({ doc: source, selection: { anchor: head }, extensions: [editorStructureCacheField,
    compositionStateField, modeConfiguration.of(viewMode.of("wysiwym")), canonicalSeparatorDecorations] });
}
function collapsed(state: EditorState): number[] {
  const starts: number[] = [];
  state.field(canonicalSeparatorDecorations).between(0, state.doc.length, (from) => { starts.push(from); });
  return starts;
}

describe("canonical quote separator layout", () => {
  it.each([
    ["> 引用块\n>\n> > 二级引用块\n> > -", [6]],
    ["- > al\n  > \n  > pha", [7]],
    ["- > al\n  > \n  > \n  > \n  > pha", [7, 12, 17]],
    ["- > - al\n  > \n  > pha", [9]]
  ] as const)("collapses canonical inactive separators: %j", (source, starts) => {
    expect(collapsed(stateFor(source))).toEqual(starts);
  });
  it("leaves empty items and code content visible", () => {
    expect(collapsed(stateFor("> -\n> - \n> ```\n> \n> ```"))).toEqual([]);
  });
  it("updates only caret-line decorations and keeps source mode visible", () => {
    let state = stateFor("- > al\n  > \n  > pha");
    const untouched = state.field(canonicalSeparatorDecorations);
    state = state.update({ selection: { anchor: state.doc.length - 1 } }).state;
    expect(state.field(canonicalSeparatorDecorations)).toBe(untouched);
    state = state.update({ selection: { anchor: 10 } }).state;
    expect(collapsed(state)).toEqual([]);
    state = state.update({ selection: { anchor: state.doc.length } }).state;
    expect(collapsed(state)).toEqual([7]);
    state = state.update({ effects: modeConfiguration.reconfigure(viewMode.of("source")) }).state;
    expect(collapsed(state)).toEqual([]);
    state = state.update({ effects: modeConfiguration.reconfigure(viewMode.of("wysiwym")) }).state;
    expect(collapsed(state)).toEqual([7]);
  });
  it("maps geometry while composing and rebuilds when composition finishes", () => {
    let state = stateFor("- > al\n  > \n  > pha");
    state = state.update({ effects: beginCompositionEffect.of(0) }).state;
    state = state.update({ changes: { from: 0, insert: "x\n" } }).state;
    expect(collapsed(state)).toEqual([9]);
    state = state.update({ effects: finishCompositionEffect.of(null) }).state;
    expect(collapsed(state)).toEqual([9]);
  });
});
