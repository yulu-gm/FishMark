import { useCallback } from "react";
import type { EditorLoadIdentity } from "./editor-load-identity";

export function useEditorWorkflowController(input: {
  setEditorContentSnapshot: (content: string) => void;
  scheduleDocumentDerivedDataUpdate: (content: string) => void;
  scheduleAutosave: () => void;
  runAutosave: () => Promise<void>;
  resetAutosaveRuntime: () => void;
  getActiveTabId: () => string | null;
  updateDraft: (input: { identity: EditorLoadIdentity; content: string }) => boolean;
  activateWorkspaceTab: (tabId: string) => Promise<void>;
  closeWorkspaceTab: (tabId: string) => Promise<void>;
  detachWorkspaceTab: (tabId: string) => Promise<void>;
}) {
  const {
    setEditorContentSnapshot,
    scheduleDocumentDerivedDataUpdate,
    scheduleAutosave,
    runAutosave,
    resetAutosaveRuntime,
    getActiveTabId,
    updateDraft,
    activateWorkspaceTab: activateWorkspaceTabCommand,
    closeWorkspaceTab: closeWorkspaceTabCommand,
    detachWorkspaceTab: detachWorkspaceTabCommand
  } = input;

  const handleEditorContentChange = useCallback(
    (nextContent: string, identity: EditorLoadIdentity | null): void => {
      if (identity === null || !updateDraft({ identity, content: nextContent })) {
        return;
      }
      setEditorContentSnapshot(nextContent);
      scheduleDocumentDerivedDataUpdate(nextContent);
      scheduleAutosave();
    },
    [
      scheduleAutosave,
      scheduleDocumentDerivedDataUpdate,
      setEditorContentSnapshot,
      updateDraft
    ]
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
    handleEditorContentChange,
    handleEditorBlur,
    activateWorkspaceTab,
    closeWorkspaceTab,
    detachWorkspaceTab
  };
}
