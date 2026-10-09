import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { CodeEditorHandle } from "../code-editor-view";

type FocusRestoreTarget = "editor" | "settings-entry";
type SettingsOpenOrigin = "editor" | null;

export function useSettingsController({
  editorContainerRef,
  editorRef,
  settingsEntryRef,
  exitAnimationMs
}: {
  editorContainerRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<CodeEditorHandle | null>;
  settingsEntryRef: RefObject<HTMLButtonElement | null>;
  exitAnimationMs: number;
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openOriginRef = useRef<SettingsOpenOrigin>(null);
  const shouldRestoreEditorFocusRef = useRef(false);
  const pendingFocusRestoreRef = useRef<FocusRestoreTarget | null>(null);

  const clearSettingsCloseTimer = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const captureSettingsOpenOrigin = useCallback((): void => {
    const activeElement = document.activeElement;
    openOriginRef.current =
      activeElement instanceof Node && editorContainerRef.current?.contains(activeElement)
        ? "editor"
        : null;
  }, [editorContainerRef]);

  const openSettingsDrawer = useCallback((): void => {
    const activeElement = document.activeElement;
    shouldRestoreEditorFocusRef.current =
      openOriginRef.current === "editor" ||
      (activeElement instanceof Node ? !!editorContainerRef.current?.contains(activeElement) : false);
    openOriginRef.current = null;
    clearSettingsCloseTimer();
    setIsSettingsClosing(false);
    setIsSettingsOpen(true);
  }, [
    clearSettingsCloseTimer,
    editorContainerRef
  ]);

  const closeSettingsDrawer = useCallback((): void => {
    clearSettingsCloseTimer();
    setIsSettingsOpen(false);
    setIsSettingsClosing(true);

    if (shouldRestoreEditorFocusRef.current) {
      shouldRestoreEditorFocusRef.current = false;
      pendingFocusRestoreRef.current = "editor";
    } else {
      pendingFocusRestoreRef.current = "settings-entry";
    }

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsSettingsClosing(false);
    }, exitAnimationMs);
  }, [clearSettingsCloseTimer, exitAnimationMs]);

  useEffect(() => {
    if (isSettingsOpen || isSettingsClosing || pendingFocusRestoreRef.current === null) {
      return;
    }

    if (pendingFocusRestoreRef.current === "editor") {
      editorRef.current?.focus();
    } else {
      settingsEntryRef.current?.focus();
    }

    pendingFocusRestoreRef.current = null;
  }, [editorRef, isSettingsClosing, isSettingsOpen, settingsEntryRef]);

  useEffect(() => clearSettingsCloseTimer, [clearSettingsCloseTimer]);

  return useMemo(
    () => ({
      isSettingsOpen,
      isSettingsClosing,
      isSettingsDrawerVisible: isSettingsOpen || isSettingsClosing,
      captureSettingsOpenOrigin,
      openSettingsDrawer,
      closeSettingsDrawer,
      clearSettingsCloseTimer
    }),
    [
      captureSettingsOpenOrigin,
      clearSettingsCloseTimer,
      closeSettingsDrawer,
      isSettingsClosing,
      isSettingsOpen,
      openSettingsDrawer
    ]
  );
}
