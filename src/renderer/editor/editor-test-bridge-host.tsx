import { useEffect, useEffectEvent } from "react";

import type { EditorTestCommandEnvelope } from "../../shared/editor-test-command";
import type { SaveMarkdownFileResult } from "../../shared/save-markdown-file";
import type { OpenWorkspaceFileFromPathResult } from "../../shared/workspace";
import { createEditorTestDriver } from "../editor-test-driver";
import type { AppState } from "../document-state";

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
  getState: () => AppState;
  applyState: (updater: (current: AppState) => AppState) => void;
  resetAutosaveRuntime: () => void;
  editor: EditorBridge;
  setEditorContentSnapshot: (content: string) => void;
  openWorkspaceFileFromPath: (targetPath: string) => Promise<OpenWorkspaceFileFromPathResult>;
  saveMarkdownFile: (input: { tabId: string; path: string }) => Promise<SaveMarkdownFileResult>;
};

export function EditorTestBridgeHost(props: EditorTestBridgeHostProps): null {
  const handleEditorTestCommand = useEffectEvent(async (payload: EditorTestCommandEnvelope): Promise<void> => {
    if (!props.fishmarkTest) {
      return;
    }

    const driver = createEditorTestDriver({
      getState: props.getState,
      applyState: props.applyState,
      resetAutosaveRuntime: props.resetAutosaveRuntime,
      editor: props.editor,
      setEditorContentSnapshot: props.setEditorContentSnapshot,
      openWorkspaceFileFromPath: props.openWorkspaceFileFromPath,
      saveMarkdownFile: props.saveMarkdownFile
    });

    try {
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
  }, [handleEditorTestCommand, props.fishmarkTest]);

  return null;
}
