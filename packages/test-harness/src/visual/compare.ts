/**
 * Pure-JS RGBA pixel comparison for visual tests (TASK-030).
 *
 * Platform-agnostic: used by both the CLI (node side, backed by on-disk PNG
 * baselines) and the workbench UI (browser side, backed by in-memory
 * buffers). No I/O, no PNG parsing, no node dependencies.
 *
 * The comparison is intentionally simple: per-pixel Manhattan distance over
 * RGBA channels, with an integer threshold per channel to tolerate minor
 * codec drift. A diff image is produced alongside the verdict so the
 * workbench and the CLI can render identical visuals.
 */

export type CompareOptions = {
  /** Per-channel absolute difference below which a pixel is considered matching. */
  readonly perChannelThreshold?: number;
  /** Maximum ratio of mismatched pixels that still counts as a match (0..1). */
  readonly maxMismatchRatio?: number;
};

export type CompareResult = {
  readonly matched: boolean;
  readonly width: number;
  readonly height: number;
  readonly totalPixels: number;
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  /** RGBA buffer, same dimensions. Matching pixels faded, mismatches bright red. */
  readonly diffRgba: Uint8Array;
};

export type SizeMismatch = {
  readonly kind: "size-mismatch";
  readonly actual: { readonly width: number; readonly height: number };
  readonly expected: { readonly width: number; readonly height: number };
};

export function compareRgba(
  actual: Uint8Array,
  expected: Uint8Array,
  width: number,
  height: number,
  options: CompareOptions = {}
): CompareResult {
  if (actual.length !== width * height * 4) {
    throw new Error(
      `actual buffer size ${actual.length} does not match ${width}x${height} RGBA (${width * height * 4}).`
    );
  }
  if (expected.length !== actual.length) {
    throw new Error(
      `expected buffer size ${expected.length} does not match actual ${actual.length}.`
    );
  }

  const perChannelThreshold = options.perChannelThreshold ?? 0;
  const maxMismatchRatio = options.maxMismatchRatio ?? 0;

  const totalPixels = width * height;
  const diff = new Uint8Array(totalPixels * 4);
  let mismatched = 0;

  for (let p = 0; p < totalPixels; p += 1) {
    const i = p * 4;
    const dr = Math.abs(actual[i]! - expected[i]!);
    const dg = Math.abs(actual[i + 1]! - expected[i + 1]!);
    const db = Math.abs(actual[i + 2]! - expected[i + 2]!);
    const da = Math.abs(actual[i + 3]! - expected[i + 3]!);
    const channelMax = Math.max(dr, dg, db, da);

    if (channelMax <= perChannelThreshold) {
      // Fade the expected pixel to ~30% luminance to signal "unchanged".
      const r = expected[i]!;
      const g = expected[i + 1]!;
      const b = expected[i + 2]!;
      const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const faded = Math.round(luma * 0.3 + 160);
      diff[i] = faded;
      diff[i + 1] = faded;
      diff[i + 2] = faded;
      diff[i + 3] = 255;
    } else {
      mismatched += 1;
      diff[i] = 255;
      diff[i + 1] = 0;
      diff[i + 2] = 0;
      diff[i + 3] = 255;
    }
  }

  const mismatchRatio = totalPixels === 0 ? 0 : mismatched / totalPixels;
  const matched = mismatchRatio <= maxMismatchRatio;

  return {
    matched,
    width,
    height,
    totalPixels,
    mismatchedPixels: mismatched,
    mismatchRatio,
    diffRgba: diff
  };
}
