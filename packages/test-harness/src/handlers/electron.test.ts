import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createElectronStepHandlers } from "./electron";
import { appShellStartupScenario } from "../scenarios/app-shell-startup";
import { complexEditorNavigationSmokeScenario } from "../scenarios/complex-editor-navigation-smoke";
import { complexEditorStructureKeysScenario } from "../scenarios/complex-editor-structure-keys";
import { listEnterBehaviorBasicScenario } from "../scenarios/list-enter-behavior-basic";
import { openMarkdownFileBasicScenario } from "../scenarios/open-markdown-file-basic";

const repoRoot = process.cwd();
const openMarkdownFixture = resolve(repoRoot, "fixtures/test-harness/open-markdown-file-basic.md");
const listEnterFixture = resolve(repoRoot, "fixtures/test-harness/list-enter-behavior-basic.md");
const complexNavigationFixture = resolve(repoRoot, "fixtures/test-harness/complex-editor-navigation.md");
const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

describe("createElectronStepHandlers", () => {
  it("keeps the list-enter fixture aligned with the scenario assumptions", async () => {
    const fixturePath = listEnterFixture;

    await expect(readFile(fixturePath, "utf8")).resolves.toSatisfy((content: string) => {
      return normalizeLineEndings(content) === "- [ ] todo\n";
    });
  });

  it("keeps the complex navigation fixture aligned with the scenario assumptions", async () => {
    const fixturePath = complexNavigationFixture;

    await expect(readFile(fixturePath, "utf8")).resolves.toSatisfy((content: string) => {
      const normalized = normalizeLineEndings(content);
      return (
        normalized.includes("> 第三条引用内容") &&
        normalized.includes("| name | qty | note |") &&
        normalized.includes("- 普通列表项") &&
        normalized.includes("3. \n4. 有序列表第四项")
      );
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

  it("maps the complex navigation scenario to ArrowUp/ArrowDown and selection assertions", async () => {
    const fixtureContent = normalizeLineEndings(await readFile(complexNavigationFixture, "utf8"));
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: complexEditorNavigationSmokeScenario,
      cwd: repoRoot,
      runCommand,
      readTextFile: vi.fn().mockResolvedValue(fixtureContent)
    });

    await handlers["open-complex-navigation-fixture"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[1]!,
      signal: new AbortController().signal
    });
    await handlers["place-cursor-below-blockquote"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[2]!,
      signal: new AbortController().signal
    });
    await handlers["press-arrow-up-into-blockquote"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[3]!,
      signal: new AbortController().signal
    });
    await handlers["assert-blockquote-tail-selection"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[4]!,
      signal: new AbortController().signal
    });
    await handlers["place-cursor-above-table"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[5]!,
      signal: new AbortController().signal
    });
    await handlers["press-arrow-down-into-table"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[6]!,
      signal: new AbortController().signal
    });
    await handlers["assert-table-head-selection"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[7]!,
      signal: new AbortController().signal
    });
    await handlers["place-cursor-below-table"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[8]!,
      signal: new AbortController().signal
    });
    await handlers["press-arrow-up-into-table"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[9]!,
      signal: new AbortController().signal
    });
    await handlers["assert-table-tail-selection"]?.({
      scenarioId: complexEditorNavigationSmokeScenario.id,
      step: complexEditorNavigationSmokeScenario.steps[10]!,
      signal: new AbortController().signal
    });

    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      {
        type: "open-fixture-file",
        fixturePath: complexNavigationFixture
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("\n\n```ts") + 1,
        head: fixtureContent.indexOf("\n\n```ts") + 1
      },
      {
        type: "press-editor-arrow-up"
      },
      {
        type: "assert-editor-selection",
        expectedAnchor: fixtureContent.indexOf("第三条引用内容"),
        expectedHead: fixtureContent.indexOf("第三条引用内容")
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("\n\n| name | qty | note |") + 1,
        head: fixtureContent.indexOf("\n\n| name | qty | note |") + 1
      },
      {
        type: "press-editor-arrow-down"
      },
      {
        type: "assert-editor-selection",
        expectedAnchor: fixtureContent.indexOf("name") + "name".length,
        expectedHead: fixtureContent.indexOf("name") + "name".length
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("\n\n表格下方的普通段落第一行。") + 1,
        head: fixtureContent.indexOf("\n\n表格下方的普通段落第一行。") + 1
      },
      {
        type: "press-editor-arrow-up"
      },
      {
        type: "assert-editor-selection",
        expectedAnchor: fixtureContent.indexOf("ink") + "ink".length,
        expectedHead: fixtureContent.indexOf("ink") + "ink".length
      }
    ]);
  });

  it("maps the complex structure scenario to Tab, Shift-Tab, Enter, Backspace, and assertions", async () => {
    const fixtureContent = normalizeLineEndings(await readFile(complexNavigationFixture, "utf8"));
    const indentedContent = fixtureContent.replace(
      "1. 有序列表第一项\n2. 有序列表第二项\n3. \n4. 有序列表第四项",
      "1. 有序列表第一项\n  1. 有序列表第二项\n2. \n3. 有序列表第四项"
    );
    const orderedContinuationContent = fixtureContent.replace(
      "3. \n4. 有序列表第四项",
      "3. \n4. \n5. 有序列表第四项"
    );
    const runCommand = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createElectronStepHandlers({
      scenario: complexEditorStructureKeysScenario,
      cwd: repoRoot,
      runCommand,
      readTextFile: vi.fn().mockResolvedValue(fixtureContent)
    });

    for (let index = 1; index < complexEditorStructureKeysScenario.steps.length; index += 1) {
      await handlers[complexEditorStructureKeysScenario.steps[index]!.id]?.({
        scenarioId: complexEditorStructureKeysScenario.id,
        step: complexEditorStructureKeysScenario.steps[index]!,
        signal: new AbortController().signal
      });
    }

    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      {
        type: "open-fixture-file",
        fixturePath: complexNavigationFixture
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("有序列表第二项"),
        head: fixtureContent.indexOf("有序列表第二项")
      },
      {
        type: "press-editor-tab"
      },
      {
        type: "assert-editor-content",
        expectedContent: indentedContent
      },
      {
        type: "set-editor-selection",
        anchor: indentedContent.indexOf("有序列表第二项"),
        head: indentedContent.indexOf("有序列表第二项")
      },
      {
        type: "press-editor-tab",
        shiftKey: true
      },
      {
        type: "assert-editor-content",
        expectedContent: fixtureContent
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("3. \n4. 有序列表第四项") + "3. ".length,
        head: fixtureContent.indexOf("3. \n4. 有序列表第四项") + "3. ".length
      },
      {
        type: "press-editor-enter"
      },
      {
        type: "assert-editor-content",
        expectedContent: orderedContinuationContent
      },
      {
        type: "assert-editor-selection",
        expectedAnchor: orderedContinuationContent.indexOf("4. \n5. 有序列表第四项") + "4. ".length,
        expectedHead: orderedContinuationContent.indexOf("4. \n5. 有序列表第四项") + "4. ".length
      },
      {
        type: "set-editor-selection",
        anchor: fixtureContent.indexOf("第三条引用内容"),
        head: fixtureContent.indexOf("第三条引用内容")
      },
      {
        type: "press-editor-backspace"
      },
      {
        type: "assert-editor-content",
        expectedContent: fixtureContent
      },
      {
        type: "assert-editor-selection",
        expectedAnchor: fixtureContent.indexOf("> 第三条引用内容") - 1,
        expectedHead: fixtureContent.indexOf("> 第三条引用内容") - 1
      }
    ]);
  });
});
