import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runVisualCheck } from "./check";
import { decodePng, encodePng } from "./png";

function solid(width: number, height: number, rgba: readonly number[]): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) buf.set(rgba, p * 4);
  return buf;
}

describe("runVisualCheck", () => {
  let workspace: string;
  let baselineRoot: string;
  let artifactDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "yulora-visual-"));
    baselineRoot = join(workspace, "baselines");
    artifactDir = join(workspace, "run");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("creates a baseline on first run and returns baseline-created", () => {
    const rgba = solid(2, 2, [100, 120, 140, 255]);
    const result = runVisualCheck({
      scenarioId: "scen",
      stepId: "shot",
      width: 2,
      height: 2,
      actualRgba: rgba,
      baselineRoot,
      artifactDir
    });

    expect(result.verdict).toBe("baseline-created");
    expect(existsSync(result.baselinePath)).toBe(true);
    expect(result.actualPath && existsSync(result.actualPath)).toBe(true);
    expect(result.diffPath).toBeUndefined();
  });

  it("returns match on a byte-identical re-run without writing diff artifacts", () => {
    const rgba = solid(2, 2, [50, 60, 70, 255]);
    runVisualCheck({
      scenarioId: "scen",
      stepId: "shot",
      width: 2,
      height: 2,
      actualRgba: rgba,
      baselineRoot,
      artifactDir
    });
    const second = runVisualCheck({
      scenarioId: "scen",
      stepId: "shot",
      width: 2,
      height: 2,
      actualRgba: rgba,
      baselineRoot,
      artifactDir
    });
    expect(second.verdict).toBe("match");
    expect(second.diffPath).toBeUndefined();
    expect(second.expectedPath).toBeUndefined();
  });

  it("writes actual / expected / diff PNGs on mismatch", () => {
    const baselinePath = join(baselineRoot, "scen", "shot.png");
    const expectedBuffer = solid(2, 2, [0, 0, 0, 255]);
    // Pre-seed a baseline directly.
    const mkDirForBaseline = join(baselineRoot, "scen");
    // Use encodePng via a no-op first call to ensure parent dirs exist; then write manually.
    runVisualCheck({
      scenarioId: "scen",
      stepId: "shot",
      width: 2,
      height: 2,
      actualRgba: expectedBuffer,
      baselineRoot,
      artifactDir
    });
    expect(existsSync(mkDirForBaseline)).toBe(true);
    // Confirm baseline matches what we think it is.
    const baselineBytes = readFileSync(baselinePath);
    const decoded = decodePng(new Uint8Array(baselineBytes));
    expect(Array.from(decoded.rgba)).toEqual(Array.from(expectedBuffer));

    const drifted = solid(2, 2, [255, 255, 255, 255]);
    const result = runVisualCheck({
      scenarioId: "scen",
      stepId: "shot",
      width: 2,
      height: 2,
      actualRgba: drifted,
      baselineRoot,
      artifactDir
    });

    expect(result.verdict).toBe("mismatch");
    expect(result.actualPath && existsSync(result.actualPath)).toBe(true);
    expect(result.expectedPath && existsSync(result.expectedPath)).toBe(true);
    expect(result.diffPath && existsSync(result.diffPath)).toBe(true);
    expect(result.mismatchedPixels).toBe(4);

    // Diff PNG must be decodable and have the documented mismatch colour on at
    // least one pixel.
    const diffDecoded = decodePng(new Uint8Array(readFileSync(result.diffPath!)));
    expect(diffDecoded.rgba[0]).toBe(255);
    expect(diffDecoded.rgba[1]).toBe(0);
    expect(diffDecoded.rgba[2]).toBe(0);

    // Just proving encodePng continues to work alongside runVisualCheck here.
    expect(encodePng(drifted, 2, 2).length).toBeGreaterThan(0);
  });
});
