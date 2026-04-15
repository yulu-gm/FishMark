import { describe, expect, it } from "vitest";

import { DEFAULT_OUT_DIR, DEFAULT_STEP_TIMEOUT_MS, parseCliArgs } from "./args";

describe("parseCliArgs", () => {
  it("requires --id", () => {
    const parsed = parseCliArgs([]);
    expect(parsed.kind).toBe("error");
    if (parsed.kind === "error") {
      expect(parsed.message).toMatch(/--id/);
    }
  });

  it("parses --id with defaults", () => {
    const parsed = parseCliArgs(["--id", "app-shell-startup"]);
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") {
      expect(parsed.options).toEqual({
        scenarioId: "app-shell-startup",
        stepTimeoutMs: DEFAULT_STEP_TIMEOUT_MS,
        outDir: DEFAULT_OUT_DIR,
        writeArtifacts: true
      });
    }
  });

  it("parses --step-timeout, --out-dir, --no-artifacts", () => {
    const parsed = parseCliArgs([
      "--id",
      "x",
      "--step-timeout",
      "100",
      "--out-dir",
      "tmp/out",
      "--no-artifacts"
    ]);
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") {
      expect(parsed.options.stepTimeoutMs).toBe(100);
      expect(parsed.options.outDir).toBe("tmp/out");
      expect(parsed.options.writeArtifacts).toBe(false);
    }
  });

  it("rejects negative or non-numeric --step-timeout", () => {
    expect(parseCliArgs(["--id", "x", "--step-timeout", "nope"]).kind).toBe("error");
    expect(parseCliArgs(["--id", "x", "--step-timeout", "-5"]).kind).toBe("error");
  });

  it("rejects unknown flags", () => {
    expect(parseCliArgs(["--id", "x", "--bogus"]).kind).toBe("error");
  });

  it("returns help for -h / --help", () => {
    expect(parseCliArgs(["--help"]).kind).toBe("help");
    expect(parseCliArgs(["-h"]).kind).toBe("help");
  });
});
