import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const createdDirectories: string[] = [];
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: {
    sync: {
      read: (buffer: Buffer) => {
        width: number;
        height: number;
        data: Buffer;
      };
    };
  };
};
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generate-icons script", () => {
  it("generates app icons from the shared FishMark mark source", () => {
    const scriptSource = readFileSync(path.join(process.cwd(), "scripts", "generate-icons.mjs"), "utf8");
    const sharedMarkPath = path.join(process.cwd(), "assets", "branding", "fishmark_mark.svg");

    expect(existsSync(sharedMarkPath)).toBe(true);
    expect(scriptSource).toContain("assets/branding/fishmark_mark.svg");
  });

  it("creates PNG and ICO assets for both FishMark logo variants", () => {
    const outputDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-icons-"));
    createdDirectories.push(outputDirectory);

    const result = spawnSync(
      process.execPath,
      ["scripts/generate-icons.mjs", "--out-dir", outputDirectory],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30000
      }
    );

    expect(result.status).toBe(0);

    for (const variant of ["light", "dark"]) {
      for (const size of PNG_SIZES) {
        expect(existsSync(path.join(outputDirectory, variant, `icon-${size}.png`))).toBe(true);
      }

      const icoPath = path.join(outputDirectory, variant, "icon.ico");
      expect(existsSync(icoPath)).toBe(true);
      expect(readIcoSizes(icoPath)).toEqual(ICO_SIZES);
    }
  }, 30000);

  it("renders the light icon with a high contrast mark fill", () => {
    const outputDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-icons-fill-"));
    createdDirectories.push(outputDirectory);

    const result = spawnSync(
      process.execPath,
      ["scripts/generate-icons.mjs", "--out-dir", outputDirectory],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30000
      }
    );

    expect(result.status).toBe(0);

    const image = PNG.sync.read(readFileSync(path.join(outputDirectory, "light", "icon-512.png")));
    const markOffset = (Math.floor(image.height * 0.25) * image.width + Math.floor(image.width * 0.5)) * 4;
    const fishOffset = (260 * image.width + 180) * 4;

    expect(image.data[markOffset]).toBeLessThanOrEqual(32);
    expect(image.data[markOffset + 1]).toBeLessThanOrEqual(32);
    expect(image.data[markOffset + 2]).toBeLessThanOrEqual(48);
    expect(image.data[markOffset + 3]).toBe(255);
    expect(image.data[fishOffset]).toBeGreaterThanOrEqual(240);
    expect(image.data[fishOffset + 1]).toBeGreaterThanOrEqual(240);
    expect(image.data[fishOffset + 2]).toBeGreaterThanOrEqual(240);
    expect(image.data[fishOffset + 3]).toBe(255);
  }, 30000);

  it("does not leave icon generation blocked in ICO conversion", () => {
    const outputDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-icons-fast-"));
    createdDirectories.push(outputDirectory);

    const result = spawnSync(
      process.execPath,
      ["scripts/generate-icons.mjs", "--out-dir", outputDirectory],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5000
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Generated icon assets");
  }, 10000);
});

function readIcoSizes(icoPath: string): number[] {
  const ico = readFileSync(icoPath);
  const count = ico.readUInt16LE(4);
  const sizes: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = ico.readUInt8(entryOffset) || 256;
    const height = ico.readUInt8(entryOffset + 1) || 256;

    expect(height).toBe(width);
    sizes.push(width);
  }

  return sizes;
}
