import { describe, expect, it } from "vitest";

import {
  assertCompleteFishMarkProbeRegistry,
  defineEditorBehaviorCase,
  editorBehaviorAspects,
  editorBehaviorCases,
  editorBehaviorCheckpointIds,
  fishMarkNamedProbeCatalog,
  filterEditorBehaviorCases,
  formatContainerPath,
  recursiveParityMatrixCases,
  representativeDepthCases,
  requiredEditorBehaviorContainerPaths
} from "../../../../fixtures/editor-behavior/manifest";
import { defaultScenarioRegistry, seedScenarios } from "../index";
import {
  createEditorBehaviorMatrixScenario,
  editorBehaviorMatrixScenario
} from "./editor-behavior-matrix";
import { createHeadlessStepHandlers } from "../handlers/headless";

const REQUIRED_COMMANDS = [
  "Enter",
  "Backspace",
  "Tab",
  "Shift+Tab",
  "ArrowUp",
  "ArrowDown",
  "selection"
] as const;

describe("editor behavior manifest", () => {
  it("records the complete semantic expectation contract for every case", () => {
    expect(editorBehaviorCases.length).toBeGreaterThan(20);
    expect(new Set(editorBehaviorCases.map((behaviorCase) => behaviorCase.id)).size).toBe(
      editorBehaviorCases.length
    );

    for (const behaviorCase of editorBehaviorCases) {
      expect(["desired", "known-defect"]).toContain(behaviorCase.classification.kind);
      expect(behaviorCase.classification.contractReferences.length).toBeGreaterThan(0);
      expect(Object.keys(behaviorCase.classification.evidence)).toEqual(
        editorBehaviorCheckpointIds
      );
      for (const checkpoint of editorBehaviorCheckpointIds) {
        expect(Object.keys(behaviorCase.classification.evidence[checkpoint]).sort()).toEqual(
          [...editorBehaviorAspects].sort()
        );
      }
      expect(behaviorCase.initial.source).toEqual(expect.any(String));
      expect(behaviorCase.initial.selection).toEqual({
        anchor: expect.any(Number),
        head: expect.any(Number)
      });
      expect(behaviorCase.initial.selection.anchor).toBeGreaterThanOrEqual(0);
      expect(behaviorCase.initial.selection.anchor).toBeLessThanOrEqual(
        behaviorCase.initial.source.length
      );
      expect(behaviorCase.initial.selection.head).toBeGreaterThanOrEqual(0);
      expect(behaviorCase.initial.selection.head).toBeLessThanOrEqual(
        behaviorCase.initial.source.length
      );
      for (const result of [
        behaviorCase.initial,
        ...behaviorCase.checkpoints.map((checkpoint) => checkpoint.result)
      ]) {
        expect(result.selection.anchor).toBeGreaterThanOrEqual(0);
        expect(result.selection.anchor).toBeLessThanOrEqual(result.source.length);
        expect(result.selection.head).toBeGreaterThanOrEqual(0);
        expect(result.selection.head).toBeLessThanOrEqual(result.source.length);
        expect(result.visibleLines).toHaveLength(result.source.split("\n").length);

        result.visibleLines.forEach((line, index) => {
          expect(line).toMatchObject({
            line: index + 1,
            sourceText: result.source.split("\n")[index],
            role: expect.any(String),
            geometry: {
              semanticDepth: expect.any(Number),
              contentColumn: expect.any(Number),
              markerColumn: expect.toSatisfy(
                (value: unknown) => value === null || typeof value === "number"
              ),
              visibility: expect.stringMatching(/^(visible|collapsed)$/)
            }
          });
        });
      }
    }
  });

  it("keeps known defects separate from desired expectations", () => {
    const defects = editorBehaviorCases.flatMap((behaviorCase) =>
      behaviorCase.classification.kind === "known-defect" ? [behaviorCase.classification] : []
    );

    expect(defects.length).toBeGreaterThan(0);
    for (const defect of defects) {
      expect(defect.evidence).toBeDefined();
      expect(["planner-result", "semantic-path", "editor-result"]).toContain(
        defect.observed.kind
      );
    }
  });

  it("generates exactly one typed parity case for all 70 required command/path pairs", () => {
    expect(recursiveParityMatrixCases).toHaveLength(
      REQUIRED_COMMANDS.length * requiredEditorBehaviorContainerPaths.length
    );

    for (const command of REQUIRED_COMMANDS) {
      for (const path of requiredEditorBehaviorContainerPaths) {
        const parityMatches = recursiveParityMatrixCases.filter(
          (behaviorCase) =>
            behaviorCase.command === command &&
            formatContainerPath(behaviorCase.containerPath) === formatContainerPath(path)
        );
        expect(
          parityMatches,
          `${command} parity generation must cover ${formatContainerPath(path)} exactly once`
        ).toHaveLength(1);
        expect(
          filterEditorBehaviorCases({ command, containerPath: path }),
          `${command} must cover ${formatContainerPath(path)}`
        ).not.toHaveLength(0);
      }
    }
  });

  it("maps every named FishMark probe to a case and consumes catalog capabilities", () => {
    const mappedProbeIds = new Set(
      editorBehaviorCases.flatMap((behaviorCase) =>
        behaviorCase.classification.probeCaseId
          ? [behaviorCase.classification.probeCaseId]
          : []
      )
    );

    for (const { caseId } of fishMarkNamedProbeCatalog) {
      expect(mappedProbeIds.has(caseId), caseId).toBe(true);
    }

    for (const probe of fishMarkNamedProbeCatalog) {
      const behaviorCase = editorBehaviorCases.find(
        (candidate) => candidate.classification.probeCaseId === probe.caseId
      )!;
      const actualVerifiedTargets = editorBehaviorCheckpointIds.flatMap((checkpoint) =>
        editorBehaviorAspects.flatMap((aspect) => {
          const state = behaviorCase.classification.evidence[checkpoint][aspect];
          if (state.status !== "verified" || state.provenance.kind !== "fishmark-probe") {
            return [];
          }
          expect(state.provenance.probeCaseId).toBe(probe.caseId);
          return [`${checkpoint}:${aspect}`];
        })
      );
      expect(new Set(actualVerifiedTargets), probe.caseId).toEqual(
        new Set(probe.capabilities.map(({ checkpoint, aspect }) => `${checkpoint}:${aspect}`))
      );
    }
  });

  it("rejects executable probe registries that drift from the shared catalog", () => {
    const executableRegistry = fishMarkNamedProbeCatalog.map(({ caseId, group, probe }) => ({
      caseId,
      group,
      run: {
        [probe.functionName]: async () => undefined
      }[probe.functionName]!
    }));
    const swappedRegistry = executableRegistry.map((entry, index) =>
      index === 0
        ? { ...entry, run: executableRegistry[1]!.run }
        : index === 1
          ? { ...entry, run: executableRegistry[0]!.run }
          : entry
    );

    expect(() =>
      assertCompleteFishMarkProbeRegistry(swappedRegistry)
    ).toThrow(/runEmptyTypeHashCase|function.*does not match|does not match the typed catalog/i);
  });

  it("marks all generated parity evidence as an explicit execution gap", () => {
    for (const behaviorCase of recursiveParityMatrixCases) {
      expect(behaviorCase.classification.currentStatus).toBe("unverified");
      for (const checkpoint of editorBehaviorCheckpointIds) {
        expect(
          editorBehaviorAspects.every(
            (aspect) => behaviorCase.classification.evidence[checkpoint][aspect].status === "gap"
          )
        ).toBe(true);
      }
    }
  });

  it("rejects checkpoints without executable actions", () => {
    const valid = editorBehaviorCases[0]!;
    expect(() =>
      defineEditorBehaviorCase({
        ...valid,
        checkpoints: [
          valid.checkpoints[0],
          { ...valid.checkpoints[1], actions: [] },
          valid.checkpoints[2]
        ]
      })
    ).toThrow(/executable actions/i);
  });

  it("splits paragraph content into list siblings on Enter at list-owned leaves", () => {
    const expectedByPathIndex = new Map([
      [1, "- al\n- pha"],
      [2, "- - al\n  - pha"],
      [5, "> - al\n> - pha"],
      [8, "- > - al\n  > - pha"]
    ]);

    for (const [pathIndex, expectedSource] of expectedByPathIndex) {
      const behaviorCase = recursiveParityMatrixCases.find(
        (candidate) =>
          candidate.command === "Enter" &&
          formatContainerPath(candidate.containerPath) ===
            formatContainerPath(requiredEditorBehaviorContainerPaths[pathIndex]!)
      );
      expect(behaviorCase?.checkpoints[0].result.source, `path ${pathIndex + 1}`).toBe(expectedSource);
    }
  });

  it("does not treat ordinary leading whitespace as semantic container depth", () => {
    const whitespace = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "empty-type-three-spaces"
    )!;

    expect(whitespace.checkpoints[0].result.visibleLines[0]?.geometry.semanticDepth).toBe(0);
    expect(whitespace.checkpoints[0].result.visibleLines[0]?.geometry.contentColumn).toBe(0);
    expect(whitespace.checkpoints[1].result.visibleLines[0]?.geometry.semanticDepth).toBe(0);
    expect(whitespace.checkpoints[1].result.visibleLines[0]?.geometry.contentColumn).toBe(0);
  });

  it("collapses non-active structural separator lines in projected mode", () => {
    const quoteNavigation = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "blockquote-arrow-down"
    )!;

    expect(quoteNavigation.checkpoints[0].result.visibleLines[1]).toMatchObject({
      role: "structural-separator",
      geometry: { visibility: "collapsed" }
    });
  });

  it("keeps cursor placement metadata consistent with generated Shift+Tab selections", () => {
    for (const behaviorCase of recursiveParityMatrixCases.filter(
      (candidate) => candidate.command === "Shift+Tab"
    )) {
      expect(behaviorCase.cursorPlacement).toBe("line-end");
    }
  });

  it("does not claim observed geometry for the unprobed nested block-math defect", () => {
    const behaviorCase = editorBehaviorCases.find(
      (candidate) => candidate.id === "nested-quote-list-block-math-selection"
    )!;
    expect(behaviorCase.classification.kind).toBe("known-defect");
    if (behaviorCase.classification.kind === "known-defect") {
      expect("visibleLines" in behaviorCase.classification.observed).toBe(false);
    }
  });

  it("keeps every physical-line geometry expectation within its source line", () => {
    for (const behaviorCase of editorBehaviorCases) {
      for (const result of [
        behaviorCase.checkpoints[0].result,
        behaviorCase.checkpoints[1].result,
        behaviorCase.checkpoints[2].result
      ]) {
        const sourceLines = result.source.split("\n");
        expect(result.visibleLines).toHaveLength(sourceLines.length);
        for (const line of result.visibleLines) {
          expect(line.geometry.contentColumn).toBeLessThanOrEqual(
            sourceLines[line.line - 1]!.length
          );
        }
      }
    }

    const quoteNavigation = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "blockquote-arrow-down"
    )!;
    expect(quoteNavigation.checkpoints[0].result.visibleLines[1]).toMatchObject({
      role: "structural-separator",
      geometry: { contentColumn: 1, markerColumn: 0, visibility: "collapsed" }
    });
  });

  it("preserves exact quote/list depth and marker columns on every physical line", () => {
    const nestedTab = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "nested-list-item-tab"
    )!;
    expect(nestedTab.checkpoints[0].result.visibleLines.map((line) => line.geometry)).toEqual([
      { semanticDepth: 1, contentColumn: 2, markerColumn: 0, visibility: "visible" },
      { semanticDepth: 2, contentColumn: 4, markerColumn: 2, visibility: "visible" },
      { semanticDepth: 3, contentColumn: 6, markerColumn: 4, visibility: "visible" }
    ]);

    const mixedTab = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "list-blockquote-list-tab"
    )!;
    expect(mixedTab.checkpoints[0].result.visibleLines.map((line) => line.geometry)).toEqual([
      { semanticDepth: 3, contentColumn: 6, markerColumn: 4, visibility: "visible" },
      { semanticDepth: 3, contentColumn: 6, markerColumn: 4, visibility: "visible" },
      { semanticDepth: 4, contentColumn: 8, markerColumn: 6, visibility: "visible" }
    ]);

    const nestedMath = editorBehaviorCases.find(
      (behaviorCase) => behaviorCase.id === "nested-quote-list-block-math-selection"
    )!;
    expect(nestedMath.checkpoints[0].result.visibleLines.map((line) => line.geometry)).toEqual([
      { semanticDepth: 3, contentColumn: 6, markerColumn: 4, visibility: "visible" },
      { semanticDepth: 3, contentColumn: 6, markerColumn: 2, visibility: "visible" },
      { semanticDepth: 3, contentColumn: 6, markerColumn: 2, visibility: "visible" }
    ]);

    const ordered = representativeDepthCases.find((behaviorCase) =>
      /(?:^|\s)1\. /.test(behaviorCase.initial.source)
    )!;
    const task = representativeDepthCases.find((behaviorCase) =>
      /(?:^|\s)- \[ \] /.test(behaviorCase.initial.source)
    )!;
    expect(ordered.checkpoints[0].result.visibleLines[0]?.geometry.semanticDepth).toBe(
      ordered.containerDepth
    );
    expect(ordered.checkpoints[0].result.visibleLines[0]?.geometry.contentColumn).toBe(
      ordered.initial.source.indexOf("leaf")
    );
    expect(task.checkpoints[0].result.visibleLines[0]?.geometry.semanticDepth).toBe(task.containerDepth);
    expect(task.checkpoints[0].result.visibleLines[0]?.geometry.contentColumn).toBe(
      task.initial.source.indexOf("leaf")
    );
  });

  it("covers depths 0 through 8 and the required line, cursor, selection, and view-mode variants", () => {
    expect([...new Set(editorBehaviorCases.map((behaviorCase) => behaviorCase.containerDepth))].sort())
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    expect(new Set(editorBehaviorCases.map((behaviorCase) => behaviorCase.lineContent))).toEqual(
      new Set(["empty", "whitespace-only", "content"])
    );
    expect(new Set(editorBehaviorCases.map((behaviorCase) => behaviorCase.cursorPlacement))).toEqual(
      new Set(["line-start", "line-middle", "line-end", "range"])
    );
    expect(new Set(editorBehaviorCases.map((behaviorCase) => behaviorCase.initial.viewMode))).toEqual(
      new Set(["source", "wysiwym"])
    );

    const initialSources = editorBehaviorCases.map((behaviorCase) => behaviorCase.initial.source);
    expect(initialSources.some((source) => /(?:^|\n)\s*(?:>\s*)*\d+[.)]\s/.test(source))).toBe(
      true
    );
    expect(initialSources.some((source) => /(?:^|\n)\s*(?:>\s*)*[-+*]\s\[[ xX]\]\s/.test(source))).toBe(
      true
    );
  });

  it("keeps declared semantic depth consistent with each container path", () => {
    for (const behaviorCase of editorBehaviorCases) {
      const pathDepth = behaviorCase.containerPath.filter(
        (container) => container === "List" || container === "Blockquote"
      ).length;
      expect(pathDepth, behaviorCase.id).toBe(behaviorCase.containerDepth);
    }
  });

  it("contains no screenshot or generated-artifact fields", () => {
    const serialized = JSON.stringify(editorBehaviorCases);
    expect(serialized).not.toMatch(/screenshot|artifactPath|imagePath|domClass/i);
  });
});

describe("filterEditorBehaviorCases", () => {
  it("filters by command, exact container path, or both", () => {
    const tabCases = filterEditorBehaviorCases({ command: "Tab" });
    expect(tabCases.length).toBeGreaterThan(0);
    expect(tabCases.every((behaviorCase) => behaviorCase.command === "Tab")).toBe(true);

    const path = requiredEditorBehaviorContainerPaths[5]!;
    const pathCases = filterEditorBehaviorCases({ containerPath: path });
    expect(pathCases.length).toBeGreaterThan(0);
    expect(
      pathCases.every(
        (behaviorCase) => formatContainerPath(behaviorCase.containerPath) === formatContainerPath(path)
      )
    ).toBe(true);

    const combined = filterEditorBehaviorCases({ command: "Shift+Tab", containerPath: path });
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.every((behaviorCase) => behaviorCase.command === "Shift+Tab")).toBe(true);
    expect(
      combined.every(
        (behaviorCase) => formatContainerPath(behaviorCase.containerPath) === formatContainerPath(path)
      )
    ).toBe(true);
  });

  it("returns a defensive array in stable manifest order", () => {
    const first = filterEditorBehaviorCases();
    const second = filterEditorBehaviorCases();

    expect(first).toEqual(editorBehaviorCases);
    expect(first).not.toBe(editorBehaviorCases);
    expect(first.map((behaviorCase) => behaviorCase.id)).toEqual(
      second.map((behaviorCase) => behaviorCase.id)
    );
  });
});

describe("editor behavior matrix scenario", () => {
  it("generates deterministic case steps from the selected corpus", () => {
    const first = createEditorBehaviorMatrixScenario({ command: "Backspace" });
    const second = createEditorBehaviorMatrixScenario({ command: "Backspace" });
    const selectedCases = filterEditorBehaviorCases({ command: "Backspace" });

    expect(first).toEqual(second);
    expect(first.id).toBe("editor-behavior-matrix");
    expect(first.steps.map((step) => step.id)).toEqual(
      selectedCases.map((behaviorCase) => behaviorCase.id)
    );
    expect(first.steps.every((step) => step.kind === "assertion")).toBe(true);
  });

  it("registers exactly one full-corpus scenario entry", () => {
    expect(editorBehaviorMatrixScenario.steps).toHaveLength(editorBehaviorCases.length);
    expect(defaultScenarioRegistry.get("editor-behavior-matrix")).toBe(editorBehaviorMatrixScenario);
    expect(
      seedScenarios.filter((scenario) => scenario.id === "editor-behavior-matrix")
    ).toHaveLength(1);
  });

  it("cannot be reported as passed without its Electron batch runner", () => {
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
