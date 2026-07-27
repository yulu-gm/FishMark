import { useCallback } from "react";

export function useEditorWorkflowController(input: {
  setEditorContentSnapshot: (content: string) => void;
  scheduleDocumentDerivedDataUpdate: (content: string) => void;
  scheduleAutosave: () => void;
  runAutosave: () => Promise<void>;
  resetAutosaveRuntime: () => void;
  getActiveTabId: () => string | null;
  updateDraft: (input: { tabId: string; content: string }) => Promise<void>;
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
    (nextContent: string): void => {
      const activeTabId = getActiveTabId();
      setEditorContentSnapshot(nextContent);
      scheduleDocumentDerivedDataUpdate(nextContent);
      scheduleAutosave();

      if (activeTabId !== null) {
        void updateDraft({ tabId: activeTabId, content: nextContent }).catch(() => {
          // Draft sync failures are surfaced by explicit save/autosave flushes.
        });
      }
    },
    [
      getActiveTabId,
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
