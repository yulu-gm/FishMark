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

  const complexFixturePath = resolve(input.cwd, "fixtures/test-harness/complex-editor-navigation.md");

  const buildComplexFixtureContext = (source: string) => {
    const orderedEmptyItem = "3. \n4. 有序列表第四项";
    const expectedIndentedSource = source.replace(
      "1. 有序列表第一项\n2. 有序列表第二项\n3. \n4. 有序列表第四项",
      "1. 有序列表第一项\n  1. 有序列表第二项\n2. \n3. 有序列表第四项"
    );
    const expectedOrderedContinuationSource = source.replace(
      orderedEmptyItem,
      "3. \n4. \n5. 有序列表第四项"
    );

    return {
      source,
      blockquoteTailAnchor: source.indexOf("第三条引用内容"),
      blockquoteBlankLineAnchor: source.indexOf("\n\n```ts") + 1,
      tableAboveBlankLineAnchor: source.indexOf("\n\n| name | qty | note |") + 1,
      tableHeadEntryAnchor: source.indexOf("name") + "name".length,
      tableBelowBlankLineAnchor: source.indexOf("\n\n表格下方的普通段落第一行。") + 1,
      tableTailEntryAnchor: source.indexOf("ink") + "ink".length,
      plainListItemAnchor: source.indexOf("有序列表第二项"),
      expectedIndentedSource,
      indentedListItemAnchor: expectedIndentedSource.indexOf("有序列表第二项"),
      emptyOrderedItemAnchor: source.indexOf("3. \n4. 有序列表第四项") + "3. ".length,
      expectedOrderedContinuationSource,
      orderedContinuationAnchor:
        expectedOrderedContinuationSource.indexOf("4. \n5. 有序列表第四项") + "4. ".length,
      thirdBlockquoteLineAnchor: source.indexOf("第三条引用内容"),
      expectedBackspaceAnchor: source.indexOf("> 第三条引用内容") - 1
    };
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

  if (input.scenario.id === "list-enter-behavior-basic") {
    const fixturePath = resolve(input.cwd, "fixtures/test-harness/list-enter-behavior-basic.md");

    return {
      "launch-dev-shell": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "open-list-fixture": ({ signal }) =>
        runCheckedCommand({ type: "open-fixture-file", fixturePath }, signal),
      "place-cursor-at-task-end": ({ signal }) =>
        runCheckedCommand({ type: "set-editor-selection", anchor: 10, head: 10 }, signal),
      "press-enter-to-continue-task": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-enter" }, signal),
      "assert-task-continued": ({ signal }) =>
        runCheckedCommand(
          { type: "assert-editor-content", expectedContent: "- [ ] todo\n- [ ] \n" },
          signal
        ),
      "place-cursor-at-empty-task-end": ({ signal }) =>
        runCheckedCommand({ type: "set-editor-selection", anchor: 17, head: 17 }, signal),
      "press-enter-to-exit-empty-task": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-enter" }, signal),
      "assert-empty-task-exit": ({ signal }) =>
        runCheckedCommand(
          { type: "assert-editor-content", expectedContent: "- [ ] todo\n" },
          signal
        )
    };
  }

  if (input.scenario.id === "complex-editor-navigation-smoke") {
    return {
      "launch-dev-shell": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "open-complex-navigation-fixture": ({ signal }) =>
        runCheckedCommand({ type: "open-fixture-file", fixturePath: complexFixturePath }, signal),
      "place-cursor-below-blockquote": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.blockquoteBlankLineAnchor, head: ctx.blockquoteBlankLineAnchor },
          signal
        );
      },
      "press-arrow-up-into-blockquote": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-arrow-up" }, signal),
      "assert-blockquote-tail-selection": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          {
            type: "assert-editor-selection",
            expectedAnchor: ctx.blockquoteTailAnchor,
            expectedHead: ctx.blockquoteTailAnchor
          },
          signal
        );
      },
      "place-cursor-above-table": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.tableAboveBlankLineAnchor, head: ctx.tableAboveBlankLineAnchor },
          signal
        );
      },
      "press-arrow-down-into-table": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-arrow-down" }, signal),
      "assert-table-head-selection": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          {
            type: "assert-editor-selection",
            expectedAnchor: ctx.tableHeadEntryAnchor,
            expectedHead: ctx.tableHeadEntryAnchor
          },
          signal
        );
      },
      "place-cursor-below-table": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.tableBelowBlankLineAnchor, head: ctx.tableBelowBlankLineAnchor },
          signal
        );
      },
      "press-arrow-up-into-table": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-arrow-up" }, signal),
      "assert-table-tail-selection": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          {
            type: "assert-editor-selection",
            expectedAnchor: ctx.tableTailEntryAnchor,
            expectedHead: ctx.tableTailEntryAnchor
          },
          signal
        );
      }
    };
  }

  if (input.scenario.id === "complex-editor-structure-keys") {
    return {
      "launch-dev-shell": ({ signal }) =>
        runCheckedCommand({ type: "wait-for-editor-ready" }, signal),
      "open-complex-structure-fixture": ({ signal }) =>
        runCheckedCommand({ type: "open-fixture-file", fixturePath: complexFixturePath }, signal),
      "place-cursor-at-plain-list-item": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.plainListItemAnchor, head: ctx.plainListItemAnchor },
          signal
        );
      },
      "press-tab-to-indent-list-item": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-tab" }, signal),
      "assert-list-indented": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "assert-editor-content", expectedContent: ctx.expectedIndentedSource },
          signal
        );
      },
      "place-cursor-at-indented-list-item": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.indentedListItemAnchor, head: ctx.indentedListItemAnchor },
          signal
        );
      },
      "press-shift-tab-to-outdent-list-item": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-tab", shiftKey: true }, signal),
      "assert-list-outdented": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "assert-editor-content", expectedContent: ctx.source },
          signal
        );
      },
      "place-cursor-at-empty-ordered-item": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "set-editor-selection", anchor: ctx.emptyOrderedItemAnchor, head: ctx.emptyOrderedItemAnchor },
          signal
        );
      },
      "press-enter-to-continue-ordered-list": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-enter" }, signal),
      "assert-ordered-list-continued": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "assert-editor-content", expectedContent: ctx.expectedOrderedContinuationSource },
          signal
        );
        await runCheckedCommand(
          {
            type: "assert-editor-selection",
            expectedAnchor: ctx.orderedContinuationAnchor,
            expectedHead: ctx.orderedContinuationAnchor
          },
          signal
        );
      },
      "place-cursor-at-third-blockquote-line": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          {
            type: "set-editor-selection",
            anchor: ctx.thirdBlockquoteLineAnchor,
            head: ctx.thirdBlockquoteLineAnchor
          },
          signal
        );
      },
      "press-backspace-within-blockquote": ({ signal }) =>
        runCheckedCommand({ type: "press-editor-backspace" }, signal),
      "assert-blockquote-backspace-selection": async ({ signal }) => {
        const fixture = await readTextFile(complexFixturePath);
        const ctx = buildComplexFixtureContext(fixture);
        await runCheckedCommand(
          { type: "assert-editor-content", expectedContent: ctx.source },
          signal
        );
        await runCheckedCommand(
          {
            type: "assert-editor-selection",
            expectedAnchor: ctx.expectedBackspaceAnchor,
            expectedHead: ctx.expectedBackspaceAnchor
          },
          signal
        );
      }
    };
  }

  return {};
}
