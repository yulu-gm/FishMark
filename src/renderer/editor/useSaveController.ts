import { useCallback, useEffect, useRef } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceDocumentSnapshot, WorkspaceWindowSnapshot } from "../../shared/workspace";

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const MANUAL_SAVE_FAILED_MESSAGE = "Save failed. Changes are still in memory.";

export function useSaveController(input: {
  fishmark: Window["fishmark"];
  getActiveDocument: () => WorkspaceDocumentSnapshot | null;
  getEditorContent: () => string;
  flushActiveWorkspaceDraft: () => Promise<void>;
  refreshWorkspaceSnapshot: () => Promise<WorkspaceWindowSnapshot | null>;
  hasExternalFileConflict: () => boolean;
  autosaveDelayMs: number;
  showNotification: (notification: AppNotification) => void;
}) {
  const {
    fishmark,
    getActiveDocument,
    getEditorContent,
    flushActiveWorkspaceDraft,
    refreshWorkspaceSnapshot,
    hasExternalFileConflict,
    autosaveDelayMs,
    showNotification
  } = input;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveReplayRef = useRef(false);
  const inFlightSaveOriginRef = useRef<"manual" | "autosave" | null>(null);
  const runAutosaveRef = useRef<() => Promise<void>>(async () => {});
  const hasExternalFileConflictRef = useRef(hasExternalFileConflict);

  useEffect(() => {
    hasExternalFileConflictRef.current = hasExternalFileConflict;
  }, [hasExternalFileConflict]);

  const hasPendingChanges = useCallback((document: WorkspaceDocumentSnapshot | null): boolean => {
    if (!document?.path) {
      return false;
    }

    return document.isDirty || getEditorContent() !== document.content;
  }, [getEditorContent]);

  const clearAutosaveTimer = useCallback((): void => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const resetAutosaveRuntime = useCallback((): void => {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }, [clearAutosaveTimer]);

  const ensureActiveWorkspaceDraftSynced = useCallback(
    async (saveKind: "manual" | "autosave"): Promise<boolean> => {
      try {
        await flushActiveWorkspaceDraft();
        return true;
      } catch (error) {
        showNotification({
          kind: "error",
          message:
            saveKind === "autosave"
              ? AUTOSAVE_FAILED_MESSAGE
              : error instanceof Error && error.message.trim().length > 0
                ? error.message
                : MANUAL_SAVE_FAILED_MESSAGE
        });
        return false;
      }
    },
    [flushActiveWorkspaceDraft, showNotification]
  );

  const refreshMainWorkspaceSnapshotAfterSave = useCallback(
    async (saveKind: "manual" | "autosave"): Promise<void> => {
      try {
        await flushActiveWorkspaceDraft();
        await refreshWorkspaceSnapshot();
      } catch (error) {
        showNotification({
          kind: "error",
          message:
            saveKind === "autosave"
              ? AUTOSAVE_FAILED_MESSAGE
              : error instanceof Error && error.message.trim().length > 0
                ? error.message
                : MANUAL_SAVE_FAILED_MESSAGE
        });
      }
    },
    [flushActiveWorkspaceDraft, refreshWorkspaceSnapshot, showNotification]
  );

  const runAutosave = useCallback(async (): Promise<void> => {
    clearAutosaveTimer();

    if (!(await ensureActiveWorkspaceDraftSynced("autosave"))) {
      return;
    }

    const currentDocument = getActiveDocument();

    if (
      !currentDocument ||
      !currentDocument.path ||
      !hasPendingChanges(currentDocument) ||
      hasExternalFileConflictRef.current() ||
      inFlightSaveOriginRef.current
    ) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;

    try {
      const result = await fishmark.saveMarkdownFile({
        tabId: currentDocument.tabId,
        path: currentDocument.path
      });

      if (result.status === "error") {
        showNotification({ kind: "error", message: AUTOSAVE_FAILED_MESSAGE });
      }

      if (result.status === "success") {
        await refreshMainWorkspaceSnapshotAfterSave("autosave");
      }
    } finally {
      inFlightSaveOriginRef.current = null;

      if (pendingAutosaveReplayRef.current) {
        pendingAutosaveReplayRef.current = false;
        void runAutosaveRef.current();
      }
    }
  }, [
    clearAutosaveTimer,
    ensureActiveWorkspaceDraftSynced,
    fishmark,
    getActiveDocument,
    hasPendingChanges,
    refreshMainWorkspaceSnapshotAfterSave,
    showNotification
  ]);

  useEffect(() => {
    runAutosaveRef.current = runAutosave;
  }, [runAutosave]);

  const scheduleAutosave = useCallback((): void => {
    clearAutosaveTimer();
    const activeDocument = getActiveDocument();

    if (
      !activeDocument ||
      !activeDocument.path ||
      !hasPendingChanges(activeDocument) ||
      hasExternalFileConflictRef.current()
    ) {
      pendingAutosaveReplayRef.current = false;
      return;
    }

    if (inFlightSaveOriginRef.current) {
      pendingAutosaveReplayRef.current = true;
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, autosaveDelayMs);
  }, [autosaveDelayMs, clearAutosaveTimer, getActiveDocument, hasPendingChanges, runAutosave]);

  const runManualSave = useCallback(
    async (options: { forceSaveAs?: boolean } = {}): Promise<void> => {
      if (!(await ensureActiveWorkspaceDraftSynced("manual"))) {
        return;
      }

      const currentDocument = getActiveDocument();

      if (!currentDocument || inFlightSaveOriginRef.current) {
        return;
      }

      clearAutosaveTimer();
      inFlightSaveOriginRef.current = "manual";
      pendingAutosaveReplayRef.current = false;

      const shouldForceSaveAs =
        options.forceSaveAs ?? (!currentDocument.path || hasExternalFileConflictRef.current());
      try {
        const result = shouldForceSaveAs
          ? await fishmark.saveMarkdownFileAs({
              tabId: currentDocument.tabId,
              currentPath: currentDocument.path
            })
          : currentDocument.path
            ? await fishmark.saveMarkdownFile({
                tabId: currentDocument.tabId,
                path: currentDocument.path
              })
            : { status: "cancelled" as const };

        if (result.status === "error") {
          showNotification({ kind: "error", message: result.error.message });
        }

        if (result.status === "success") {
          await refreshMainWorkspaceSnapshotAfterSave("manual");
        }
      } finally {
        inFlightSaveOriginRef.current = null;

        if (pendingAutosaveReplayRef.current) {
          pendingAutosaveReplayRef.current = false;
          scheduleAutosave();
        }
      }
    },
    [
      clearAutosaveTimer,
      ensureActiveWorkspaceDraftSynced,
      fishmark,
      getActiveDocument,
      refreshMainWorkspaceSnapshotAfterSave,
      scheduleAutosave,
      showNotification
    ]
  );

  const getEffectiveSaveState = useCallback(
    (document: WorkspaceDocumentSnapshot | null): WorkspaceDocumentSnapshot["saveState"] | "idle" => {
      if (document && inFlightSaveOriginRef.current === "manual") {
        return "manual-saving";
      }

      if (document && inFlightSaveOriginRef.current === "autosave") {
        return "autosaving";
      }

      return document?.saveState ?? "idle";
    },
    []
  );

  useEffect(() => {
    if (autosaveTimerRef.current === null) {
      return;
    }

    const activeDocument = getActiveDocument();

    if (
      !activeDocument ||
      !activeDocument.path ||
      !hasPendingChanges(activeDocument) ||
      hasExternalFileConflictRef.current() ||
      inFlightSaveOriginRef.current
    ) {
      clearAutosaveTimer();
      pendingAutosaveReplayRef.current = false;
      return;
    }

    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, autosaveDelayMs);
  }, [
    autosaveDelayMs,
    clearAutosaveTimer,
    getActiveDocument,
    hasPendingChanges,
    runAutosave
  ]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
    };
  }, [clearAutosaveTimer]);

  return {
    clearAutosaveTimer,
    resetAutosaveRuntime,
    runAutosave,
    scheduleAutosave,
    runManualSave,
    getEffectiveSaveState,
    isSaveInFlight: () => inFlightSaveOriginRef.current !== null
  };
}
