/**
 * Deterministic synthetic gradient used by the `visual-smoke-gradient`
 * scenario (TASK-030).
 *
 * This stands in for a real Electron screenshot so we can exercise the full
 * visual-test flow — baseline, compare, diff, artifact layout — without the
 * Electron driver yet existing. `drift` shifts the red channel to guarantee
 * a mismatch when we want to demo the failure path.
 */

export const VISUAL_SMOKE_WIDTH = 64;
export const VISUAL_SMOKE_HEIGHT = 64;

export type GradientOptions = {
  readonly drift?: boolean;
};

export function renderSmokeGradient(options: GradientOptions = {}): Uint8Array {
  const width = VISUAL_SMOKE_WIDTH;
  const height = VISUAL_SMOKE_HEIGHT;
  const rgba = new Uint8Array(width * height * 4);
  const drift = options.drift === true;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const baseR = Math.round((x / (width - 1)) * 255);
      const baseG = Math.round((y / (height - 1)) * 255);
      const baseB = Math.round(((x + y) / (width + height - 2)) * 255);
      rgba[i] = drift ? clamp8(baseR + 80) : baseR;
      rgba[i + 1] = baseG;
      rgba[i + 2] = baseB;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function clamp8(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}
