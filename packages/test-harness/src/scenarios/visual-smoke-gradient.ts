import type { TestScenario } from "../scenario";

/**
 * Visual smoke scenario (TASK-030).
 *
 * Stands up the full visual-test pipeline end-to-end without requiring a
 * real Electron screenshot: a deterministic gradient is rendered in the
 * `render-gradient` step and checked against its on-disk baseline in the
 * `compare-gradient` step. The CLI handler may set `YULORA_VISUAL_DRIFT=1`
 * to deliberately shift the gradient and exercise the mismatch path.
 */
export const visualSmokeGradientScenario: TestScenario = {
  id: "visual-smoke-gradient",
  title: "Visual smoke gradient captured and diffed",
  summary:
    "Renders a deterministic RGBA gradient and verifies it against the committed baseline; writes actual / expected / diff artifacts on mismatch.",
  surface: "workbench",
  tags: ["visual", "smoke", "workbench"],
  preconditions: [
    "Baselines live under tests/visual-baselines/<scenario-id>/<step-id>.png (auto-created on first run)"
  ],
  steps: [
    {
      id: "render-gradient",
      title: "Render the synthetic RGBA gradient",
      kind: "setup",
      description:
        "Produces a 64x64 gradient so the visual pipeline has a deterministic input to compare."
    },
    {
      id: "compare-gradient",
      title: "Compare the gradient against the baseline",
      kind: "assertion",
      description:
        "Writes actual / expected / diff PNGs under the run artifact dir when the pixel diff exceeds the threshold."
    }
  ]
};
