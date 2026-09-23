import { pathToFileURL } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts/run-full-regression.mjs")).href;
const { evaluateRegression, errorFingerprint, acceptsVitestExit } = await import(moduleUrl);

const fingerprint = errorFingerprint({ name: "AssertionError", message: "mismatch", actual: 1, expected: 2 });
const known = { file: "src/example.test.ts", name: "example > frozen case", fingerprints: [fingerprint], reason: "Existing measured defect; owned by RF-902." };
const failed = { ...known, state: "failed" };
const passed = { file: "src/example.test.ts", name: "example > healthy case", state: "passed", fingerprints: [] };
const baseline = { schemaVersion: 1, failures: [known], skipped: [] };
const observed = { reason: "failed", errors: [], tests: [failed, passed] };

describe("full regression evidence gate", () => {
  it("accepts only the complete, exact known assertion set and reports it separately", () => {
    expect(evaluateRegression(observed, baseline)).toMatchObject({
      verdict: "PASS", passed: 1, knownFailureCount: 1, skippedCount: 0, unexpected: [], errors: []
    });
  });

  it("accepts an entirely green run only with an empty debt baseline", () => {
    expect(evaluateRegression({ ...observed, reason: "passed", tests: [passed] }, {
      schemaVersion: 1, failures: [], skipped: []
    }).verdict).toBe("PASS");
  });

  it.each([
    { ...failed, file: "src/other.test.ts" },
    { ...failed, name: "example > different case" },
    { ...failed, fingerprints: [errorFingerprint({ name: "AssertionError", message: "mismatch", actual: 3, expected: 2 })] }
  ])("rejects a same-count replacement failure: %j", (replacement) => {
    expect(evaluateRegression({ ...observed, tests: [replacement, passed] }, baseline).verdict).toBe("FAIL");
  });

  it.each([
    [passed],
    [{ ...failed, state: "passed", fingerprints: [] }, passed],
    [{ ...failed, state: "skipped" }, passed],
    [{ ...failed, state: "pending" }, passed],
    [failed, passed, passed],
    [failed, passed, { ...passed, name: "new unexpected skip", state: "skipped" }]
  ])("rejects missing, unexpectedly fixed, skipped, pending or duplicate tests: %j", (...tests) => {
    // it.each spreads each row's test objects into the callback.
    expect(evaluateRegression({ ...observed, tests }, baseline).verdict).toBe("FAIL");
  });

  it.each(["collection", "hook", "unhandled"])("does not baseline %s errors", (kind) => {
    expect(evaluateRegression({ ...observed, errors: [{ message: kind }] }, baseline).verdict).toBe("FAIL");
  });

  it("distinguishes identically named parameterized cases by occurrence", () => {
    expect(evaluateRegression({ ...observed, tests: [failed, passed, { ...passed, occurrence: 1 }] }, baseline))
      .toMatchObject({ verdict: "PASS", passed: 2, knownFailureCount: 1 });
  });

  it("rejects interrupted or empty evidence", () => {
    expect(evaluateRegression({ ...observed, reason: "interrupted" }, baseline).verdict).toBe("FAIL");
    expect(evaluateRegression({ reason: "passed", tests: [], errors: [] }, {
      schemaVersion: 1, failures: [], skipped: []
    }).verdict).toBe("FAIL");
  });

  it("requires explicitly declared skips to still exist exactly once", () => {
    const skip = { file: "src/example.test.ts", name: "platform skip", state: "skipped" };
    const withSkip = { ...baseline, skipped: [skip] };
    expect(evaluateRegression({ ...observed, tests: [...observed.tests, skip] }, withSkip).verdict).toBe("PASS");
    expect(evaluateRegression(observed, withSkip).verdict).toBe("FAIL");
  });

  it.each([
    { ...baseline, schemaVersion: 2 },
    { ...baseline, failures: [{ ...known, reason: "" }] },
    { ...baseline, failures: [{ ...known, fingerprints: [] }] },
    { ...baseline, failures: [{ ...known, fingerprints: ["not-a-hash"] }] },
    { ...baseline, failures: [known, known] }
  ])("rejects malformed or duplicate baseline records", (invalid) => {
    expect(() => evaluateRegression(observed, invalid)).toThrow();
  });

  it("ignores stack paths and ANSI but fingerprints assertion values and stable key order", () => {
    const first = { name: "AssertionError", message: "\u001b[31mmismatch\u001b[0m", actual: { b: 2, a: 1 }, expected: 2, stack: "/runner/a" };
    const second = { name: "AssertionError", message: "mismatch", actual: { a: 1, b: 2 }, expected: 2, stack: "C:\\runner\\b" };
    expect(errorFingerprint(first)).toBe(errorFingerprint(second));
    expect(errorFingerprint(first)).not.toBe(errorFingerprint({ ...second, actual: { a: 9, b: 2 } }));
  });

  it("never turns abnormal process termination into a pass", () => {
    const evaluation = evaluateRegression(observed, baseline);
    expect(acceptsVitestExit(1, null, evaluation)).toBe(true);
    expect(acceptsVitestExit(0, null, evaluation)).toBe(false);
    expect(acceptsVitestExit(2, null, evaluation)).toBe(false);
    expect(acceptsVitestExit(null, "SIGTERM", evaluation)).toBe(false);
    expect(acceptsVitestExit(1, null, { ...evaluation, verdict: "FAIL" })).toBe(false);
    expect(acceptsVitestExit(0, null, { ...evaluation, knownFailureCount: 0 })).toBe(true);
  });
});
