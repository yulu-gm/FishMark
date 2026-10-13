import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Schema 2 measures controller dispatch on heading/plain-paragraph fixtures.
// Neither those calls nor two rAF callbacks are the roadmap's semantic/paint boundary.
const fixtureHashes = new Map([
  [5000, "c9edc64fe03b5d87136741441f420cd5f000857b3209bd84ca9031aae3f5a43f"],
  [20000, "4af71bdbbe558acc9cbbdff2534638f0966e7249df536c317d90d0373d36f4a4"]
]);
const metrics = ["typingDispatchMs", "typingToFrameMs", "selectionDispatchMs"];
const missingEvidence = [
  "Canonical mixed 5k/20k fixtures with cold/warm editor-ready timing (500/1500ms).",
  "Defined complete synchronous semantic intervals for ordinary/structural edits (p95 16/24ms).",
  "Full parser/definition scans, parse windows, reuse, invalidation, fallback and decoration counters.",
  "Scroll, source-mode/tab switch, actual presentation, long tasks, dropped frames and retained memory.",
  "Windows/macOS native IME and soft-wrap acceptance."
];
const finiteDuration = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 0.000001;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const rank = (p) => ordered[Math.ceil(ordered.length * p) - 1];
  return { samples: values.length, p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: ordered.at(-1) };
}

function validatePhases(fixture, enabled, check) {
  const samples = fixture.phaseSamples;
  if (!check(Array.isArray(samples), "phaseSamples must be an array")) return;
  if (!enabled) {
    check(samples.length === 0, "OFF report contains phase samples");
    return;
  }
  check(samples.length === 60, "ON report requires 60 phase samples");
  for (const [index, sample] of samples.entries()) {
    const kind = index < 30 ? "typing" : "selection";
    if (!check(record(sample) && sample.kind === kind && sample.sample === index % 30 && sample.aborted === false,
      `phase sample ${index} identity/completion mismatch`)) continue;
    const spans = sample.spans;
    if (!check(Array.isArray(spans) && spans.length > 0, `phase sample ${index} has no spans`)) continue;
    const children = new Map();
    const stack = [];
    const validatedSpans = [];
    for (const [i, span] of spans.entries()) {
      if (!check(record(span) && span.id === i && typeof span.label === "string" && span.label.length > 0 &&
        [span.startMs, span.endMs, span.inclusiveMs, span.exclusiveMs, span.directChildMs].every(finiteDuration) &&
        (span.inputChars === null || (Number.isSafeInteger(span.inputChars) && span.inputChars >= 0)),
      `phase sample ${index} span ${i} malformed`)) continue;
      validatedSpans.push(span);
      check(near(span.endMs - span.startMs, span.inclusiveMs), `phase sample ${index} span ${i} duration mismatch`);
      // Preorder ids and ancestor stack prevent overlapping siblings or crossing intervals.
      while (stack.length && stack.at(-1).id !== span.parentId) stack.pop();
      const parent = stack.at(-1);
      if (i === 0) {
        check(span.parentId === null, `phase sample ${index} root parent mismatch`);
      } else {
        check(Boolean(parent) && span.startMs >= parent.startMs && span.endMs <= parent.endMs,
          `phase sample ${index} span ${i} parent/containment mismatch`);
      }
      const siblings = children.get(span.parentId) ?? [];
      check(!siblings.length || span.startMs >= siblings.at(-1).endMs,
        `phase sample ${index} span ${i} overlaps sibling`);
      siblings.push(span);
      children.set(span.parentId, siblings);
      stack.push(span);
    }
    for (const span of validatedSpans) {
      const childTotal = (children.get(span.id) ?? []).reduce((sum, child) => sum + child.inclusiveMs, 0);
      check(near(span.directChildMs, childTotal) && near(span.exclusiveMs, span.inclusiveMs - childTotal),
        `phase sample ${index} span ${span.id} accounting mismatch`);
    }
    const root = validatedSpans.find((span) => span.id === 0);
    const expectedRoot = `src/renderer/code-editor.ts#${kind === "typing" ? "insertText" : "setSelection"}`;
    const dispatch = fixture.raw?.[kind === "typing" ? "typingDispatchMs" : "selectionDispatchMs"]?.[index % 30];
    check(root?.label === expectedRoot && finiteDuration(dispatch) && root.inclusiveMs <= dispatch + 0.000001,
      `phase sample ${index} controller boundary mismatch`);
  }
}

export function evaluateEditorRuntimePerformance(report) {
  const errors = [];
  const fixtures = [];
  const check = (condition, message) => { if (!condition) errors.push(message); return Boolean(condition); };
  if (check(record(report), "report must be an object")) {
    check(report.schemaVersion === 2, "unsupported report schema");
    check(report.measurement === "production-controller-dispatch-and-two-animation-frames", "measurement boundary mismatch");
    check(report.complete === true && !Object.hasOwn(report, "error"), "report incomplete or contains an error");
    check(typeof report.phaseTimingEnabled === "boolean", "phase mode missing");
    const environment = report.environment;
    check(record(environment) && ["platform", "release", "cpu", "electron", "chrome", "userData", "sessionData"]
      .every((key) => typeof environment[key] === "string" && environment[key].length > 0) &&
      Number.isSafeInteger(environment.logicalCpus) && environment.logicalCpus > 0 &&
      Number.isSafeInteger(environment.memoryBytes) && environment.memoryBytes > 0 &&
      environment.mode === "paintable-offscreen" && environment.rendererBuild === "vite-development-server",
    "runtime environment missing or incompatible");
    if (check(Array.isArray(report.fixtures) && report.fixtures.length === 2, "exactly two fixtures required")) {
      for (const [index, fixture] of report.fixtures.entries()) {
        const lineCount = [5000, 20000][index];
        const at = (condition, message) => check(condition, `${lineCount}: ${message}`);
        if (!at(record(fixture), "fixture must be an object")) continue;
        at(fixture.lineCount === lineCount, "fixture order/identity mismatch");
        at(fixture.complete === true && fixture.sourcePreserved === true && fixture.emittedFrames === 30,
          "fixture incomplete, source mismatch or document-change callback count mismatch");
        at(finiteDuration(fixture.openMs), "invalid controller construction duration");
        if (at(typeof fixture.source === "string", "source missing")) {
          const bytes = Buffer.from(fixture.source, "utf8");
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const identity = fixture.fixtureIdentity;
          at(sha256 === fixtureHashes.get(lineCount), "unexpected fixture bytes");
          at(record(identity) && identity.sha256 === sha256 && identity.byteLength === bytes.length &&
            identity.logicalLines === lineCount && identity.encoding === "utf-8" &&
            fixture.source.split("\n").length === lineCount && fixture.chars === fixture.source.length,
          "fixture identity/hash/length mismatch");
        }
        const computed = {};
        for (const metric of metrics) {
          const values = fixture.raw?.[metric];
          if (!at(Array.isArray(values) && values.length === 30 && values.every(finiteDuration), `${metric}: invalid raw samples`)) continue;
          computed[metric] = summarize(values);
          at(record(fixture[metric]) && Object.entries(computed[metric]).every(([key, value]) => near(fixture[metric][key], value)),
            `${metric}: stored summary mismatch`);
        }
        if (computed.typingDispatchMs && computed.typingToFrameMs) {
          at(fixture.raw.typingToFrameMs.every((value, i) => value >= fixture.raw.typingDispatchMs[i]),
            "two-rAF interval is shorter than dispatch");
        }
        const presentation = fixture.presentation;
        at(record(presentation) && finiteDuration(presentation.dpr) && presentation.dpr > 0 &&
          ["fontFamily", "fontSize", "lineHeight"].every((key) => typeof presentation[key] === "string" && presentation[key].length > 0),
        "presentation metadata missing");
        validatePhases(fixture, report.phaseTimingEnabled, at);
        fixtures.push({ lineCount, controllerConstructionMs: fixture.openMs, ...computed });
      }
    }
  }
  return {
    schemaVersion: 1,
    reportValidity: errors.length ? "INVALID" : "VALID",
    errors,
    diagnostics: fixtures,
    roadmapBudgetAssessment: {
      status: errors.length ? "INVALID_EVIDENCE" : "INSUFFICIENT_EVIDENCE",
      missingEvidence,
      explanation: "Schema 2 diagnostic timing cannot establish RF-901 semantic, mixed editor-ready or presentation budget PASS/FAIL."
    }
  };
}

export function runtimePerformanceExitCode(assessment, requireRoadmapBudgets = false) {
  if (assessment.reportValidity !== "VALID") return 1;
  // No supported schema currently measures the complete roadmap contract.
  return requireRoadmapBudgets ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const strict = args.includes("--require-roadmap-budgets");
  const paths = args.filter((arg) => arg !== "--require-roadmap-budgets");
  try {
    if (paths.length !== 1 || args.length !== paths.length + Number(strict) || paths[0].startsWith("--")) {
      throw new Error("Usage: node scripts/evaluate-editor-runtime-performance.mjs <report.json> [--require-roadmap-budgets]");
    }
    const assessment = evaluateEditorRuntimePerformance(JSON.parse(readFileSync(paths[0], "utf8")));
    process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
    process.exitCode = runtimePerformanceExitCode(assessment, strict);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
