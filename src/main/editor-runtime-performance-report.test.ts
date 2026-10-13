import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/evaluate-editor-runtime-performance.mjs");
const { evaluateEditorRuntimePerformance: evaluate, runtimePerformanceExitCode: exitCode } = await import(pathToFileURL(script).href);

function fixture(lineCount: number) {
  const source = Array.from({ length: lineCount / 5 }, (_, index) =>
    `# Section ${index}\n\nPlain paragraph number ${index}.\n\n`).join("\n");
  const values = Array.from({ length: 30 }, (_, i) => i + 1);
  const summary = { samples: 30, p50: 15, p95: 29, p99: 30, max: 30 };
  return {
    lineCount, chars: source.length, source, openMs: 150, emittedFrames: 30, complete: true, sourcePreserved: true,
    raw: { typingDispatchMs: [...values], typingToFrameMs: [...values], selectionDispatchMs: [...values] },
    typingDispatchMs: { ...summary }, typingToFrameMs: { ...summary }, selectionDispatchMs: { ...summary },
    phaseSamples: [] as { kind: string; sample: number; aborted: boolean; spans: {
      id: number; parentId: number | null; label: string; startMs: number; endMs: number;
      inclusiveMs: number; exclusiveMs: number; directChildMs: number; inputChars: number | null;
    }[] }[],
    fixtureIdentity: { sha256: createHash("sha256").update(source).digest("hex"),
      byteLength: Buffer.byteLength(source), logicalLines: lineCount, encoding: "utf-8" },
    presentation: { dpr: 1, fontFamily: "monospace", fontSize: "16px", lineHeight: "22.4px" }
  };
}

function report() {
  return {
    schemaVersion: 2, measurement: "production-controller-dispatch-and-two-animation-frames",
    phaseTimingEnabled: false, complete: true, fixtures: [fixture(5000), fixture(20000)],
    environment: { platform: "win32", release: "10.0.26200", cpu: "test CPU", logicalCpus: 24,
      memoryBytes: 32000000000, electron: "41.2.0", chrome: "146", userData: "isolated", sessionData: "isolated/session",
      mode: "paintable-offscreen", rendererBuild: "vite-development-server" }
  };
}
type Report = ReturnType<typeof report>;

function instrumentedReport() {
  const result = report();
  result.phaseTimingEnabled = true;
  for (const fixture of result.fixtures) {
    fixture.phaseSamples = Array.from({ length: 60 }, (_, index) => ({
      kind: index < 30 ? "typing" : "selection", sample: index % 30, aborted: false,
      spans: [
        { id: 0, parentId: null, label: `src/renderer/code-editor.ts#${index < 30 ? "insertText" : "setSelection"}`,
          startMs: 10, endMs: 11, inclusiveMs: 1, exclusiveMs: 0.5, directChildMs: 0.5, inputChars: null },
        { id: 1, parentId: 0, label: "child", startMs: 10.2, endMs: 10.7, inclusiveMs: 0.5,
          exclusiveMs: 0.5, directChildMs: 0, inputChars: 1 }
      ]
    }));
  }
  return result;
}

describe("runtime performance evidence", () => {
  it("recomputes nearest-rank statistics but does not equate diagnostic validity with roadmap acceptance", () => {
    const result = evaluate(report());
    expect(result).toMatchObject({ reportValidity: "VALID", errors: [],
      roadmapBudgetAssessment: { status: "INSUFFICIENT_EVIDENCE" } });
    expect(result.diagnostics[1].typingDispatchMs).toEqual({ samples: 30, p50: 15, p95: 29, p99: 30, max: 30 });
    expect(exitCode(result)).toBe(0);
    expect(exitCode(result, true)).toBe(2);
  });

  const mutations: [string, (value: Report) => void][] = [
    ["empty fixtures", r => { r.fixtures = []; }],
    ["missing 20k", r => { r.fixtures.pop(); }],
    ["duplicate", r => { r.fixtures[1] = r.fixtures[0]!; }],
    ["reordered", r => { r.fixtures.reverse(); }],
    ["partial root", r => { r.complete = false; }],
    ["error", r => { Object.assign(r, { error: "failure" }); }],
    ["schema", r => { r.schemaVersion = 3; }],
    ["boundary", r => { r.measurement = "semantic"; }],
    ["partial fixture", r => { r.fixtures[0]!.complete = false; }],
    ["source changed", r => { r.fixtures[0]!.sourcePreserved = false; }],
    ["callback missing", r => { r.fixtures[0]!.emittedFrames = 29; }],
    ["raw sample missing", r => { r.fixtures[0]!.raw.typingDispatchMs.pop(); }],
    ["raw sample extra", r => { r.fixtures[0]!.raw.selectionDispatchMs.push(1); }],
    ["NaN", r => { r.fixtures[0]!.raw.typingDispatchMs[0] = NaN; }],
    ["negative", r => { r.fixtures[0]!.raw.typingDispatchMs[0] = -1; }],
    ["infinity", r => { r.fixtures[0]!.raw.typingDispatchMs[0] = Infinity; }],
    ["null raw", r => { Object.assign(r.fixtures[0]!.raw, { typingDispatchMs: null }); }],
    ["null sample", r => { Object.assign(r.fixtures[0]!.raw.typingDispatchMs, { 0: null }); }],
    ["wrong stored p95", r => { r.fixtures[0]!.typingDispatchMs.p95 = 28; }],
    ["hash", r => { r.fixtures[0]!.fixtureIdentity.sha256 = "0".repeat(64); }],
    ["bytes", r => { r.fixtures[0]!.source += "x"; }],
    ["self-consistent foreign fixture", r => {
      const f = r.fixtures[0]!; f.source = f.source.replace("Plain", "Other");
      f.fixtureIdentity.sha256 = createHash("sha256").update(f.source).digest("hex");
    }],
    ["byte length", r => { r.fixtures[0]!.fixtureIdentity.byteLength++; }],
    ["line count", r => { r.fixtures[0]!.fixtureIdentity.logicalLines++; }],
    ["chars", r => { r.fixtures[0]!.chars++; }],
    ["construction", r => { r.fixtures[0]!.openMs = -1; }],
    ["presentation", r => { r.fixtures[0]!.presentation.dpr = 0; }],
    ["environment", r => { r.environment.cpu = ""; }],
    ["missing phase mode", r => { Object.assign(r, { phaseTimingEnabled: null }); }],
    ["missing spans on ON", r => { r.phaseTimingEnabled = true; }],
    ["frames before dispatch", r => { r.fixtures[0]!.raw.typingToFrameMs[0] = 0; }]
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const value = report(); mutate(value);
    const result = evaluate(value);
    expect(result.reportValidity).toBe("INVALID");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.roadmapBudgetAssessment.status).toBe("INVALID_EVIDENCE");
    expect(exitCode(result)).toBe(1);
    expect(exitCode(result, true)).toBe(1);
  });

  it.each([null, {}, [], { fixtures: null }])("rejects malformed reports without crashing: %j", value => {
    expect(evaluate(value).reportValidity).toBe("INVALID");
  });

  it.each([0.001, 10000])("neither fast nor slow dispatch (%dms) proves a semantic verdict", duration => {
    const value = report();
    for (const f of value.fixtures) {
      for (const metric of ["typingDispatchMs", "typingToFrameMs", "selectionDispatchMs"] as const) {
        f.raw[metric].fill(duration);
        f[metric] = { samples: 30, p50: duration, p95: duration, p99: duration, max: duration };
      }
    }
    expect(evaluate(value).roadmapBudgetAssessment.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(exitCode(evaluate(value), true)).toBe(2);
  });

  it("accepts closed ON spans without adding overlapping inclusive times as semantic cost", () => {
    expect(evaluate(instrumentedReport())).toMatchObject({ reportValidity: "VALID", errors: [],
      roadmapBudgetAssessment: { status: "INSUFFICIENT_EVIDENCE" } });
  });

  it.each(["aborted", "identity", "open", "parent", "accounting", "overlap", "boundary", "off"])("rejects %s phase evidence", kind => {
    const r = instrumentedReport();
    const sample = r.fixtures[0]!.phaseSamples[0]!;
    const child = sample.spans[1]!;
    if (kind === "aborted") sample.aborted = true;
    if (kind === "identity") sample.sample = 1;
    if (kind === "open") Object.assign(child, { endMs: null });
    if (kind === "parent") child.parentId = 999;
    if (kind === "accounting") child.exclusiveMs = 0;
    if (kind === "overlap") sample.spans.push({ ...child, id: 2 });
    if (kind === "boundary") sample.spans[0]!.label = "semantic";
    if (kind === "off") r.phaseTimingEnabled = false;
    expect(evaluate(r).reportValidity).toBe("INVALID");
  });

  it.each(["id", "inclusiveMs", "endMs", "directChildMs"])("returns structured INVALID for JSON object in span %s", field => {
    const r = instrumentedReport();
    Object.assign(r.fixtures[0]!.phaseSamples[0]!.spans[0]!, { [field]: { toString: null } });
    expect(evaluate(r)).toMatchObject({ reportValidity: "INVALID",
      roadmapBudgetAssessment: { status: "INVALID_EVIDENCE" } });
  });

  it("CLI distinguishes valid diagnostics, unmet evidence and invalid input", () => {
    const dir = mkdtempSync(join(tmpdir(), "fishmark-runtime-report-"));
    const file = join(dir, "report.json");
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 10000 });
    try {
      writeFileSync(file, JSON.stringify(report()));
      expect(run(file).status).toBe(0);
      const strict = run(file, "--require-roadmap-budgets");
      expect(strict.status).toBe(2);
      expect(JSON.parse(strict.stdout).roadmapBudgetAssessment.status).toBe("INSUFFICIENT_EVIDENCE");
      writeFileSync(file, JSON.stringify({ complete: true, fixtures: [] }));
      expect(run(file).status).toBe(1);
      writeFileSync(file, "{broken");
      expect(run(file).status).toBe(1);
      expect(run().status).toBe(1);
      expect(run(file, "--unknown").status).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 20000);
});
