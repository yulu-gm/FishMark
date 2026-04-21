import type { TestScenario } from "../scenario";

export const complexEditorStructureKeysScenario: TestScenario = {
  id: "complex-editor-structure-keys",
  title: "Edit list and blockquote structures in the complex fixture",
  summary:
    "Uses the shared complex fixture to verify Tab, Shift-Tab, Enter, and Backspace behavior on structured Markdown blocks.",
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
      id: "open-complex-structure-fixture",
      title: "Open the shared complex navigation fixture",
      kind: "action"
    },
    {
      id: "place-cursor-at-plain-list-item",
      title: "Move the cursor to the ordered list item that will be indented",
      kind: "action"
    },
    {
      id: "press-tab-to-indent-list-item",
      title: "Press Tab to indent the list item",
      kind: "action"
    },
    {
      id: "assert-list-indented",
      title: "Assert the list item was indented",
      kind: "assertion"
    },
    {
      id: "place-cursor-at-indented-list-item",
      title: "Move the cursor to the indented list item",
      kind: "action"
    },
    {
      id: "press-shift-tab-to-outdent-list-item",
      title: "Press Shift-Tab to outdent the list item",
      kind: "action"
    },
    {
      id: "assert-list-outdented",
      title: "Assert the list item was restored",
      kind: "assertion"
    },
    {
      id: "place-cursor-at-empty-ordered-item",
      title: "Move the cursor to the empty ordered list item",
      kind: "action"
    },
    {
      id: "press-enter-to-continue-ordered-list",
      title: "Press Enter to continue the ordered list",
      kind: "action"
    },
    {
      id: "assert-ordered-list-continued",
      title: "Assert the ordered list was continued and renumbered",
      kind: "assertion"
    },
    {
      id: "place-cursor-at-third-blockquote-line",
      title: "Move the cursor to the third blockquote source line",
      kind: "action"
    },
    {
      id: "press-backspace-within-blockquote",
      title: "Press Backspace at the third blockquote line start",
      kind: "action"
    },
    {
      id: "assert-blockquote-backspace-selection",
      title: "Assert Backspace moved the selection to the previous blockquote line end",
      kind: "assertion"
    }
  ]
};
