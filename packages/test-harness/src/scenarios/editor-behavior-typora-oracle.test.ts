import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { capturedOracleAndProbeCases } from "../../../../fixtures/editor-behavior/probe-cases";
import type {
  EditorBehaviorAction,
  SourceSelection
} from "../../../../fixtures/editor-behavior/model";

type OracleAction =
  | { readonly type: "type"; readonly text: string }
  | { readonly type: "key"; readonly key: "Enter" | "Backspace" | "ArrowDown" };

type OracleCatalog = {
  readonly cases: readonly {
    readonly caseId: string;
    readonly status: "captured" | "blocked";
    readonly initialSource: string;
    readonly initialCaret?: "end";
    readonly initialCaretOffset?: number;
    readonly actions: readonly OracleAction[];
    readonly sentinel: string;
  }[];
};

type OracleCapture = {
  readonly caseId: string;
  readonly status: "captured" | "blocked";
  readonly initialSource: string;
  readonly initialCaret: "end" | {
    readonly offset?: number;
    readonly sourceOffset?: number;
  };
  readonly actions: readonly OracleAction[];
  readonly sentinel: string;
  readonly savedSourceAfterSentinel: string;
};

const oracleDirectory = resolve(
  process.cwd(),
  "docs/plans/typora-like-editor/oracle"
);

describe("Typora oracle conversion", () => {
  const catalog = readJson<OracleCatalog>(resolve(oracleDirectory, "case-matrix.json"));
  const capturedIds = catalog.cases
    .filter(({ status }) => status === "captured")
    .map(({ caseId }) => caseId);
  const blockedIds = catalog.cases
    .filter(({ status }) => status === "blocked")
    .map(({ caseId }) => caseId);
  const typedOracleCases = capturedOracleAndProbeCases.filter(
    ({ origin }) => origin === "typora-oracle"
  );

  it("keeps every catalog row synchronized with one per-case JSON artifact", () => {
    const artifactIds = readdirSync(oracleDirectory)
      .filter((name) => name.endsWith(".json") && name !== "case-matrix.json")
      .map((name) => name.slice(0, -".json".length))
      .sort();
    expect(artifactIds).toEqual(catalog.cases.map(({ caseId }) => caseId).sort());

    for (const catalogCase of catalog.cases) {
      const capture = readJson<OracleCapture>(
        resolve(oracleDirectory, `${catalogCase.caseId}.json`)
      );
      expect(capture.caseId).toBe(catalogCase.caseId);
      expect(capture.status).toBe(catalogCase.status);
      expect(normalizeNewlines(capture.initialSource)).toBe(
        normalizeNewlines(catalogCase.initialSource)
      );
      expect(
        initialSelection(capture.initialCaret, normalizeNewlines(capture.initialSource))
      ).toEqual(catalogInitialSelection(catalogCase));
      expect(capture.actions).toEqual(catalogCase.actions);
      expect(capture.sentinel).toBe(catalogCase.sentinel);
    }
  });

  it("auto-discovers exactly the captured catalog without blocked-case shadowing", () => {
    expect(typedOracleCases.map(({ id }) => id)).toEqual(capturedIds);
    for (const caseId of blockedIds) {
      expect(
        capturedOracleAndProbeCases.find(
          (behaviorCase) =>
            behaviorCase.id === caseId && behaviorCase.origin === "typora-oracle"
        )
      ).toBeUndefined();
    }
  });

  it.each(capturedIds)("converts every captured field for %s", (caseId) => {
    const capturePath = resolve(oracleDirectory, `${caseId}.json`);
    const capture = readJson<OracleCapture>(capturePath);
    const behaviorCase = typedOracleCases.find(({ id }) => id === caseId)!;

    expect(capture.caseId).toBe(caseId);
    expect(capture.status).toBe("captured");
    expect(behaviorCase.initial.source).toBe(normalizeNewlines(capture.initialSource));
    expect(behaviorCase.initial.selection).toEqual(
      initialSelection(capture.initialCaret, behaviorCase.initial.source)
    );

    const sentinelIndex = capture.savedSourceAfterSentinel.indexOf(capture.sentinel);
    expect(sentinelIndex).toBeGreaterThanOrEqual(0);
    expect(capture.savedSourceAfterSentinel.indexOf(capture.sentinel, sentinelIndex + 1)).toBe(-1);
    const capturedSource = normalizeNewlines(
      capture.savedSourceAfterSentinel.slice(0, sentinelIndex) +
        capture.savedSourceAfterSentinel.slice(sentinelIndex + capture.sentinel.length)
    );
    const capturedSelection = {
      anchor: normalizeNewlines(
        capture.savedSourceAfterSentinel.slice(0, sentinelIndex)
      ).length,
      head: normalizeNewlines(
        capture.savedSourceAfterSentinel.slice(0, sentinelIndex)
      ).length
    };
    const capturedActions = capture.actions.map(convertAction);
    const candidates = (["primary", "repeat"] as const).filter((checkpointId) => {
      const checkpoint = behaviorCase.checkpoints.find(({ id }) => id === checkpointId)!;
      const actionPlan =
        checkpointId === "primary"
          ? checkpoint.actions
          : [
              ...behaviorCase.checkpoints[0].actions,
              ...checkpoint.actions
            ];
      return (
        stableEqual(actionPlan, capturedActions) &&
        checkpoint.result.source === capturedSource &&
        stableEqual(checkpoint.result.selection, capturedSelection)
      );
    });

    expect(candidates, `${caseId} must map to one complete captured checkpoint`).toHaveLength(1);
    const oracleReferences = behaviorCase.classification.contractReferences.filter(
      (reference) => reference.kind === "typora-oracle"
    );
    expect(oracleReferences).toHaveLength(1);
    const reference = oracleReferences[0]!;
    expect(reference).toMatchObject({
      file: `docs/plans/typora-like-editor/oracle/${caseId}.json`
    });
    expect(reference.capturedCheckpoint).toBe(candidates[0]);
    expect(reference.coverage.actions).toBe("captured-exact");
    expect(reference.coverage.initial).toEqual(resultCoverage(true));
    expect(reference.coverage.primary).toEqual(
      resultCoverage(candidates[0] === "primary")
    );
    expect(reference.coverage.repeat).toEqual(
      resultCoverage(candidates[0] === "repeat")
    );
    expect(reference.coverage.undo).toEqual(resultCoverage(false));
  });
});

function initialSelection(
  caret: OracleCapture["initialCaret"],
  source: string
): SourceSelection {
  const offset =
    caret === "end"
      ? source.length
      : caret.offset ?? caret.sourceOffset;
  if (offset === undefined) throw new Error("Oracle initial caret omits its source offset.");
  return { anchor: offset, head: offset };
}

function catalogInitialSelection(
  catalogCase: OracleCatalog["cases"][number]
): SourceSelection {
  const source = normalizeNewlines(catalogCase.initialSource);
  const offset =
    catalogCase.initialCaret === "end"
      ? source.length
      : catalogCase.initialCaretOffset ?? 0;
  return { anchor: offset, head: offset };
}

function convertAction(action: OracleAction): EditorBehaviorAction {
  return action.type === "type"
    ? { kind: "insert-text", text: action.text }
    : { kind: "press-key", key: action.key };
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function resultCoverage(captured: boolean) {
  return {
    "semantic-path": "not-captured",
    source: captured ? "captured-exact" : "not-captured",
    selection: captured ? "captured-exact" : "not-captured",
    "visible-line-roles": "not-captured",
    "physical-geometry": "not-captured",
    "view-mode": "not-captured"
  };
}

function stableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
