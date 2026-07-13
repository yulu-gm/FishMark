import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("RF-001 Electron manifest runner architecture", () => {
  it("exposes a formal editor-behavior command and an electron-batch capability", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const scenarioSource = read(
      "packages/test-harness/src/scenarios/editor-behavior-matrix.ts"
    );
    const runSource = read("packages/test-harness/src/cli/run.ts");

    expect(packageJson.scripts?.["test:editor-behavior"]).toBe(
      "node scripts/probe-editor-behavior.mjs"
    );
    expect(scenarioSource).toContain('kind: "electron-batch"');
    expect(runSource).toContain("createEditorBehaviorBatchStepHandlers");
    expect(scenarioSource).not.toContain('kind: "metadata-only"');
  });

  it("keeps execution planning and observation in independent test-only modules", () => {
    const requiredFiles = [
      "fixtures/editor-behavior/execution-plan.ts",
      "fixtures/editor-behavior/runner-protocol.ts",
      "src/renderer/editor-behavior-observer.ts",
      "src/renderer/editor-behavior-manifest-runner.ts",
      "src/renderer/editor-behavior-manifest-probe.html",
      "scripts/probe-editor-behavior.mjs",
      "scripts/electron-editor-behavior-main.cjs"
    ];

    for (const relativePath of requiredFiles) {
      expect(existsSync(path.join(root, relativePath)), relativePath).toBe(true);
    }
  });

  it("prevents the runner and observer from importing expected-result helpers", () => {
    const restrictedSources = [
      "fixtures/editor-behavior/execution-plan.ts",
      "src/renderer/editor-behavior-observer.ts",
      "src/renderer/editor-behavior-manifest-runner.ts"
    ].filter((relativePath) => existsSync(path.join(root, relativePath)));

    for (const relativePath of restrictedSources) {
      const source = read(relativePath);
      expect(source, relativePath).not.toMatch(
        /physicalLineExpectations|editorBehaviorResult|checkpoint\.result|\.classification\.evidence/u
      );
    }
  });
});
