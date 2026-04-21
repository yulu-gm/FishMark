import type { TestScenario } from "../scenario";

export const complexEditorNavigationSmokeScenario: TestScenario = {
  id: "complex-editor-navigation-smoke",
  title: "Navigate across a complex Markdown fixture",
  summary:
    "Opens the shared complex fixture and verifies ArrowUp/ArrowDown behavior across blockquotes and tables.",
  surface: "editor",
  tags: ["smoke", "editor", "rendering"],
  preconditions: ["complex navigation fixture markdown file available on disk"],
  steps: [
    {
      id: "launch-dev-shell",
      title: "Launch the desktop shell in editor mode",
      kind: "setup"
    },
    {
      id: "open-complex-navigation-fixture",
      title: "Open the shared complex navigation fixture",
      kind: "action"
    },
    {
      id: "place-cursor-below-blockquote",
      title: "Move the cursor to the blank line below the blockquote",
      kind: "action"
    },
    {
      id: "press-arrow-up-into-blockquote",
      title: "Press ArrowUp to enter the last blockquote source line",
      kind: "action"
    },
    {
      id: "assert-blockquote-tail-selection",
      title: "Assert the cursor entered the last blockquote line",
      kind: "assertion"
    },
    {
      id: "place-cursor-above-table",
      title: "Move the cursor to the heading line above the table",
      kind: "action"
    },
    {
      id: "press-arrow-down-into-table",
      title: "Press ArrowDown to enter the first editable table row",
      kind: "action"
    },
    {
      id: "assert-table-head-selection",
      title: "Assert the cursor entered the expected table cell from above",
      kind: "assertion"
    },
    {
      id: "place-cursor-below-table",
      title: "Move the cursor to the paragraph line below the table",
      kind: "action"
    },
    {
      id: "press-arrow-up-into-table",
      title: "Press ArrowUp to enter the last editable table row",
      kind: "action"
    },
    {
      id: "assert-table-tail-selection",
      title: "Assert the cursor entered the expected table cell from below",
      kind: "assertion"
    }
  ]
};
