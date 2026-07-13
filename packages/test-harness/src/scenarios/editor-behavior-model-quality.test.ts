import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createEvidence,
  defineEditorBehaviorCase,
  editorBehaviorAspects,
  editorBehaviorCases,
  editorBehaviorCheckpointIds,
  physicalLineExpectations,
  replaceEvidenceGaps,
  recursiveParityMatrixCases,
  sourceSelection
} from "../../../../fixtures/editor-behavior/manifest";
import { createHeadlessStepHandlers } from "../handlers/headless";
import { editorBehaviorMatrixScenario } from "./editor-behavior-matrix";

describe("RF-001 executable behavior model", () => {
  it("stores the canonical fixture implementation at the repository root", () => {
    const root = process.cwd();
    const canonicalDirectory = path.join(root, "fixtures", "editor-behavior");
    const formerHarnessDirectory = path.join(
      root,
      "packages",
      "test-harness",
      "src",
      "scenarios",
      "editor-behavior"
    );

    for (const file of [
      "fishmark-probe-catalog.ts",
      "manifest.ts",
      "model.ts",
      "nested-containers.ts",
      "probe-cases.ts"
    ]) {
      expect(existsSync(path.join(canonicalDirectory, file)), file).toBe(true);
    }
    expect(existsSync(formerHarnessDirectory)).toBe(false);
    expect(readFileSync(path.join(canonicalDirectory, "manifest.ts"), "utf8")).not.toContain(
      "packages/test-harness"
    );
  });

  it("defines an executable, ordered primary/repeat/undo timeline for every case", () => {
    expect(editorBehaviorCases).toHaveLength(121);

    for (const behaviorCase of editorBehaviorCases) {
      expect(behaviorCase.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(
        editorBehaviorCheckpointIds
      );
      expect(behaviorCase.checkpoints[0].from).toBe("initial");
      expect(behaviorCase.checkpoints[1].from).toBe("primary");
      expect(["primary", "repeat"]).toContain(behaviorCase.checkpoints[2].from);
      expect(behaviorCase.checkpoints.every((checkpoint) => checkpoint.actions.length > 0)).toBe(
        true
      );
      expect(behaviorCase.checkpoints[2].actions).toContainEqual({ kind: "undo" });
    }

    const compound = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "empty-spaces-enter-text"
    )!;
    expect(compound.checkpoints[0].actions).toEqual([
      { kind: "press-key", key: "Enter" },
      { kind: "insert-text", text: "abc" }
    ]);
    expect(compound.checkpoints[2].actions).toEqual([{ kind: "undo" }, { kind: "undo" }]);

    expect(JSON.stringify(editorBehaviorCases)).not.toMatch(/operationCount|viewModeContract/);
  });

  it("accounts for every checkpoint/aspect target with exactly one evidence state", () => {
    for (const behaviorCase of editorBehaviorCases) {
      for (const checkpoint of editorBehaviorCheckpointIds) {
        expect(Object.keys(behaviorCase.classification.evidence[checkpoint]).sort()).toEqual(
          [...editorBehaviorAspects].sort()
        );
        for (const aspect of editorBehaviorAspects) {
          const state = behaviorCase.classification.evidence[checkpoint][aspect];
          expect(["gap", "verified"]).toContain(state.status);
          if (state.status === "gap") {
            expect(state.reason.trim()).not.toBe("");
          } else {
            expect(state.provenance).toBeDefined();
          }
        }
      }
    }
  });

  it("atomically replaces typed gap observations and recomputes status", () => {
    const original = recursiveParityMatrixCases[0]!;
    const expectedSource = original.checkpoints[0].result.source;
    const updated = replaceEvidenceGaps(original, [
      {
        checkpoint: "primary",
        aspect: "source",
        observed: expectedSource,
        provenance: {
          kind: "repository-test",
          file: "packages/test-harness/src/scenarios/editor-behavior-model-quality.test.ts",
          testName: "atomically replaces typed gap observations and recomputes status"
        }
      }
    ]);

    expect(original.classification.evidence.primary.source.status).toBe("gap");
    expect(updated).not.toBe(original);
    expect(updated.classification.evidence.primary.source.status).toBe("verified");
    expect(updated.classification.currentStatus).toBe("partially-verified");

    expect(() =>
      replaceEvidenceGaps(original, [
        {
          checkpoint: "primary",
          aspect: "source",
          observed: expectedSource,
          provenance: {
            kind: "repository-test",
            file: "fixture.test.ts",
            testName: "first"
          }
        },
        {
          checkpoint: "primary",
          aspect: "source",
          observed: expectedSource,
          provenance: {
            kind: "repository-test",
            file: "fixture.test.ts",
            testName: "duplicate"
          }
        }
      ])
    ).toThrow(/duplicate evidence target/i);
    expect(original.classification.evidence.primary.source.status).toBe("gap");

    const structural = recursiveParityMatrixCases.find(
      (behaviorCase) =>
        behaviorCase.command === "Shift+Tab" &&
        behaviorCase.checkpoints[0].result.semanticPath.length < behaviorCase.containerPath.length
    )!;
    expect(structural.checkpoints[0].result.semanticPath).not.toEqual(structural.containerPath);
    expect(
      replaceEvidenceGaps(structural, [
        {
          checkpoint: "primary",
          aspect: "semantic-path",
          observed: structural.checkpoints[0].result.semanticPath,
          provenance: {
            kind: "repository-test",
            file: "fixture.test.ts",
            testName: "checkpoint semantic path"
          }
        }
      ]).classification.evidence.primary["semantic-path"].status
    ).toBe("verified");
    expect(() =>
      replaceEvidenceGaps(structural, [
        {
          checkpoint: "primary",
          aspect: "semantic-path",
          observed: structural.containerPath,
          provenance: {
            kind: "repository-test",
            file: "fixture.test.ts",
            testName: "stale case path"
          }
        }
      ])
    ).toThrow(/does not match the expected primary:semantic-path/i);
  });

  it("rejects empty evidence payloads and invalid action plans", () => {
    expect(() => createEvidence({ gapReason: "   " })).toThrow(/gap reason must not be empty/i);
    expect(() =>
      createEvidence({
        gapReason: "not observed",
        verifiedTargets: [
          {
            checkpoint: "primary",
            aspect: "source",
            provenance: { kind: "repository-test", file: "", testName: "source assertion" }
          }
        ]
      })
    ).toThrow(/test file must not be empty/i);
    const provenance = {
      kind: "repository-test" as const,
      file: "fixture.test.ts",
      testName: "source assertion"
    };
    expect(() =>
      createEvidence({
        gapReason: "not observed",
        verifiedTargets: [
          { checkpoint: "primary", aspect: "source", provenance },
          { checkpoint: "primary", aspect: "source", provenance }
        ]
      })
    ).toThrow(/duplicate evidence target/i);
    expect(() =>
      createEvidence({
        gapReason: "not observed",
        verifiedTargets: [
          {
            checkpoint: "primary",
            aspect: "command-plan",
            provenance: {
              kind: "fishmark-probe",
              probeCaseId: "empty-type-hash",
              assertion: "not a catalog capability"
            }
          }
        ]
      })
    ).toThrow(/does not declare capability primary:command-plan/i);

    const enterCase = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.command === "Enter"
    )!;
    expect(() =>
      defineEditorBehaviorCase({
        ...enterCase,
        checkpoints: [
          {
            ...enterCase.checkpoints[0],
            actions: [{ kind: "press-key", key: "Backspace" }]
          },
          enterCase.checkpoints[1],
          enterCase.checkpoints[2]
        ]
      })
    ).toThrow(/actions do not match Enter/i);

    const selectionCase = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.command === "selection"
    )!;
    expect(() =>
      defineEditorBehaviorCase({
        ...selectionCase,
        checkpoints: [
          {
            ...selectionCase.checkpoints[0],
            actions: [
              {
                kind: "set-selection",
                target: sourceSelection(selectionCase.initial.source.length + 1)
              }
            ]
          },
          selectionCase.checkpoints[1],
          selectionCase.checkpoints[2]
        ]
      })
    ).toThrow(/selection action selection is outside its source/i);
  });

  it("treats code and math bodies as opaque after stripping their outer containers", () => {
    const code = physicalLineExpectations(
      "> - ```txt\n>   $$\n>   - literal\n>   ```\n> - outside",
      sourceSelection(0),
      "wysiwym"
    );
    expect(code.map((line) => [line.role, line.geometry.semanticDepth])).toEqual([
      ["code-fence-delimiter", 2],
      ["code-fence-content", 2],
      ["code-fence-content", 2],
      ["code-fence-delimiter", 2],
      ["content", 2]
    ]);

    const math = physicalLineExpectations(
      "- > $$\n  > ```\n  > - literal\n  > $$\n- outside",
      sourceSelection(0),
      "wysiwym"
    );
    expect(math.map((line) => [line.role, line.geometry.semanticDepth])).toEqual([
      ["block-math-delimiter", 2],
      ["block-math-content", 2],
      ["block-math-content", 2],
      ["block-math-delimiter", 2],
      ["content", 1]
    ]);
  });

  it("records source text and valid physical geometry on every result line", () => {
    for (const behaviorCase of editorBehaviorCases) {
      for (const result of [
        behaviorCase.initial,
        ...behaviorCase.checkpoints.map((checkpoint) => checkpoint.result)
      ]) {
        const sourceLines = result.source.split("\n");
        expect(result.semanticPath[0]).toBe("Document");
        expect(result.semanticPath.length).toBeGreaterThan(1);
        expect(result.visibleLines).toHaveLength(sourceLines.length);
        result.visibleLines.forEach((line, index) => {
          expect(line.line).toBe(index + 1);
          expect(line.sourceText).toBe(sourceLines[index]);
          expect(line.geometry.semanticDepth).toBeGreaterThanOrEqual(0);
          expect(line.geometry.contentColumn).toBeGreaterThanOrEqual(0);
          expect(line.geometry.contentColumn).toBeLessThanOrEqual(line.sourceText.length);
          if (line.geometry.markerColumn !== null) {
            expect(line.geometry.markerColumn).toBeGreaterThanOrEqual(0);
            expect(line.geometry.markerColumn).toBeLessThan(line.geometry.contentColumn);
          }
        });
      }
    }
  });
});

describe("scenario execution capability", () => {
  it("rejects metadata-only scenarios without inspecting their id", () => {
    expect(editorBehaviorMatrixScenario.execution).toEqual({
      kind: "metadata-only",
      reason:
        "The shared editor driver has not been implemented for typed RF-001 checkpoint assertions."
    });
    const firstStep = editorBehaviorMatrixScenario.steps[0]!;
    const handler = createHeadlessStepHandlers(editorBehaviorMatrixScenario)[firstStep.id]!;
    expect(() =>
      handler({
        scenarioId: editorBehaviorMatrixScenario.id,
        step: firstStep,
        signal: new AbortController().signal
      })
    ).toThrow(/metadata-only/i);
  });
});
