import { describe, expect, it, vi } from "vitest";

import type { TestScenario } from "../scenario";
import { createCapabilityStepHandlers } from "./capability";

function scenario(id: string, kind: "headless" | "electron-batch"): TestScenario {
  return {
    id,
    title: id,
    summary: id,
    surface: "editor",
    tags: ["editor"],
    execution:
      kind === "electron-batch"
        ? { kind, runner: "editor-behavior-manifest" }
        : { kind },
    steps: [{ id: "execute", title: "execute", kind: "action" }]
  };
}

describe("createCapabilityStepHandlers", () => {
  it("dispatches electron batches by capability without checking scenario id", () => {
    const buildElectronBatch = vi.fn(() => ({ execute: () => undefined }));
    const first = scenario("arbitrary-one", "electron-batch");
    const second = scenario("arbitrary-two", "electron-batch");

    expect(
      createCapabilityStepHandlers(first, { buildElectronBatch })
    ).toHaveProperty("execute");
    expect(
      createCapabilityStepHandlers(second, { buildElectronBatch })
    ).toHaveProperty("execute");
    expect(buildElectronBatch).toHaveBeenNthCalledWith(1, first);
    expect(buildElectronBatch).toHaveBeenNthCalledWith(2, second);
  });

  it("fails closed when an electron-batch adapter is unavailable", () => {
    const target = scenario("no-adapter", "electron-batch");
    const handler = createCapabilityStepHandlers(target)["execute"]!;

    expect(() =>
      handler({
        scenarioId: target.id,
        step: target.steps[0]!,
        signal: new AbortController().signal
      })
    ).toThrow(/requires Electron batch runner/i);
  });
});
