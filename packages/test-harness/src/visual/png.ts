/**
 * Minimal RGBA PNG codec for visual baselines (TASK-030).
 *
 * Uses node:zlib for deflate / inflate so we do not add a runtime dependency.
 * Only the feature set the CLI needs is supported: 8-bit RGBA, filter type 0
 * (None), no interlacing. Encountering any other variant is treated as an
 * unsupported-baseline configuration error — we would rather fail loudly than
 * silently mis-read an external PNG.
 */

import { deflateSync, inflateSync } from "node:zlib";

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type DecodedPng = {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
};

export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePng: buffer ${rgba.length} does not match ${width}x${height} RGBA.`
    );
  }

  const stride = width * 4;
  const filtered = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0; // filter: None
    filtered.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const idatData = deflateSync(filtered);

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [
    buildChunk("IHDR", ihdr),
    buildChunk("IDAT", idatData),
    buildChunk("IEND", new Uint8Array(0))
  ];

  let total = PNG_SIGNATURE.length;
  for (const chunk of chunks) total += chunk.length;

  const out = new Uint8Array(total);
  out.set(PNG_SIGNATURE, 0);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  if (bytes.length < 8) {
    throw new Error("decodePng: input too short for PNG signature.");
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("decodePng: invalid PNG signature.");
    }
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];
  let sawIhdr = false;
  let sawIend = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error("decodePng: truncated chunk header.");
    }
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`decodePng: truncated chunk ${type}.`);
    }
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      if (length !== 13) {
        throw new Error("decodePng: IHDR has unexpected length.");
      }
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      const bitDepth = data[8]!;
      const colorType = data[9]!;
      const compression = data[10]!;
      const filter = data[11]!;
      const interlace = data[12]!;
      if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error(
          `decodePng: unsupported PNG variant (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}). Only 8-bit RGBA, non-interlaced is supported.`
        );
      }
      sawIhdr = true;
    } else if (type === "IDAT") {
      idatParts.push(new Uint8Array(data));
    } else if (type === "IEND") {
      sawIend = true;
    }
    // Other ancillary chunks are ignored.

    offset = dataEnd + 4; // skip CRC
  }

  if (!sawIhdr) throw new Error("decodePng: missing IHDR.");
  if (!sawIend) throw new Error("decodePng: missing IEND.");

  const totalIdat = idatParts.reduce((acc, part) => acc + part.length, 0);
  const idat = new Uint8Array(totalIdat);
  let idatOffset = 0;
  for (const part of idatParts) {
    idat.set(part, idatOffset);
    idatOffset += part.length;
  }
  const inflated = new Uint8Array(inflateSync(idat));

  const stride = width * 4;
  const expectedLen = height * (stride + 1);
  if (inflated.length !== expectedLen) {
    throw new Error(
      `decodePng: inflated size ${inflated.length} does not match expected ${expectedLen}.`
    );
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)]!;
    if (filter !== 0) {
      throw new Error(
        `decodePng: filter type ${filter} on row ${y} is not supported. Only None (0) is handled.`
      );
    }
    rgba.set(
      inflated.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride),
      y * stride
    );
  }

  return { width, height, rgba };
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) typeBytes[i] = type.charCodeAt(i);

  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  writeUint32BE(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32BE(chunk, 8 + data.length, crc);
  return chunk;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! << 24) |
    (buf[offset + 1]! << 16) |
    (buf[offset + 2]! << 8) |
    buf[offset + 3]!
  ) >>> 0;
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
