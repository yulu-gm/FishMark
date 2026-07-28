import { useCallback, useEffect, useRef } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import type { WorkspaceSaveOutcome } from "./workspace-renderer-application";

const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";
const MANUAL_SAVE_FAILED_MESSAGE = "Save failed. Changes are still in memory.";

export function useSaveController(input: {
  getActiveDocument: () => WorkspaceDocumentSnapshot | null;
  runSaveTransaction: (input: {
    forceSaveAs: boolean;
    hasExternalConflict: boolean;
  }) => Promise<WorkspaceSaveOutcome>;
  hasExternalFileConflict: () => boolean;
  autosaveDelayMs: number;
  showNotification: (notification: AppNotification) => void;
}) {
  const {
    getActiveDocument,
    runSaveTransaction,
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

  const clearAutosaveTimer = useCallback((): void => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const resetAutosaveRuntime = useCallback((): void => {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
  }, [clearAutosaveTimer]);

  const showSaveOutcome = useCallback((
    outcome: WorkspaceSaveOutcome,
    origin: "manual" | "autosave"
  ): void => {
    if (outcome.kind === "committed") {
      if (outcome.value.status === "error") {
        showNotification({
          kind: "error",
          message: origin === "autosave"
            ? AUTOSAVE_FAILED_MESSAGE
            : outcome.value.error.message
        });
      }
      return;
    }
    if (outcome.kind === "cancelled" || outcome.kind === "superseded" || outcome.kind === "no-document") {
      return;
    }
    showNotification({
      kind: "error",
      message: origin === "autosave"
        ? AUTOSAVE_FAILED_MESSAGE
        : outcome.error instanceof Error && outcome.error.message.trim().length > 0
          ? outcome.error.message
          : MANUAL_SAVE_FAILED_MESSAGE
    });
  }, [showNotification]);

  const runAutosave = useCallback(async (): Promise<void> => {
    clearAutosaveTimer();
    const currentDocument = getActiveDocument();
    if (
      !currentDocument?.path ||
      !currentDocument.isDirty ||
      hasExternalFileConflictRef.current()
    ) {
      return;
    }
    if (inFlightSaveOriginRef.current !== null) {
      pendingAutosaveReplayRef.current = true;
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    try {
      const outcome = await runSaveTransaction({
        forceSaveAs: false,
        hasExternalConflict: false
      });
      showSaveOutcome(outcome, "autosave");
    } finally {
      inFlightSaveOriginRef.current = null;
      if (pendingAutosaveReplayRef.current) {
        pendingAutosaveReplayRef.current = false;
        void runAutosaveRef.current();
      }
    }
  }, [clearAutosaveTimer, getActiveDocument, runSaveTransaction, showSaveOutcome]);

  useEffect(() => {
    runAutosaveRef.current = runAutosave;
  }, [runAutosave]);

  const scheduleAutosave = useCallback((delayMs = autosaveDelayMs): void => {
    clearAutosaveTimer();
    const activeDocument = getActiveDocument();
    if (inFlightSaveOriginRef.current !== null) {
      pendingAutosaveReplayRef.current = true;
      return;
    }
    if (
      !activeDocument?.path ||
      !activeDocument.isDirty ||
      hasExternalFileConflictRef.current()
    ) {
      pendingAutosaveReplayRef.current = false;
      return;
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, delayMs);
  }, [autosaveDelayMs, clearAutosaveTimer, getActiveDocument, runAutosave]);

  const runManualSave = useCallback(async (
    options: { forceSaveAs?: boolean } = {}
  ): Promise<void> => {
    if (!getActiveDocument() || inFlightSaveOriginRef.current !== null) {
      return;
    }
    clearAutosaveTimer();
    inFlightSaveOriginRef.current = "manual";
    pendingAutosaveReplayRef.current = false;
    try {
      const outcome = await runSaveTransaction({
        forceSaveAs: options.forceSaveAs ?? false,
        hasExternalConflict: hasExternalFileConflictRef.current()
      });
      showSaveOutcome(outcome, "manual");
    } finally {
      inFlightSaveOriginRef.current = null;
      if (pendingAutosaveReplayRef.current) {
        pendingAutosaveReplayRef.current = false;
        scheduleAutosave();
      }
    }
  }, [clearAutosaveTimer, getActiveDocument, runSaveTransaction, scheduleAutosave, showSaveOutcome]);

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

  useEffect(() => () => clearAutosaveTimer(), [clearAutosaveTimer]);

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
