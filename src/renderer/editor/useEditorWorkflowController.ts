import { useCallback } from "react";
import type { CodeEditorDocumentChangeFrame } from "../code-editor";

export function useEditorWorkflowController(input: {
  setEditorContentSnapshot: (content: string) => void;
  scheduleAutosave: () => void;
  runAutosave: () => Promise<void>;
  resetAutosaveRuntime: () => void;
  getActiveTabId: () => string | null;
  recordDocumentChangeFrame: (frame: CodeEditorDocumentChangeFrame) => boolean;
  activateWorkspaceTab: (tabId: string) => Promise<void>;
  closeWorkspaceTab: (tabId: string) => Promise<void>;
  detachWorkspaceTab: (tabId: string) => Promise<void>;
}) {
  const {
    setEditorContentSnapshot,
    scheduleAutosave,
    runAutosave,
    resetAutosaveRuntime,
    getActiveTabId,
    recordDocumentChangeFrame,
    activateWorkspaceTab: activateWorkspaceTabCommand,
    closeWorkspaceTab: closeWorkspaceTabCommand,
    detachWorkspaceTab: detachWorkspaceTabCommand
  } = input;

  const handleEditorDocumentChangeFrame = useCallback(
    (frame: CodeEditorDocumentChangeFrame): void => {
      if (!recordDocumentChangeFrame(frame)) {
        throw new Error("The editor frame was not accepted by the active document transport.");
      }
      setEditorContentSnapshot(frame.resultingText);
      scheduleAutosave();
    },
    [recordDocumentChangeFrame, scheduleAutosave, setEditorContentSnapshot]
  );

  const handleEditorBlur = useCallback((): void => {
    void runAutosave();
  }, [runAutosave]);

  const activateWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      resetAutosaveRuntime();
      await activateWorkspaceTabCommand(tabId);
      scheduleAutosave();
    },
    [activateWorkspaceTabCommand, resetAutosaveRuntime, scheduleAutosave]
  );

  const closeWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      const isClosingActiveTab = getActiveTabId() === tabId;

      if (isClosingActiveTab) {
        resetAutosaveRuntime();
      }

      await closeWorkspaceTabCommand(tabId);

      if (isClosingActiveTab) {
        scheduleAutosave();
      }
    },
    [closeWorkspaceTabCommand, getActiveTabId, resetAutosaveRuntime, scheduleAutosave]
  );

  const detachWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      resetAutosaveRuntime();
      await detachWorkspaceTabCommand(tabId);
      scheduleAutosave();
    },
    [detachWorkspaceTabCommand, resetAutosaveRuntime, scheduleAutosave]
  );

  return {
    handleEditorDocumentChangeFrame,
    handleEditorBlur,
    activateWorkspaceTab,
    closeWorkspaceTab,
    detachWorkspaceTab
  };
}
