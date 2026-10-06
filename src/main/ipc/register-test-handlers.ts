import { COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, type EditorTestCommandResultEnvelope } from "../../shared/editor-test-command";
import { OPEN_EDITOR_TEST_WINDOW_CHANNEL, START_SCENARIO_RUN_CHANNEL, INTERRUPT_SCENARIO_RUN_CHANNEL } from "../../shared/test-run-session";
import type { WebContents } from "electron";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";

export function registerTestHandlers(input: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  enabled: boolean;
  editorSessions: {
    ensureSession(): { sessionId: string };
    ownsSession(sessionId: string, sender: WebContents): boolean;
    completeCommand(payload: EditorTestCommandResultEnvelope): boolean;
  };
  runSessions: {
    startScenarioRun(input: { scenarioId: string }): Promise<{ runId: string }>;
    interruptScenarioRun(input: { runId: string }): boolean;
  };
}): void {
  if (!input.enabled) return;
  const { ipc, authorize, editorSessions, runSessions } = input;
  ipc.handle(OPEN_EDITOR_TEST_WINDOW_CHANNEL, (event, ...args) => {
    authorize(event, ["test-workbench"]);
    request.noArguments(args);
    editorSessions.ensureSession();
  });
  ipc.handle(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, (event, ...args) => {
    authorize(event, ["editor-test"]);
    const value = request.oneArgument(args);
    request.record(value);
    request.string(value.sessionId); request.string(value.commandId);
    request.record(value.result); request.boolean(value.result.ok);
    if (value.result.message !== undefined && typeof value.result.message !== "string") request.invalidRequest();
    if (value.result.details !== undefined) request.record(value.result.details);
    if (!editorSessions.ownsSession(value.sessionId, event.sender)) throw new Error("Foreign editor test session.");
    editorSessions.completeCommand(value as EditorTestCommandResultEnvelope);
  });
  ipc.handle(START_SCENARIO_RUN_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["test-workbench"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.scenarioId);
    const result = await runSessions.startScenarioRun({ scenarioId: value.scenarioId });
    check();
    return result;
  });
  ipc.handle(INTERRUPT_SCENARIO_RUN_CHANNEL, (event, ...args) => {
    authorize(event, ["test-workbench"]);
    const value = request.oneArgument(args);
    request.record(value); request.string(value.runId);
    runSessions.interruptScenarioRun({ runId: value.runId });
  });
}
