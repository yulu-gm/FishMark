import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, "fixtures/architecture/vitest-known-failures.json");
const reportPath = resolve(root, ".artifacts/ci/vitest-full.gate.json");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return typeof value === "string" ? stripVTControlCharacters(value) : value;
}

// Exclude machine-dependent stack traces, but compare the actual assertion
// payload as well as its message. A different failure at the same test is new debt.
export function errorFingerprint(error) {
  return createHash("sha256").update(JSON.stringify(stable({
    name: error.name,
    message: error.message,
    actual: error.actual,
    expected: error.expected,
    operator: error.operator
  }))).digest("hex");
}

const testKey = (test) => JSON.stringify([test.file, test.name, test.occurrence ?? 0]);

export function evaluateRegression(observed, baseline) {
  if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.failures) ||
      !Array.isArray(baseline.skipped) || !Array.isArray(observed.tests) ||
      !Array.isArray(observed.errors)) {
    throw new Error("Invalid full-regression evidence or baseline schema.");
  }
  const failures = new Map();
  for (const entry of baseline.failures) {
    if (typeof entry.file !== "string" || typeof entry.name !== "string" ||
        typeof entry.reason !== "string" || !entry.reason.trim() ||
        (entry.occurrence !== undefined && (!Number.isSafeInteger(entry.occurrence) || entry.occurrence < 0)) ||
        !Array.isArray(entry.fingerprints) || entry.fingerprints.length === 0 ||
        entry.fingerprints.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) {
      throw new Error("Invalid known-failure identity, rationale or fingerprint.");
    }
    const key = testKey(entry);
    if (failures.has(key)) throw new Error("Duplicate known-failure identity.");
    failures.set(key, entry);
  }
  const allowedSkipped = new Set(baseline.skipped.map(testKey));
  if (allowedSkipped.size !== baseline.skipped.length) throw new Error("Duplicate skipped-test identity.");
  const seen = new Set();
  const known = [];
  const unexpected = [];
  const skipped = [];
  let passed = 0;
  for (const test of observed.tests) {
    const key = testKey(test);
    if (seen.has(key)) {
      unexpected.push({ ...test, problem: "duplicate-test-identity" });
      continue;
    }
    seen.add(key);
    if (test.state === "passed") {
      passed += 1;
    } else if (test.state === "skipped" && allowedSkipped.delete(key)) {
      skipped.push(test);
    } else if (test.state === "failed" && failures.has(key) &&
        JSON.stringify(test.fingerprints) === JSON.stringify(failures.get(key).fingerprints)) {
      known.push(test);
      failures.delete(key);
    } else {
      unexpected.push(test);
    }
  }
  const unresolvedBaseline = [...failures.values()];
  const missingSkips = [...allowedSkipped];
  const complete = observed.reason === "passed" || observed.reason === "failed";
  const verdict = complete && observed.tests.length > 0 && observed.errors.length === 0 &&
    unexpected.length === 0 && unresolvedBaseline.length === 0 && missingSkips.length === 0
    ? "PASS" : "FAIL";
  return {
    verdict,
    passed,
    knownFailureCount: known.length,
    skippedCount: skipped.length,
    known,
    unexpected,
    unresolvedBaseline,
    missingSkips,
    errors: observed.errors,
    reason: observed.reason
  };
}

// Vitest's supported reporter API exposes collection/hook and unhandled errors
// separately from test assertions. None of those are permitted baseline failures.
export default class FullRegressionReporter {
  onTestRunEnd(modules, unhandledErrors, reason) {
    const tests = [];
    const errors = [...unhandledErrors];
    for (const module of modules) {
      errors.push(...module.errors());
      for (const suite of module.children.allSuites()) errors.push(...suite.errors());
      const occurrences = new Map();
      for (const test of module.children.allTests()) {
        const occurrence = occurrences.get(test.fullName) ?? 0;
        occurrences.set(test.fullName, occurrence + 1);
        const result = test.result();
        tests.push({
          file: module.relativeModuleId.replaceAll("\\", "/"),
          name: test.fullName,
          occurrence,
          state: result.state,
          fingerprints: (result.errors ?? []).map(errorFingerprint),
          messages: (result.errors ?? []).map((error) => stripVTControlCharacters(error.message ?? ""))
        });
      }
    }
    const observed = { reason, tests, errors };
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const evaluation = evaluateRegression(observed, baseline);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify({ schemaVersion: 1, observed, evaluation }, null, 2) + "\n");
    console.log(`\nFull regression gate: ${evaluation.verdict}; ${evaluation.passed} passed, ` +
      `${evaluation.knownFailureCount} exact known failures, ${evaluation.unexpected.length} unexpected, ` +
      `${errors.length} collection/hook/unhandled errors.`);
    if (evaluation.unresolvedBaseline.length > 0) {
      console.error("Known tests passed, disappeared, or changed failure: reconcile the baseline explicitly.");
    }
  }
}

export function acceptsVitestExit(status, signal, evaluation) {
  return signal === null && evaluation.verdict === "PASS" &&
    status === (evaluation.knownFailureCount > 0 ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) throw new Error("The full regression gate does not accept test filters.");
  mkdirSync(dirname(reportPath), { recursive: true });
  rmSync(reportPath, { force: true });
  const jsonReportPath = resolve(root, ".artifacts/ci/vitest-full.json");
  rmSync(jsonReportPath, { force: true });
  const result = spawnSync(process.execPath, [
    resolve(root, "node_modules/vitest/vitest.mjs"), "run",
    "--reporter=default", "--reporter=json", `--reporter=${fileURLToPath(import.meta.url)}`,
    `--outputFile.json=${jsonReportPath}`
  ], { cwd: root, stdio: "inherit", timeout: 20 * 60 * 1000 });
  try {
    if (result.error) throw result.error;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    process.exitCode = acceptsVitestExit(result.status, result.signal, report.evaluation) ? 0 : 1;
  } catch (error) {
    console.error(`Full regression did not complete with fresh evidence: ${error.message}`);
    process.exitCode = 1;
  }
}
