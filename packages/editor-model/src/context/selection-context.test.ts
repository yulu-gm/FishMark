import { describe, expect, it } from "vitest";

import {
  clampSelectionToSource,
  createSelectionContext,
  sameSelection
} from "./selection-context";

describe("selection context", () => {
  it("normalizes direction, emptiness, and the active offset", () => {
    const forward = createSelectionContext({ anchor: 2, head: 7 });
    const backward = createSelectionContext({ anchor: 7, head: 2 });

    expect(forward.from).toBe(2);
    expect(forward.to).toBe(7);
    expect(forward.activeOffset).toBe(7);
    expect(forward.empty).toBe(false);
    expect(backward.from).toBe(2);
    expect(backward.to).toBe(7);
    expect(backward.activeOffset).toBe(2);
  });

  it("treats a collapsed caret as empty", () => {
    const caret = createSelectionContext({ anchor: 5, head: 5 });

    expect(caret.empty).toBe(true);
    expect(caret.from).toBe(5);
    expect(caret.to).toBe(5);
  });

  it("compares selections by both ends", () => {
    expect(sameSelection({ anchor: 1, head: 3 }, { anchor: 1, head: 3 })).toBe(true);
    expect(sameSelection({ anchor: 3, head: 1 }, { anchor: 1, head: 3 })).toBe(false);
  });

  it("clamps offsets to the source bounds", () => {
    expect(clampSelectionToSource({ anchor: -5, head: 99 }, 10)).toEqual({ anchor: 0, head: 10 });
  });

  it("owns its selection independently from the caller input", () => {
    const input = { anchor: 1, head: 4 };
    const context = createSelectionContext(input);

    input.anchor = 9;

    expect(context.selection.anchor).toBe(1);
    expect(Object.isFrozen(context)).toBe(true);
  });
});
