import { useEffect, useEffectEvent } from "react";

import type { EditorTestCommandEnvelope } from "../../shared/editor-test-command";
import type { WorkspaceRendererTestAdapter } from "./workspace-renderer-application";

type EditorBridge = {
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  getSelection: () => { anchor: number; head: number };
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  pressTab: (shiftKey?: boolean) => void;
  pressArrowUp: () => void;
  pressArrowDown: () => void;
};

export type EditorTestBridgeHostProps = {
  fishmarkTest?: Window["fishmarkTest"];
  workspace: WorkspaceRendererTestAdapter;
  resetAutosaveRuntime: () => void;
  editor: EditorBridge;
};

export function EditorTestBridgeHost(props: EditorTestBridgeHostProps): null {
  const handleEditorTestCommand = useEffectEvent(async (payload: EditorTestCommandEnvelope): Promise<void> => {
    if (!props.fishmarkTest) {
      return;
    }

    try {
      // Test automation is an optional bridge capability; ordinary editing never
      // needs to download or initialize the scenario driver.
      const { createEditorTestDriver } = await import("../editor-test-driver");
      const driver = createEditorTestDriver({
        workspace: props.workspace,
        resetAutosaveRuntime: props.resetAutosaveRuntime,
        editor: props.editor
      });
      const result = await driver.run(payload.command);
      await props.fishmarkTest.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await props.fishmarkTest.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result: {
          ok: false,
          message
        }
      });
    }
  });

  useEffect(() => {
    if (!props.fishmarkTest) {
      return;
    }

    return props.fishmarkTest.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [props.fishmarkTest]);

  return null;
}
