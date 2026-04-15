import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  buildResultDocument,
  buildStepTraceDocument,
  runDirName,
  writeRunArtifacts
} from "./artifacts";
import type { RunnerEvent, ScenarioResult } from "../runner";

function sampleResult(): ScenarioResult {
  return {
    scenarioId: "sample",
    status: "passed",
    steps: [
      {
        id: "a",
        status: "passed",
        startedAt: 1_000,
        finishedAt: 1_010,
        durationMs: 10
      }
    ],
    startedAt: 1_000,
    finishedAt: 1_010,
    durationMs: 10
  };
}

describe("artifact builders", () => {
  it("stamps protocol version and ISO timestamps", () => {
    const doc = buildResultDocument(sampleResult(), {
      stepTimeoutMs: 2_000,
      cliVersion: "0.0.0-test"
    });
    expect(doc.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(doc.meta.startedAtIso).toBe(new Date(1_000).toISOString());
    expect(doc.meta.stepTimeoutMs).toBe(2_000);
    expect(doc.meta.cliVersion).toBe("0.0.0-test");
  });

  it("runDirName is filesystem-safe and starts with ISO timestamp", () => {
    const name = runDirName("my-scenario", Date.UTC(2026, 3, 15, 12, 34, 56));
    expect(name).toMatch(/^2026-04-15T12-34-56Z-my-scenario$/);
  });
});

describe("writeRunArtifacts", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "yulora-cli-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes result.json and step-trace.json under the run dir", () => {
    const result = buildResultDocument(sampleResult(), {
      stepTimeoutMs: 1_000,
      cliVersion: "0.0.0-test"
    });
    const events: RunnerEvent[] = [
      { type: "scenario-start", scenarioId: "sample", at: 1_000 }
    ];
    const trace = buildStepTraceDocument("sample", events);

    const written = writeRunArtifacts(root, result, trace);

    expect(written.runDir.startsWith(root)).toBe(true);
    const parsedResult = JSON.parse(readFileSync(written.resultPath, "utf8"));
    const parsedTrace = JSON.parse(readFileSync(written.stepTracePath, "utf8"));
    expect(parsedResult.scenarioId).toBe("sample");
    expect(parsedResult.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(parsedTrace.events).toHaveLength(1);
  });
});
