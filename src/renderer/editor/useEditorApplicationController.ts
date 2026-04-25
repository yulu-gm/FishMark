import { useCallback, useMemo } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { AppMenuCommand } from "../../shared/menu-command";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useEditorWorkflowController } from "./useEditorWorkflowController";
import { useExternalConflictController } from "./useExternalConflictController";
import { useSaveController } from "./useSaveController";
import { useWorkspaceController } from "./useWorkspaceController";

export function useEditorApplicationController(input: {
  autosaveDelayMs: number;
  fishmark: Window["fishmark"];
  getEditorContent: () => string;
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  setEditorContentSnapshot: (content: string) => void;
  showNotification: (notification: AppNotification) => void;
  updateOutline: (content: string) => void;
}) {
  const {
    autosaveDelayMs,
    fishmark,
    getEditorContent,
    initialSnapshot,
    setEditorContentSnapshot,
    showNotification,
    updateOutline
  } = input;
  const workspaceController = useWorkspaceController({
    fishmark,
    getEditorContent,
    initialSnapshot,
    showNotification
  });
  const saveController = useSaveController({
    fishmark,
    getActiveDocument: workspaceController.getActiveDocument,
    getEditorContent,
    flushActiveWorkspaceDraft: workspaceController.flushActiveWorkspaceDraft,
    refreshWorkspaceSnapshot: workspaceController.refreshWorkspaceSnapshot,
    hasExternalFileConflict: () => externalConflictController.hasExternalFileConflict(),
    autosaveDelayMs,
    showNotification
  });
  const externalConflictController = useExternalConflictController({
    fishmark,
    getActiveDocument: workspaceController.getActiveDocument,
    reloadActiveDocument: async () => {
      const activeDocument = workspaceController.getActiveDocument();

      if (!activeDocument?.path) {
        return false;
      }

      return workspaceController.reloadWorkspaceTabFromPath({
        tabId: activeDocument.tabId,
        targetPath: activeDocument.path
      });
    },
    resetAutosaveRuntime: saveController.resetAutosaveRuntime,
    showNotification
  });
  const editorWorkflowController = useEditorWorkflowController({
    setEditorContentSnapshot,
    updateOutline,
    scheduleAutosave: saveController.scheduleAutosave,
    runAutosave: saveController.runAutosave,
    resetAutosaveRuntime: saveController.resetAutosaveRuntime,
    getActiveTabId: workspaceController.getActiveTabId,
    updateDraft: workspaceController.updateDraft,
    activateWorkspaceTab: workspaceController.activateWorkspaceTab,
    closeWorkspaceTab: workspaceController.closeWorkspaceTab,
    detachWorkspaceTab: workspaceController.detachWorkspaceTab
  });
  const {
    confirmWorkspaceWindowClose: confirmWorkspaceWindowCloseBridge
  } = fishmark;
  const {
    createUntitledMarkdown: createUntitledWorkspaceTab,
    flushActiveWorkspaceDraft,
    getActiveDocument,
    openMarkdown: openWorkspaceMarkdown,
    openMarkdownFromPath: openWorkspaceMarkdownFromPath
  } = workspaceController;
  const {
    resetAutosaveRuntime,
    runManualSave
  } = saveController;

  const openMarkdown = useCallback(async () => {
    resetAutosaveRuntime();
    return openWorkspaceMarkdown();
  }, [openWorkspaceMarkdown, resetAutosaveRuntime]);

  const createUntitledMarkdown = useCallback(async (): Promise<boolean> => {
    resetAutosaveRuntime();
    return createUntitledWorkspaceTab();
  }, [createUntitledWorkspaceTab, resetAutosaveRuntime]);

  const openMarkdownFromPath = useCallback(
    async (targetPath: string): Promise<boolean> => {
      resetAutosaveRuntime();
      return openWorkspaceMarkdownFromPath(targetPath);
    },
    [openWorkspaceMarkdownFromPath, resetAutosaveRuntime]
  );

  const saveMarkdown = useCallback(async (): Promise<void> => {
    if (!getActiveDocument()) {
      return;
    }

    await runManualSave();
  }, [getActiveDocument, runManualSave]);

  const saveMarkdownAs = useCallback(async (): Promise<void> => {
    if (!getActiveDocument()) {
      return;
    }

    await runManualSave({ forceSaveAs: true });
  }, [getActiveDocument, runManualSave]);

  const confirmWorkspaceWindowClose = useCallback(async (): Promise<boolean> => {
    try {
      await flushActiveWorkspaceDraft();
      return await confirmWorkspaceWindowCloseBridge();
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }, [confirmWorkspaceWindowCloseBridge, flushActiveWorkspaceDraft, showNotification]);

  const runMenuCommand = useCallback(
    (command: AppMenuCommand): boolean => {
      if (command === "new-markdown-document") {
        void createUntitledMarkdown();
        return true;
      }

      if (command === "open-markdown-file") {
        void openMarkdown();
        return true;
      }

      if (command === "save-markdown-file") {
        void saveMarkdown();
        return true;
      }

      if (command === "save-markdown-file-as") {
        void saveMarkdownAs();
        return true;
      }

      return false;
    },
    [createUntitledMarkdown, openMarkdown, saveMarkdown, saveMarkdownAs]
  );

  const commands = useMemo(
    () => ({
      confirmWorkspaceWindowClose,
      createUntitledMarkdown,
      openMarkdown,
      openMarkdownFromPath,
      runMenuCommand,
      saveMarkdown,
      saveMarkdownAs
    }),
    [
      confirmWorkspaceWindowClose,
      createUntitledMarkdown,
      openMarkdown,
      openMarkdownFromPath,
      runMenuCommand,
      saveMarkdown,
      saveMarkdownAs
    ]
  );

  return {
    commands,
    editorWorkflow: editorWorkflowController,
    externalConflict: externalConflictController,
    save: saveController,
    workspace: workspaceController
  };
}
