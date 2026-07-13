import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFishMarkProbeProvenance,
  assertFishMarkProbeCaseBindings,
  createEvidence,
  createEditorBehaviorEvidenceObservation,
  createFishMarkProbeProvenance,
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
    const manifestSource = readFileSync(path.join(canonicalDirectory, "manifest.ts"), "utf8");
    expect(manifestSource).not.toContain("packages/test-harness");
    expect(manifestSource).toContain("assertFishMarkProbeCaseBindings");

    const modelSource = readFileSync(path.join(canonicalDirectory, "model.ts"), "utf8");
    const harnessIndexSource = readFileSync(
      path.join(root, "packages", "test-harness", "src", "index.ts"),
      "utf8"
    );
    const matrixScenarioSource = readFileSync(
      path.join(
        root,
        "packages",
        "test-harness",
        "src",
        "scenarios",
        "editor-behavior-matrix.ts"
      ),
      "utf8"
    );
    expect(modelSource).not.toMatch(/fishmark-probe-catalog/u);
    expect(harnessIndexSource).not.toMatch(
      /EditorBehaviorCase|editorBehaviorCases|replaceEvidenceGaps/u
    );
    expect(matrixScenarioSource).not.toMatch(
      /export \{ editorBehaviorCases|export type \{ EditorBehaviorCaseQuery/u
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
          expect(["verified", "known-defect-observed"]).toContain(state.status);
          if (state.status !== "gap") {
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
      createEditorBehaviorEvidenceObservation({
        caseId: original.id,
        checkpoint: "primary",
        aspect: "source",
        observed: expectedSource,
        provenance: {
          kind: "repository-test",
          caseId: original.id,
          checkpoint: "primary",
          aspect: "source",
          file: "packages/test-harness/src/scenarios/editor-behavior-model-quality.test.ts",
          testName: "atomically replaces typed gap observations and recomputes status"
        }
      })
    ]);

    expect(original.classification.evidence.primary.source.status).toBe("gap");
    expect(updated).not.toBe(original);
    expect(updated.classification.evidence.primary.source.status).toBe("verified");
    expect(updated.classification.currentStatus).toBe("partially-verified");

    expect(() =>
      replaceEvidenceGaps(original, [
        {
          caseId: original.id,
          checkpoint: "primary",
          aspect: "source",
          observed: expectedSource,
          provenance: {
            kind: "repository-test",
            caseId: original.id,
            checkpoint: "primary",
            aspect: "source",
            file: "fixture.test.ts",
            testName: "first"
          }
        },
        {
          caseId: original.id,
          checkpoint: "primary",
          aspect: "source",
          observed: expectedSource,
          provenance: {
            kind: "repository-test",
            caseId: original.id,
            checkpoint: "primary",
            aspect: "source",
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
          caseId: structural.id,
          checkpoint: "primary",
          aspect: "semantic-path",
          observed: structural.checkpoints[0].result.semanticPath,
          provenance: {
            kind: "repository-test",
            caseId: structural.id,
            checkpoint: "primary",
            aspect: "semantic-path",
            file: "fixture.test.ts",
            testName: "checkpoint semantic path"
          }
        }
      ]).classification.evidence.primary["semantic-path"].status
    ).toBe("verified");
    expect(() =>
      replaceEvidenceGaps(structural, [
        {
          caseId: structural.id,
          checkpoint: "primary",
          aspect: "semantic-path",
          observed: structural.containerPath,
          provenance: {
            kind: "repository-test",
            caseId: structural.id,
            checkpoint: "primary",
            aspect: "semantic-path",
            file: "fixture.test.ts",
            testName: "stale case path"
          }
        }
      ])
    ).toThrow(/does not match the expected primary:semantic-path/i);
  });

  it("rejects same-value observations and provenance from another behavior case", () => {
    const target = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "list-item-start-backspace"
    )!;
    const foreign = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "empty-type-hash"
    )!;
    const foreignRoles = foreign.checkpoints[0].result.visibleLines.map(({ role }) => role);

    expect(foreignRoles).toEqual(
      target.checkpoints[0].result.visibleLines.map(({ role }) => role)
    );
    expect(() =>
      replaceEvidenceGaps(target, [
        {
          caseId: foreign.id,
          checkpoint: "primary",
          aspect: "visible-line-roles",
          observed: foreignRoles,
          provenance: {
            kind: "fishmark-probe",
            caseId: foreign.id,
            checkpoint: "primary",
            aspect: "visible-line-roles",
            probeCaseId: "empty-type-hash",
            assertion:
              "src/renderer/markdown-editing-experience-probe.ts:runEmptyTypeHashCase: The probe pass condition checks the visible role oracle for every physical line in this checkpoint."
          }
        } as Parameters<typeof replaceEvidenceGaps>[1][number]
      ])
    ).toThrow(/case.*does not match|does not belong to case/i);

    const foreignEvidence = foreign.classification.evidence.primary["visible-line-roles"];
    expect(foreignEvidence.status).toBe("verified");
    if (foreignEvidence.status !== "verified") {
      throw new Error("Test fixture must carry the named-probe role provenance.");
    }
    const probeProvenance = foreignEvidence.provenance;
    expect(probeProvenance.kind).toBe("fishmark-probe");
    if (probeProvenance.kind !== "fishmark-probe") {
      throw new Error("Test fixture must carry FishMark probe provenance.");
    }
    expect(() =>
      replaceEvidenceGaps(target, [
        {
          caseId: target.id,
          checkpoint: "primary",
          aspect: "visible-line-roles",
          observed: foreignRoles,
          provenance: {
            ...probeProvenance,
            caseId: target.id
          }
        }
      ])
    ).toThrow(/catalog-owned|probe.*classification|probe.*case/i);

    expect(() =>
      assertFishMarkProbeProvenance(
        {
          caseId: foreign.id,
          checkpoint: "primary",
          aspect: "visible-line-roles"
        },
        {
          ...probeProvenance,
          assertion: `${probeProvenance.assertion} forged`
        }
      )
    ).toThrow(/does not match catalog capability/i);

    expect(() =>
      replaceEvidenceGaps(foreign, [
        {
          caseId: foreign.id,
          checkpoint: "primary",
          aspect: "command-plan",
          observed: foreign.checkpoints[0].actions,
          provenance: {
            kind: "fishmark-probe",
            caseId: foreign.id,
            checkpoint: "primary",
            aspect: "command-plan",
            probeCaseId: "empty-type-hash",
            assertion: "forged undeclared capability"
          }
        }
      ])
    ).toThrow(/catalog-owned|dynamic.*probe|probe.*observation/i);
  });

  it("uses structural equality and rejects non-finite observation geometry", () => {
    const behaviorCase = recursiveParityMatrixCases.find(
      (candidate) =>
        candidate.classification.evidence.primary["physical-geometry"].status === "gap" &&
        candidate.checkpoints[0].result.visibleLines[0]?.geometry.markerColumn === null
    )!;
    const expectedGeometry = behaviorCase.checkpoints[0].result.visibleLines.map(
      ({ line, sourceText, geometry }) => ({ line, sourceText, geometry })
    );
    const malformedGeometry = expectedGeometry.map((line, index) =>
      index === 0
        ? {
            ...line,
            geometry: { ...line.geometry, markerColumn: Number.NaN }
          }
        : line
    );

    expect(JSON.stringify(malformedGeometry)).toBe(JSON.stringify(expectedGeometry));
    expect(() =>
      replaceEvidenceGaps(behaviorCase, [
        {
          caseId: behaviorCase.id,
          checkpoint: "primary",
          aspect: "physical-geometry",
          observed: malformedGeometry,
          provenance: {
            kind: "repository-test",
            caseId: behaviorCase.id,
            checkpoint: "primary",
            aspect: "physical-geometry",
            file: "fixture.test.ts",
            testName: "non-finite geometry is not exact evidence"
          }
        }
      ])
    ).toThrow(/finite|does not match the expected/i);
  });

  it("rejects empty evidence payloads and invalid action plans", () => {
    expect(() => createEvidence({ gapReason: "   " })).toThrow(/gap reason must not be empty/i);
    expect(() =>
      createEvidence({
        gapReason: "not observed",
        verifiedTargets: [
          {
            caseId: "invalid-repository-evidence",
            checkpoint: "primary",
            aspect: "source",
            provenance: {
              kind: "repository-test",
              caseId: "invalid-repository-evidence",
              checkpoint: "primary",
              aspect: "source",
              file: "",
              testName: "source assertion"
            }
          }
        ]
      })
    ).toThrow(/test file must not be empty/i);
    const provenance = {
      kind: "repository-test" as const,
      caseId: "duplicate-evidence",
      checkpoint: "primary" as const,
      aspect: "source" as const,
      file: "fixture.test.ts",
      testName: "source assertion"
    };
    expect(() =>
      createEvidence({
        gapReason: "not observed",
        verifiedTargets: [
          { caseId: "duplicate-evidence", checkpoint: "primary", aspect: "source", provenance },
          { caseId: "duplicate-evidence", checkpoint: "primary", aspect: "source", provenance }
        ]
      })
    ).toThrow(/duplicate evidence target/i);
    expect(() =>
      createFishMarkProbeProvenance({
        caseId: "empty-type-hash",
        checkpoint: "primary",
        aspect: "command-plan",
        probeCaseId: "empty-type-hash"
      })
    ).toThrow(/does not declare capability primary:command-plan/i);

    const unknownProbeCase = recursiveParityMatrixCases[0]!;
    expect(() =>
      assertFishMarkProbeCaseBindings([
        {
          ...unknownProbeCase,
          classification: {
            ...unknownProbeCase.classification,
            probeCaseId: "unknown-probe-id"
          }
        }
      ])
    ).toThrow(/unknown FishMark probe unknown-probe-id/i);

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

    const mismatchedQuotePrefix = physicalLineExpectations(
      "> ```\n- literal\n> ```",
      sourceSelection(0),
      "wysiwym"
    );
    expect(
      mismatchedQuotePrefix.map((line) => [
        line.role,
        line.geometry.semanticDepth,
        line.geometry.contentColumn,
        line.geometry.markerColumn
      ])
    ).toEqual([
      ["code-fence-delimiter", 1, 2, 0],
      ["content", 1, 2, 0],
      ["code-fence-delimiter", 1, 2, 0]
    ]);

    for (const source of [
      "> ~~~\n> body\n>~~~\nafter",
      " > ~~~\n> body\n> ~~~\nafter",
      "- > ~~~\n    > body\n    > ~~~\nafter"
    ]) {
      const equivalentPrefix = physicalLineExpectations(
        source,
        sourceSelection(0),
        "wysiwym"
      );
      expect(equivalentPrefix.map((line) => line.role), source).toEqual([
        "code-fence-delimiter",
        "code-fence-content",
        "code-fence-delimiter",
        "content"
      ]);
      expect(equivalentPrefix[3]?.geometry.semanticDepth, source).toBe(0);
    }

    const indentedClosing = physicalLineExpectations(
      "```\n    ```\n- literal\n```\nafter",
      sourceSelection(0),
      "wysiwym"
    );
    expect(indentedClosing.map((line) => line.role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content",
      "code-fence-content",
      "code-fence-delimiter",
      "content"
    ]);

    const quoteListContinuation = physicalLineExpectations(
      "> - ```\n>   - literal\n>   $$\n>   ```\n> after",
      sourceSelection(0),
      "wysiwym"
    );
    expect(
      quoteListContinuation.map((line) => [line.role, line.geometry.semanticDepth])
    ).toEqual([
      ["code-fence-delimiter", 2],
      ["code-fence-content", 2],
      ["code-fence-content", 2],
      ["code-fence-delimiter", 2],
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
  it("declares the Electron batch runner without inspecting the scenario id", () => {
    expect(editorBehaviorMatrixScenario.execution).toEqual({
      kind: "electron-batch",
      runner: "editor-behavior-manifest"
    });
    const firstStep = editorBehaviorMatrixScenario.steps[0]!;
    const handler = createHeadlessStepHandlers(editorBehaviorMatrixScenario)[firstStep.id]!;
    expect(() =>
      handler({
        scenarioId: editorBehaviorMatrixScenario.id,
        step: firstStep,
        signal: new AbortController().signal
      })
    ).toThrow(/requires Electron batch runner/i);
  });
});
