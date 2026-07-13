import { describe, expect, it } from "vitest";

import { createExecutionPlan } from "../../../../fixtures/editor-behavior/execution-plan";
import { recursiveParityMatrixCases } from "../../../../fixtures/editor-behavior/nested-containers";
import {
  compareEditorBehaviorObservations,
  type EditorBehaviorCheckpointObservation,
  type EditorBehaviorKnownDefectObservation
} from "../../../../fixtures/editor-behavior/runner-protocol";

function compileTimeTypeAssertions(): void {
  const invalidSelection: EditorBehaviorKnownDefectObservation<"selection"> = {
    caseId: "compile-only",
    checkpoint: "primary",
    aspect: "selection",
    // @ts-expect-error A selection observation cannot be represented by a string.
    observed: "invalid selection",
    reason: "compile-only negative assertion"
  };
  void invalidSelection;
}
void compileTimeTypeAssertions;

describe("typed editor behavior observations", () => {
  it("rejects an invalid aspect value even when an untyped caller bypasses TypeScript", () => {
    const behaviorCase = recursiveParityMatrixCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);
    const observations: readonly EditorBehaviorCheckpointObservation[] =
      behaviorCase.checkpoints.map((checkpoint) => ({
        runId: "runtime-shape-test",
        manifestHash: plan.manifestHash,
        contractHash: plan.contractHash,
        caseId: behaviorCase.id,
        checkpoint: checkpoint.id,
        commandPlan: checkpoint.actions,
        semanticPath: checkpoint.result.semanticPath,
        rawSemanticPath: checkpoint.result.semanticPath,
        source: checkpoint.result.source,
        selection: checkpoint.result.selection,
        visibleLineRoles: checkpoint.result.visibleLines.map(({ role }) => role),
        physicalGeometry: checkpoint.result.visibleLines.map(
          ({ line, sourceText, geometry }) => ({ line, sourceText, geometry })
        ),
        lineDomMappings: [],
        viewMode: checkpoint.result.viewMode,
        trace: []
      }));
    const invalidDefect = [{
      caseId: behaviorCase.id,
      checkpoint: "primary",
      aspect: "selection",
      observed: "invalid selection",
      reason: "Runtime validation must reject this value."
    }] as unknown as readonly EditorBehaviorKnownDefectObservation[];

    expect(() =>
      compareEditorBehaviorObservations([behaviorCase], observations, invalidDefect)
    ).toThrow(/invalid selection value/u);
  });
});
