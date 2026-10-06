import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  EDITOR_TEST_COMMAND_EVENT,
  type EditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import type { TestBridge } from "../shared/test-bridge";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  OPEN_EDITOR_TEST_WINDOW_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  type ScenarioRunTerminal
} from "../shared/test-run-session";
import type { ProductIpcPort } from "./product-api";

export function createTestApi(ipc: ProductIpcPort): TestBridge {
  return {
    openEditorTestWindow: () => ipc.invoke(OPEN_EDITOR_TEST_WINDOW_CHANNEL),
    startScenarioRun: (input: { scenarioId: string }) =>
      ipc.invoke(START_SCENARIO_RUN_CHANNEL, input),
    interruptScenarioRun: (input: { runId: string }) =>
      ipc.invoke(INTERRUPT_SCENARIO_RUN_CHANNEL, input),
    onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => {
      const callback = (_event: unknown, payload: unknown) => listener(payload as RunnerEventEnvelope);
      ipc.on(SCENARIO_RUN_EVENT, callback);
      return () => ipc.off(SCENARIO_RUN_EVENT, callback);
    },
    onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => {
      const callback = (_event: unknown, payload: unknown) => listener(payload as ScenarioRunTerminal);
      ipc.on(SCENARIO_RUN_TERMINAL_EVENT, callback);
      return () => ipc.off(SCENARIO_RUN_TERMINAL_EVENT, callback);
    },
    onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => {
      const callback = (_event: unknown, payload: unknown) => listener(payload as EditorTestCommandEnvelope);
      ipc.on(EDITOR_TEST_COMMAND_EVENT, callback);
      return () => ipc.off(EDITOR_TEST_COMMAND_EVENT, callback);
    },
    completeEditorTestCommand: (payload: EditorTestCommandResultEnvelope) =>
      ipc.invoke(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, payload)
  };
}
