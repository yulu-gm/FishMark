import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createElectronStepHandlers } from "./electron";
import { appShellStartupScenario } from "../scenarios/app-shell-startup";
import { listEnterBehaviorBasicScenario } from "../scenarios/list-enter-behavior-basic";
import { openMarkdownFileBasicScenario } from "../scenarios/open-markdown-file-basic";

const repoRoot = process.cwd();
const openMarkdownFixture = resolve(repoRoot, "fixtures/test-harness/open-markdown-file-basic.md");
const listEnterFixture = resolve(repoRoot, "fixtures/test-harness/list-enter-behavior-basic.md");
const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

describe("createElectronStepHandlers", () => {
  it("keeps the list-enter fixture aligned with the scenario assumptions", async () => {
    const fixturePath = listEnterFixture;

    await expect(readFile(fixturePath, "utf8")).resolves.toSatisfy((content: string) => {
      return normalizeLineEndings(content) === "- [ ] todo\n";
    });
  });

  it("maps the startup scenario to ready, empty-workspace, and close-window commands", async () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: appShellStartupScenario,
      cwd: repoRoot,
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
      cwd: repoRoot,
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
        fixturePath: openMarkdownFixture
      },
      {
        type: "assert-editor-content",
        expectedContent: "# Fixture\n"
      },
      {
        type: "assert-document-path",
        expectedPath: openMarkdownFixture
      }
    ]);
  });

  it("throws when the editor command reports failure", async () => {
    const handlers = createElectronStepHandlers({
      scenario: appShellStartupScenario,
      cwd: repoRoot,
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

  it("maps the list-enter scenario to selection, enter, and content assertions", async () => {
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: listEnterBehaviorBasicScenario,
      cwd: repoRoot,
      runCommand
    });

    await handlers["open-list-fixture"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[1]!,
      signal: new AbortController().signal
    });
    await handlers["place-cursor-at-task-end"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[2]!,
      signal: new AbortController().signal
    });
    await handlers["press-enter-to-continue-task"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[3]!,
      signal: new AbortController().signal
    });
    await handlers["assert-task-continued"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[4]!,
      signal: new AbortController().signal
    });
    await handlers["place-cursor-at-empty-task-end"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[5]!,
      signal: new AbortController().signal
    });
    await handlers["press-enter-to-exit-empty-task"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[6]!,
      signal: new AbortController().signal
    });
    await handlers["assert-empty-task-exit"]?.({
      scenarioId: listEnterBehaviorBasicScenario.id,
      step: listEnterBehaviorBasicScenario.steps[7]!,
      signal: new AbortController().signal
    });

    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      {
        type: "open-fixture-file",
        fixturePath: listEnterFixture
      },
      {
        type: "set-editor-selection",
        anchor: 10,
        head: 10
      },
      {
        type: "press-editor-enter"
      },
      {
        type: "assert-editor-content",
        expectedContent: "- [ ] todo\n- [ ] \n"
      },
      {
        type: "set-editor-selection",
        anchor: 17,
        head: 17
      },
      {
        type: "press-editor-enter"
      },
      {
        type: "assert-editor-content",
        expectedContent: "- [ ] todo\n"
      }
    ]);
  });
});
