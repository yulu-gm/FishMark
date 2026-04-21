export type ElectronEditorTestCommand =
  | { type: "wait-for-editor-ready" }
  | { type: "open-fixture-file"; fixturePath: string }
  | { type: "set-editor-content"; content: string }
  | { type: "insert-editor-text"; text: string }
  | { type: "set-editor-selection"; anchor: number; head?: number }
  | { type: "press-editor-enter" }
  | { type: "press-editor-backspace" }
  | { type: "press-editor-tab"; shiftKey?: boolean }
  | { type: "press-editor-arrow-up" }
  | { type: "press-editor-arrow-down" }
  | { type: "save-document" }
  | { type: "assert-document-path"; expectedPath: string }
  | { type: "assert-editor-content"; expectedContent: string }
  | { type: "assert-editor-selection"; expectedAnchor: number; expectedHead?: number }
  | { type: "assert-dirty-state"; expectedDirty: boolean }
  | { type: "assert-empty-workspace" }
  | { type: "close-editor-window" };

export type ElectronEditorTestCommandResult = {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};

export type EditorCommandRequestMessage = {
  type: "editor-test-command-request";
  sessionId: string;
  commandId: string;
  command: ElectronEditorTestCommand;
};

export type EditorCommandResultMessage = {
  type: "editor-test-command-result";
  sessionId: string;
  commandId: string;
  result: ElectronEditorTestCommandResult;
};

export function isEditorCommandResultMessage(value: unknown): value is EditorCommandResultMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "editor-test-command-result"
  );
}

export function createProcessEditorCommandRunner(input: {
  sessionId: string;
  sendMessage: (message: EditorCommandRequestMessage) => void;
  subscribeMessage: (
    listener: (message: unknown) => void
  ) => () => void;
}) {
  let nextCommandId = 1;

  return async function runCommand(
    command: ElectronEditorTestCommand,
    signal?: AbortSignal
  ): Promise<ElectronEditorTestCommandResult> {
    const commandId = `command-${nextCommandId++}`;

    return await new Promise<ElectronEditorTestCommandResult>((resolve, reject) => {
      const unsubscribe = input.subscribeMessage((message) => {
        if (!isEditorCommandResultMessage(message)) {
          return;
        }

        if (message.sessionId !== input.sessionId || message.commandId !== commandId) {
          return;
        }

        unsubscribe();
        if (signal && handleAbort) {
          signal.removeEventListener("abort", handleAbort);
        }
        resolve(message.result);
      });

      const handleAbort = () => {
        unsubscribe();
        reject(new Error(`Editor command ${commandId} aborted.`));
      };

      if (signal) {
        if (signal.aborted) {
          handleAbort();
          return;
        }

        signal.addEventListener("abort", handleAbort, { once: true });
      }

      input.sendMessage({
        type: "editor-test-command-request",
        sessionId: input.sessionId,
        commandId,
        command
      });
    });
  };
}
