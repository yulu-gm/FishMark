import { useCallback, useMemo } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { AppMenuCommand } from "../../shared/menu-command";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useEditorWorkflowController } from "./useEditorWorkflowController";
import { useExternalConflictResolution } from "./useExternalConflictResolution";
import { useSaveController } from "./useSaveController";
import { useWorkspaceController } from "./useWorkspaceController";

export function useEditorApplicationController(input: {
  autosaveDelayMs: number;
  fishmark: Window["fishmark"];
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  setEditorContentSnapshot: (content: string) => void;
  showNotification: (notification: AppNotification) => void;
}) {
  const {
    autosaveDelayMs,
    fishmark,
    initialSnapshot,
    setEditorContentSnapshot,
    showNotification
  } = input;
  const workspaceController = useWorkspaceController({
    fishmark,
    initialSnapshot,
    showNotification
  });
  const externalConflictController = useExternalConflictResolution({
    fishmark,
    getActiveDocument: workspaceController.getActiveDocument,
    refreshSnapshot: workspaceController.loadInitialWorkspaceSnapshot,
    showNotification
  });
  const saveController = useSaveController({
    getActiveDocument: workspaceController.getActiveDocument,
    runSaveTransaction: workspaceController.runSaveTransaction,
    hasExternalFileConflict: () => (workspaceController.getActiveDocument()?.externalChange ?? null) !== null,
    autosaveDelayMs,
    showNotification
  });
  const editorWorkflowController = useEditorWorkflowController({
    setEditorContentSnapshot,
    scheduleAutosave: saveController.scheduleAutosave,
    runAutosave: saveController.runAutosave,
    resetAutosaveRuntime: saveController.resetAutosaveRuntime,
    getActiveTabId: workspaceController.getActiveTabId,
    recordDocumentChangeFrame: workspaceController.recordDocumentChangeFrame,
    activateWorkspaceTab: async (tabId) => {
      await workspaceController.activateWorkspaceTab(tabId);
    },
    closeWorkspaceTab: workspaceController.closeWorkspaceTab,
    detachWorkspaceTab: workspaceController.detachWorkspaceTab
  });
  const {
    confirmWorkspaceWindowClose: confirmWorkspaceWindowCloseRequest,
    createUntitledMarkdown: createUntitledWorkspaceTab,
    runWithActiveEditBarrier,
    getActiveDocument,
    openMarkdown: openWorkspaceMarkdown,
    openMarkdownFromPath: openWorkspaceMarkdownFromPath,
    openMarkdownFromPaths: openWorkspaceMarkdownFromPaths
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

  const openRecentMarkdown = useCallback(
    async (targetPath: string): Promise<boolean> => {
      resetAutosaveRuntime();
      const opened = await openWorkspaceMarkdownFromPath(targetPath);

      if (!opened) {
        try {
          await fishmark.clearRecentFile({ path: targetPath });
        } catch (error) {
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return opened;
    },
    [fishmark, openWorkspaceMarkdownFromPath, resetAutosaveRuntime, showNotification]
  );

  const openMarkdownFromPaths = useCallback(
    async (targetPaths: string[]): Promise<boolean> => {
      resetAutosaveRuntime();
      return openWorkspaceMarkdownFromPaths(targetPaths);
    },
    [openWorkspaceMarkdownFromPaths, resetAutosaveRuntime]
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

  const exportHtml = useCallback(async (): Promise<void> => {
    const activeDocument = getActiveDocument();

    if (!activeDocument) {
      return;
    }

    try {
      const barrier = await runWithActiveEditBarrier(async (barrierDocument, sealedText) => {
        const markdown = sealedText;
        const {
          collectReadableStyleSheetText,
          collectRootExportAttributes,
          createFishmarkExportHtml
        } = await import("../export-html");
        const html = createFishmarkExportHtml({
          markdown,
          title: barrierDocument.name,
          cssText: collectReadableStyleSheetText(document),
          rootAttributes: collectRootExportAttributes(document)
        });
        return fishmark.exportHtmlFile({
          tabId: barrierDocument.tabId,
          currentPath: barrierDocument.path,
          html
        });
      });
      if (barrier.kind !== "committed") {
        throw barrier.kind === "failed" ||
          barrier.kind === "failed-reconciled" ||
          barrier.kind === "canonical-unavailable"
          ? barrier.error
          : new Error(`Document export barrier ended with ${barrier.kind}.`);
      }
      const result = barrier.value;

      if (result.status === "error") {
        showNotification({
          kind: "error",
          message: result.error.message
        });
        return;
      }

      if (result.status === "success") {
        showNotification({
          kind: "info",
          message: "HTML exported."
        });
      }
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, [
    fishmark,
    getActiveDocument,
    runWithActiveEditBarrier,
    showNotification
  ]);

  const confirmWorkspaceWindowClose = useCallback(async (
    requestId: string
  ): Promise<boolean> => {
    return confirmWorkspaceWindowCloseRequest(requestId);
  }, [confirmWorkspaceWindowCloseRequest]);

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

      if (command === "export-html-file") {
        void exportHtml();
        return true;
      }

      return false;
    },
    [createUntitledMarkdown, exportHtml, openMarkdown, saveMarkdown, saveMarkdownAs]
  );

  const commands = useMemo(
    () => ({
      confirmWorkspaceWindowClose,
      createUntitledMarkdown,
      openMarkdown,
      openMarkdownFromPath,
      openRecentMarkdown,
      openMarkdownFromPaths,
      runMenuCommand,
      exportHtml,
      saveMarkdown,
      saveMarkdownAs
    }),
    [
      confirmWorkspaceWindowClose,
      createUntitledMarkdown,
      openMarkdown,
      openMarkdownFromPath,
      openRecentMarkdown,
      openMarkdownFromPaths,
      runMenuCommand,
      exportHtml,
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
