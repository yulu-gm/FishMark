import { existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const createdDirectories: string[] = [];

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generate-icons script", () => {
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
      for (const size of [32, 64, 128, 256, 512]) {
        expect(existsSync(path.join(outputDirectory, variant, `icon-${size}.png`))).toBe(true);
      }

      expect(existsSync(path.join(outputDirectory, variant, "icon.ico"))).toBe(true);
    }
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
