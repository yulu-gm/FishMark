import { describe, expect, it } from "vitest";
import { createRuntimePhaseTiming } from "./runtime-phase-timing";

describe("runtime phase diagnostic accounting", () => {
  it("subtracts only direct nested children and accounts for siblings", () => {
    const clocks = [0, 1, 2, 4, 6, 7, 9, 12];
    const timing = createRuntimePhaseTiming(() => clocks.shift()!);
    timing.startSample();
    const root = timing.begin("root");
    const child = timing.begin("child");
    const nested = timing.begin("nested");
    timing.end(nested);
    timing.end(child);
    const sibling = timing.begin("sibling");
    timing.end(sibling);
    timing.end(root);
    const spans = timing.finishSample();
    expect(spans.map(s => s.parentId)).toEqual([null, 0, 1, 0]);
    expect(spans.map(s => s.inclusiveMs)).toEqual([12, 5, 2, 2]);
    expect(spans.map(s => s.exclusiveMs)).toEqual([5, 3, 2, 2]);
    expect(spans.reduce((sum, s) => sum + s.exclusiveMs!, 0)).toBe(12);
  });

  it("ignores calls outside a sample and keeps samples separate", () => {
    let tick = 0;
    const timing = createRuntimePhaseTiming(() => tick++);
    expect(timing.begin("inactive")).toBeUndefined();
    timing.end(undefined);
    timing.startSample();
    timing.end(timing.begin("first"));
    const first = timing.finishSample();
    timing.startSample();
    timing.end(timing.begin("second"));
    const second = timing.finishSample();
    expect(first.map(s => s.label)).toEqual(["first"]);
    expect(second.map(s => s.label)).toEqual(["second"]);
    expect(second[0]?.id).toBe(0);
  });

  it("rejects an open stack instead of claiming a completed sample", () => {
    const timing = createRuntimePhaseTiming(() => 0);
    timing.startSample();
    timing.begin("open");
    expect(() => timing.finishSample()).toThrow("Incomplete");
  });
});
