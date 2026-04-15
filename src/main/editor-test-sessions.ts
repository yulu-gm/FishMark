import {
  EDITOR_TEST_COMMAND_EVENT,
  type EditorTestCommand,
  type EditorTestCommandEnvelope,
  type EditorTestCommandResult,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";

type EditorCommandWindow = {
  webContents: {
    send: (channel: string, payload: EditorTestCommandEnvelope) => void;
  };
  isDestroyed?: () => boolean;
  close?: () => void;
};

type PendingCommand = {
  readonly sessionId: string;
  readonly resolve: (result: EditorTestCommandResult) => void;
  readonly reject: (reason: unknown) => void;
  readonly abortSignal?: AbortSignal;
  readonly handleAbort?: () => void;
};

export function createEditorTestSessions(input: {
  openEditorWindow: () => EditorCommandWindow;
  createSessionId?: () => string;
  createCommandId?: () => string;
}) {
  let activeSession:
    | {
        readonly sessionId: string;
        readonly window: EditorCommandWindow;
      }
    | null = null;
  let nextSessionId = 1;
  let nextCommandId = 1;
  const pendingCommands = new Map<string, PendingCommand>();

  function isWindowUsable(window: EditorCommandWindow | null): window is EditorCommandWindow {
    return Boolean(window && !window.isDestroyed?.());
  }

  function ensureSession(): { sessionId: string } {
    if (!activeSession || !isWindowUsable(activeSession.window)) {
      activeSession = {
        sessionId: input.createSessionId?.() ?? `editor-session-${nextSessionId++}`,
        window: input.openEditorWindow()
      };
    }

    return { sessionId: activeSession.sessionId };
  }

  function resolveActiveSession(sessionId: string) {
    if (!activeSession || activeSession.sessionId !== sessionId || !isWindowUsable(activeSession.window)) {
      return null;
    }

    return activeSession;
  }

  return {
    ensureSession,
    async dispatchCommand(inputArgs: {
      sessionId: string;
      command: EditorTestCommand;
      signal?: AbortSignal;
    }): Promise<EditorTestCommandResult> {
      const session = resolveActiveSession(inputArgs.sessionId);
      if (!session) {
        throw new Error(`Unknown editor test session ${JSON.stringify(inputArgs.sessionId)}.`);
      }

      const commandId = input.createCommandId?.() ?? `command-${nextCommandId++}`;

      if (inputArgs.command.type === "close-editor-window") {
        session.window.close?.();
        return {
          ok: true,
          message: "Editor window closed."
        };
      }

      return await new Promise<EditorTestCommandResult>((resolve, reject) => {
        const handleAbort = () => {
          pendingCommands.delete(commandId);
          reject(new Error(`Editor test command ${commandId} aborted.`));
        };

        pendingCommands.set(commandId, {
          sessionId: session.sessionId,
          resolve,
          reject,
          abortSignal: inputArgs.signal,
          handleAbort
        });

        if (inputArgs.signal) {
          if (inputArgs.signal.aborted) {
            handleAbort();
            return;
          }

          inputArgs.signal.addEventListener("abort", handleAbort, { once: true });
        }

        session.window.webContents.send(EDITOR_TEST_COMMAND_EVENT, {
          sessionId: session.sessionId,
          commandId,
          command: inputArgs.command
        });
      });
    },
    completeCommand(payload: EditorTestCommandResultEnvelope): boolean {
      const pending = pendingCommands.get(payload.commandId);
      if (!pending || pending.sessionId !== payload.sessionId) {
        return false;
      }

      pendingCommands.delete(payload.commandId);
      if (pending.abortSignal && pending.handleAbort) {
        pending.abortSignal.removeEventListener("abort", pending.handleAbort);
      }
      pending.resolve(payload.result);
      return true;
    }
  };
}
