import { describe, expect, it } from "vitest";

import {
  IDLE_COMPOSITION_STATE,
  beginComposition,
  finishComposition,
  isComposing,
  noteCompositionDataChange,
  noteCompositionGeometryEvent,
  readCompositionStatus
} from "./composition-controller";

describe("composition controller", () => {
  it("starts idle and not frozen", () => {
    expect(isComposing(IDLE_COMPOSITION_STATE)).toBe(false);
    expect(readCompositionStatus(IDLE_COMPOSITION_STATE)).toEqual({ kind: "idle" });
  });

  it("freezes geometry for the duration of a composition", () => {
    const composing = beginComposition(12);

    expect(isComposing(composing)).toBe(true);
    expect(readCompositionStatus(composing)).toEqual({
      kind: "composing",
      dataRevision: 12,
      geometryEventCount: 0
    });
  });

  it("counts geometry events and reports one final recomputation", () => {
    let state = beginComposition(3);
    state = noteCompositionGeometryEvent(state, 3);
    state = noteCompositionDataChange(state, 4);
    state = noteCompositionGeometryEvent(state, 4);

    const receipt = finishComposition(state);

    expect(receipt.requiresStructureRefresh).toBe(true);
    expect(receipt.reason).toBe("composed-range-may-change-structure");
    expect(receipt.dataRevision).toBe(4);
    expect(receipt.geometryEventCount).toBe(2);
    expect(receipt.state).toBe(IDLE_COMPOSITION_STATE);
  });

  it("reports no refresh when nothing structural happened", () => {
    const receipt = finishComposition(beginComposition(1));

    expect(receipt.requiresStructureRefresh).toBe(false);
    expect(receipt.reason).toBe("no-geometry-work");
  });

  it("ignores notes while idle and rejects invalid revisions", () => {
    expect(noteCompositionGeometryEvent(IDLE_COMPOSITION_STATE, 5)).toBe(IDLE_COMPOSITION_STATE);
    expect(noteCompositionDataChange(IDLE_COMPOSITION_STATE, 5)).toBe(IDLE_COMPOSITION_STATE);
    expect(() => beginComposition(-1)).toThrow(RangeError);
    expect(() => beginComposition(1.5)).toThrow(RangeError);
  });

  it("is idempotent at the edges, so re-entrant bookkeeping cannot inflate the count", () => {
    const state = beginComposition(2);
    const finished = finishComposition(state);

    expect(finishComposition(finished.state).requiresStructureRefresh).toBe(false);
    expect(finishComposition(finished.state).geometryEventCount).toBe(0);
  });
});
