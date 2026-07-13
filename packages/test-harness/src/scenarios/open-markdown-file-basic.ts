import type { TestScenario } from "../scenario";

export const openMarkdownFileBasicScenario: TestScenario = {
  id: "open-markdown-file-basic",
  title: "Open a Markdown file via File > Open",
  summary:
    "Opens a UTF-8 Markdown fixture and verifies its content reaches the CodeMirror editor.",
  surface: "editor",
  tags: ["smoke", "editor", "file-io"],
  execution: {
    kind: "headless",
    unsupportedSteps: {
      "select-fixture": "Fixture picker automation is not implemented in the headless CLI yet."
    }
  },
  preconditions: ["fixture markdown file available on disk"],
  steps: [
    {
      id: "launch-dev-shell",
      title: "Launch the desktop shell in editor mode",
      kind: "setup"
    },
    {
      id: "invoke-open-command",
      title: "Invoke File > Open... menu command",
      kind: "action"
    },
    {
      id: "select-fixture",
      title: "Choose the Markdown fixture in the file dialog",
      kind: "action"
    },
    {
      id: "assert-editor-content",
      title: "Assert the editor contains the fixture content",
      kind: "assertion",
      description: "Compares the editor value to the fixture text byte-for-byte."
    },
    {
      id: "assert-document-meta",
      title: "Assert the document name and path are shown in the header",
      kind: "assertion"
    }
  ]
};
