export const EDITOR_TEST_COMMAND_EVENT = "yulora:editor-test-command";
export const COMPLETE_EDITOR_TEST_COMMAND_CHANNEL = "yulora:complete-editor-test-command";

export type EditorTestCommand =
  | { type: "wait-for-editor-ready" }
  | { type: "open-fixture-file"; fixturePath: string }
  | { type: "set-editor-content"; content: string }
  | { type: "insert-editor-text"; text: string }
  | { type: "save-document" }
  | { type: "assert-document-path"; expectedPath: string }
  | { type: "assert-editor-content"; expectedContent: string }
  | { type: "assert-dirty-state"; expectedDirty: boolean }
  | { type: "assert-empty-workspace" }
  | { type: "close-editor-window" };

export type EditorTestCommandEnvelope = {
  sessionId: string;
  commandId: string;
  command: EditorTestCommand;
};

export type EditorTestCommandResult = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};

export type EditorTestCommandResultEnvelope = {
  sessionId: string;
  commandId: string;
  result: EditorTestCommandResult;
};
