import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { StepHandlerMap } from "../runner";
import type { TestScenario } from "../scenario";
import type {
  ElectronEditorTestCommand,
  ElectronEditorTestCommandResult
} from "./electron-ipc";

type RunCommand = (
  command: ElectronEditorTestCommand,
  signal?: AbortSignal
) => Promise<ElectronEditorTestCommandResult>;

export function createElectronStepHandlers(input: {
  scenario: TestScenario;
  cwd: string;
  runCommand: RunCommand;
  readTextFile?: (targetPath: string) => Promise<string>;
}): StepHandlerMap {
  const readTextFile =
    input.readTextFile ??
    (async (targetPath: string) => {
      return await readFile(targetPath, "utf8");
    });

  const runCheckedCommand = async (
    command: ElectronEditorTestCommand,
    signal?: AbortSignal
  ): Promise<void> => {
    const result = await input.runCommand(command, signal);
    if (!result.ok) {
      throw new Error(result.message ?? "Editor test command failed.");
    }
  };

  if (input.scenario.id === "app-shell-startup") {
    return {
      "launch-dev-shell": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "wait-for-empty-workspace": ({ signal }) =>
        runCheckedCommand({ type: "assert-empty-workspace" }, signal),
      "close-shell": ({ signal }) =>
        runCheckedCommand({ type: "close-editor-window" }, signal)
    };
  }

  if (input.scenario.id === "open-markdown-file-basic") {
    const fixturePath = resolve(input.cwd, "fixtures/test-harness/open-markdown-file-basic.md");

    return {
      "launch-dev-shell": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "invoke-open-command": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "select-fixture": ({ signal }) =>
        runCheckedCommand({ type: "open-fixture-file", fixturePath }, signal),
      "assert-editor-content": async ({ signal }) => {
        const expectedContent = await readTextFile(fixturePath);
        await runCheckedCommand({ type: "assert-editor-content", expectedContent }, signal);
      },
      "assert-document-meta": ({ signal }) =>
        runCheckedCommand({ type: "assert-document-path", expectedPath: fixturePath }, signal)
    };
  }

  return {};
}
