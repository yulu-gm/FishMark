import { describe, expect, it } from "vitest";

import { decodePng, encodePng } from "./png";

describe("PNG codec", () => {
  it("round-trips an RGBA buffer", () => {
    const width = 8;
    const height = 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = (i * 3) & 0xff;
      rgba[i + 1] = (i * 7) & 0xff;
      rgba[i + 2] = (i * 11) & 0xff;
      rgba[i + 3] = 255;
    }

    const encoded = encodePng(rgba, width, height);
    const decoded = decodePng(encoded);

    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(Array.from(decoded.rgba)).toEqual(Array.from(rgba));
  });

  it("rejects buffers whose size does not match width*height*4", () => {
    expect(() => encodePng(new Uint8Array(10), 2, 2)).toThrow();
  });

  it("rejects non-PNG input", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
