import { describe, expect, it } from "vitest";

import {
  computeEditorRevealDelta,
  editorRevealOptionsFor
} from "./viewport-reveal";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
});

describe("editor viewport reveal policy", () => {
  it("preserves the viewport when a clicked target is already visible", () => {
    expect(
      computeEditorRevealDelta(
        rect(20, 140, 120, 24),
        rect(0, 100, 600, 200),
        "preserve"
      )
    ).toEqual({ top: 0, left: 0 });
  });

  it("uses the smallest correction when a preserve target is clipped", () => {
    expect(
      computeEditorRevealDelta(
        rect(20, 330, 120, 24),
        rect(0, 100, 600, 200),
        "preserve"
      )
    ).toEqual({ top: 54, left: 0 });
  });

  it("keeps a comfort margin for continuous keyboard navigation", () => {
    expect(
      computeEditorRevealDelta(
        rect(20, 330, 120, 24),
        rect(0, 100, 600, 200),
        "nearest"
      )
    ).toEqual({ top: 78, left: 0 });
  });

  it("centers explicit navigation targets while keeping horizontal motion minimal", () => {
    expect(
      computeEditorRevealDelta(
        rect(20, 260, 120, 24),
        rect(0, 100, 600, 200),
        "navigate"
      )
    ).toEqual({ top: 72, left: 0 });
  });

  it("maps offset reveal intents onto the same preserve/nearest/navigate policy", () => {
    expect(editorRevealOptionsFor("preserve")).toEqual({
      y: "nearest",
      x: "nearest",
      yMargin: 0,
      xMargin: 0
    });
    expect(editorRevealOptionsFor("nearest")).toEqual({
      y: "nearest",
      x: "nearest",
      yMargin: 24,
      xMargin: 16
    });
    expect(editorRevealOptionsFor("navigate")).toEqual({
      y: "center",
      x: "nearest",
      yMargin: 24,
      xMargin: 16
    });
  });
});
