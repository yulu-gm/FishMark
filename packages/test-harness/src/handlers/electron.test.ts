import { describe, expect, it, vi } from "vitest";

import { createElectronStepHandlers } from "./electron";
import { appShellStartupScenario } from "../scenarios/app-shell-startup";
import { openMarkdownFileBasicScenario } from "../scenarios/open-markdown-file-basic";

describe("createElectronStepHandlers", () => {
  it("maps the startup scenario to ready, empty-workspace, and close-window commands", async () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: appShellStartupScenario,
      cwd: "D:/MyAgent/Yulora/Yulora",
      runCommand
    });

    await handlers["launch-dev-shell"]?.({
      scenarioId: appShellStartupScenario.id,
      step: appShellStartupScenario.steps[0]!,
      signal: new AbortController().signal
    });
    await handlers["wait-for-empty-workspace"]?.({
      scenarioId: appShellStartupScenario.id,
      step: appShellStartupScenario.steps[1]!,
      signal: new AbortController().signal
    });
    await handlers["close-shell"]?.({
      scenarioId: appShellStartupScenario.id,
      step: appShellStartupScenario.steps[2]!,
      signal: new AbortController().signal
    });

    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      { type: "wait-for-editor-ready" },
      { type: "assert-empty-workspace" },
      { type: "close-editor-window" }
    ]);
  });

  it("maps the open-markdown scenario to open/assert commands using the repo fixture", async () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: openMarkdownFileBasicScenario,
      cwd: "D:/MyAgent/Yulora/Yulora",
      runCommand,
      readTextFile: vi.fn().mockResolvedValue("# Fixture\n")
    });

    await handlers["select-fixture"]?.({
      scenarioId: openMarkdownFileBasicScenario.id,
      step: openMarkdownFileBasicScenario.steps[2]!,
      signal: new AbortController().signal
    });
    await handlers["assert-editor-content"]?.({
      scenarioId: openMarkdownFileBasicScenario.id,
      step: openMarkdownFileBasicScenario.steps[3]!,
      signal: new AbortController().signal
    });
    await handlers["assert-document-meta"]?.({
      scenarioId: openMarkdownFileBasicScenario.id,
      step: openMarkdownFileBasicScenario.steps[4]!,
      signal: new AbortController().signal
    });

    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      {
        type: "open-fixture-file",
        fixturePath: "D:\\MyAgent\\Yulora\\Yulora\\fixtures\\test-harness\\open-markdown-file-basic.md"
      },
      {
        type: "assert-editor-content",
        expectedContent: "# Fixture\n"
      },
      {
        type: "assert-document-path",
        expectedPath: "D:\\MyAgent\\Yulora\\Yulora\\fixtures\\test-harness\\open-markdown-file-basic.md"
      }
    ]);
  });

  it("throws when the editor command reports failure", async () => {
    const handlers = createElectronStepHandlers({
      scenario: appShellStartupScenario,
      cwd: "D:/MyAgent/Yulora/Yulora",
      runCommand: vi.fn().mockResolvedValue({
        ok: false,
        message: "renderer failure"
      })
    });

    await expect(
      handlers["launch-dev-shell"]?.({
        scenarioId: appShellStartupScenario.id,
        step: appShellStartupScenario.steps[0]!,
        signal: new AbortController().signal
      })
    ).rejects.toThrow("renderer failure");
  });
});
