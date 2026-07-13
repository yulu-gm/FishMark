import type { TestScenario } from "../scenario";

export const listEnterBehaviorBasicScenario: TestScenario = {
  id: "list-enter-behavior-basic",
  title: "Continue and exit a task list with Enter",
  summary:
    "Opens a task-list fixture, continues a non-empty item, then exits an empty item.",
  surface: "editor",
  tags: ["smoke", "editor", "rendering"],
  execution: { kind: "headless" },
  preconditions: ["fixture markdown file available on disk"],
  steps: [
    {
      id: "launch-dev-shell",
      title: "Launch the desktop shell in editor mode",
      kind: "setup"
    },
    {
      id: "open-list-fixture",
      title: "Open the task-list fixture",
      kind: "action"
    },
    {
      id: "place-cursor-at-task-end",
      title: "Move the cursor to the task item end",
      kind: "action"
    },
    {
      id: "press-enter-to-continue-task",
      title: "Press Enter to continue the task item",
      kind: "action"
    },
    {
      id: "assert-task-continued",
      title: "Assert a new empty task item was inserted",
      kind: "assertion"
    },
    {
      id: "place-cursor-at-empty-task-end",
      title: "Move the cursor to the empty task item end",
      kind: "action"
    },
    {
      id: "press-enter-to-exit-empty-task",
      title: "Press Enter to exit the empty task item",
      kind: "action"
    },
    {
      id: "assert-empty-task-exit",
      title: "Assert the empty task item was removed",
      kind: "assertion"
    }
  ]
};
