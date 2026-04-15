import { describe, expect, it } from "vitest";

import { compareRgba } from "./compare";

function solid(width: number, height: number, rgba: readonly number[]): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    buf.set(rgba, p * 4);
  }
  return buf;
}

describe("compareRgba", () => {
  it("matches identical buffers with zero mismatches", () => {
    const a = solid(4, 4, [10, 20, 30, 255]);
    const b = solid(4, 4, [10, 20, 30, 255]);
    const result = compareRgba(a, b, 4, 4);
    expect(result.matched).toBe(true);
    expect(result.mismatchedPixels).toBe(0);
    expect(result.mismatchRatio).toBe(0);
    expect(result.diffRgba.length).toBe(4 * 4 * 4);
  });

  it("marks mismatched pixels in bright red on the diff", () => {
    const actual = solid(2, 1, [0, 0, 0, 255]);
    const expected = solid(2, 1, [0, 0, 0, 255]);
    // Mutate pixel 0 in actual.
    actual[0] = 255;
    actual[1] = 255;
    actual[2] = 255;
    const result = compareRgba(actual, expected, 2, 1);
    expect(result.matched).toBe(false);
    expect(result.mismatchedPixels).toBe(1);
    expect(result.diffRgba[0]).toBe(255);
    expect(result.diffRgba[1]).toBe(0);
    expect(result.diffRgba[2]).toBe(0);
    expect(result.diffRgba[3]).toBe(255);
    // The untouched pixel is faded, not red.
    expect(result.diffRgba[4 + 0]).not.toBe(255);
  });

  it("honors perChannelThreshold", () => {
    const actual = solid(1, 1, [10, 10, 10, 255]);
    const expected = solid(1, 1, [12, 10, 10, 255]);
    const strict = compareRgba(actual, expected, 1, 1);
    expect(strict.matched).toBe(false);
    const lenient = compareRgba(actual, expected, 1, 1, { perChannelThreshold: 2 });
    expect(lenient.matched).toBe(true);
  });

  it("throws on size mismatch", () => {
    const a = new Uint8Array(4);
    const b = new Uint8Array(8);
    expect(() => compareRgba(a, b, 1, 1)).toThrow();
  });
});
