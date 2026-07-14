import { describe, expect, it } from "vitest";

import {
  canonicalEditorBehaviorCorpusSource,
  type EditorBehaviorCorpusSource
} from "../../../../fixtures/editor-behavior/corpus";
import {
  createEditorBehaviorFormalRun
} from "../../../../fixtures/editor-behavior/formal-run-port";

describe("formal editor behavior run port", () => {
  it.each([
    {
      name: "stale calibration hash",
      source: sourceWith({
        calibration: {
          ...canonicalEditorBehaviorCorpusSource.calibration,
          calibrationHash: "fnv1a32-stale"
        }
      }),
      error: /calibration hash/u
    },
    {
      name: "wrong run id",
      source: sourceWith({
        calibration: {
          ...canonicalEditorBehaviorCorpusSource.calibration,
          runId: "wrong-formal-run"
        }
      }),
      error: /calibration hash/u
    },
    {
      name: "stale desired contract",
      source: sourceWith({
        calibration: {
          ...canonicalEditorBehaviorCorpusSource.calibration,
          contractHash: "fnv1a32-stale"
        }
      }),
      error: /contract hash/u
    },
    {
      name: "missing calibrated target",
      source: sourceWith({
        verifiedTargets: canonicalEditorBehaviorCorpusSource.verifiedTargets.slice(1)
      }),
      error: /covers \d+\/\d+ targets/u
    }
  ])("rejects $name before exposing execution data", ({ source, error }) => {
    expect(() => createEditorBehaviorFormalRun(new URLSearchParams(), source)).toThrow(error);
  });

  it("exposes only sanitized execution data plus the owner comparison port", () => {
    const formalRun = createEditorBehaviorFormalRun(new URLSearchParams());

    expect(Object.keys(formalRun).sort()).toEqual(["compare", "executionPlan"]);
    expect(formalRun.executionPlan.cases).toHaveLength(121);
    expect(formalRun.executionPlan.cases[0]).not.toHaveProperty("classification");
    expect(formalRun.executionPlan.cases[0]?.checkpoints[0]).not.toHaveProperty("result");
  });
});

function sourceWith(
  overrides: Partial<EditorBehaviorCorpusSource>
): EditorBehaviorCorpusSource {
  return {
    ...canonicalEditorBehaviorCorpusSource,
    ...overrides
  };
}
