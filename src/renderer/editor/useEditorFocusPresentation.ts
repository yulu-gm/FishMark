import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import type { CodeEditorHandle } from "../code-editor-view";
import { isEditingContentPointerEvent, isEditorScrollbarPointerEvent, isFocusedEditorInteractiveElement, isWorkspaceNonEditorInteractiveTarget } from "./editor-pointer-utils";

type ActiveDocument = WorkspaceWindowSnapshot["activeDocument"];
/** Shell presentation only. Document commands remain application-owned. */
export function useEditorFocusPresentation({
  activeDocument, isSettingsOpen, isSettingsClosing, editorContainerRef, editorRef,
  handleEditorBlur, isDocumentOpen, editorLoadRevision,
  shellMode, setShellMode, setIsEditorFocused
}: {
  activeDocument: ActiveDocument;
  isSettingsOpen: boolean; isSettingsClosing: boolean; isDocumentOpen: boolean;
  editorContainerRef: RefObject<HTMLDivElement | null>; editorRef: RefObject<CodeEditorHandle | null>;
  handleEditorBlur: () => void;
  editorLoadRevision: number; shellMode: "reading" | "editing";
  setShellMode: (mode: "reading" | "editing") => void;
  setIsEditorFocused: (focused: boolean) => void;
}) {
  const composingRef = useRef(false);
  const preserveFocusOnUserEditRef = useRef(false);
  const openingRef = useRef(false);
  const pendingEditorOpenBlurTokenRef = useRef(0);
  const suppressNextEditorBlurAutosaveRef = useRef(false);

  const blurFocusedEditorElement = useCallback(
    (options: { suppressAutosave?: boolean } = {}): void => {
      const activeElement = document.activeElement;
      if (
        !(activeElement instanceof HTMLElement) ||
        !editorContainerRef.current?.contains(activeElement)
      ) {
        return;
      }

      if (!options.suppressAutosave) {
        activeElement.blur();
        return;
      }

      suppressNextEditorBlurAutosaveRef.current = true;

      try {
        activeElement.blur();
      } finally {
        suppressNextEditorBlurAutosaveRef.current = false;
      }
    },
    [editorContainerRef]
  );

  const handleEditorBlurFromShell = useCallback((): void => {
    if (suppressNextEditorBlurAutosaveRef.current) {
      return;
    }

    handleEditorBlur();
  }, [handleEditorBlur]);

  const blurFocusedEditorElementWithoutAutosave = useCallback((): void => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && editorContainerRef.current?.contains(activeElement)) {
      blurFocusedEditorElement({ suppressAutosave: true });
    }
  }, [blurFocusedEditorElement, editorContainerRef]);

  const cancelPendingEditorOpenBlur = useCallback((): void => {
    pendingEditorOpenBlurTokenRef.current += 1;
    openingRef.current = false;
  }, []);

  const blurFocusedEditorElementAfterOpen = useCallback((): void => {
    openingRef.current = true;
    const blurToken = pendingEditorOpenBlurTokenRef.current + 1;
    pendingEditorOpenBlurTokenRef.current = blurToken;
    blurFocusedEditorElementWithoutAutosave();
    requestAnimationFrame(() => {
      if (pendingEditorOpenBlurTokenRef.current !== blurToken) {
        return;
      }

      blurFocusedEditorElementWithoutAutosave();
      requestAnimationFrame(() => {
        if (pendingEditorOpenBlurTokenRef.current !== blurToken) {
          return;
        }

        blurFocusedEditorElementWithoutAutosave();
        openingRef.current = false;
      });
    });
  }, [blurFocusedEditorElementWithoutAutosave]);

  const toggleReadingMode = useCallback((): void => {
    if (!activeDocument || isSettingsOpen || isSettingsClosing || composingRef.current || document.querySelector('[aria-modal="true"]')) return;
    pendingEditorOpenBlurTokenRef.current += 1;
    openingRef.current = false;
    setShellMode(shellMode === "reading" ? "editing" : "reading");
  }, [activeDocument, isSettingsOpen, isSettingsClosing, shellMode, setShellMode]);

  const handleUserDocumentEdit = useCallback(() => {
    if (!activeDocument || shellMode !== "reading" || isSettingsOpen || isSettingsClosing) return;
    // The editor already owns this input. Never refocus or replace its selection.
    preserveFocusOnUserEditRef.current = true;
    setShellMode("editing");
  }, [activeDocument, shellMode, isSettingsOpen, isSettingsClosing, setShellMode]);

  const handleAppWorkspaceMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      if (event.button !== 0 || !activeDocument) {
        return;
      }

      const target = event.target;
      const editorContainer = editorContainerRef.current;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".side-panel")) {
        return;
      }

      if (
        editorContainer &&
        editorContainer.contains(target) &&
        (
          isEditingContentPointerEvent(event.nativeEvent, editorContainer) ||
          isEditorScrollbarPointerEvent(event.nativeEvent, editorContainer)
        )
      ) {
        return;
      }

      if (
        !editorContainer?.contains(target) &&
        isWorkspaceNonEditorInteractiveTarget(target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      blurFocusedEditorElement();
    },
    [activeDocument, editorContainerRef, blurFocusedEditorElement]
  );

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (!editorContainer) {
      return undefined;
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        cancelPendingEditorOpenBlur();
        setIsEditorFocused(true);

      }
    };

    const handleFocusOut = () => {
      const activeElement = document.activeElement;
      setIsEditorFocused(activeElement instanceof Node && editorContainer.contains(activeElement));
    };

    editorContainer.addEventListener("focusin", handleFocusIn);
    editorContainer.addEventListener("focusout", handleFocusOut);

    return () => {
      editorContainer.removeEventListener("focusin", handleFocusIn);
      editorContainer.removeEventListener("focusout", handleFocusOut);
    };
  }, [
    cancelPendingEditorOpenBlur,
    isDocumentOpen,
    editorLoadRevision,
    editorContainerRef,
    setIsEditorFocused
  ]);

  useEffect(() => {
    if (!isDocumentOpen) {
      return;
    }

    if (shellMode !== "editing" && activeDocument?.path !== null) {
      return;
    }

    if (preserveFocusOnUserEditRef.current) {
      preserveFocusOnUserEditRef.current = false;
      return;
    }

    const frame = requestAnimationFrame(() => {
      // 进入编辑模式或加载文档后，Search 可能先于此帧取得焦点；保留这次较新的聚焦意图。
      const activeElement = document.activeElement;
      if (
        openingRef.current || document.querySelector('[aria-modal="true"]') ||
        isFocusedEditorInteractiveElement(editorContainerRef.current) ||
        (activeElement instanceof Element && activeElement.closest('[data-fishmark-region="search"], [data-fishmark-command="toggle-reading-mode"]'))
      ) {
        return;
      }

      editorRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeDocument?.path, isDocumentOpen, shellMode, editorLoadRevision, editorContainerRef, editorRef]);

  useEffect(() => {
    const startComposition = () => { composingRef.current = true; };
    const endComposition = () => { composingRef.current = false; };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F11" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      event.preventDefault();
      if (event.repeat || event.isComposing || event.keyCode === 229) return;
      toggleReadingMode();
    };
    window.addEventListener("compositionstart", startComposition, true);
    window.addEventListener("compositionend", endComposition, true);
    window.addEventListener("blur", endComposition);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("compositionstart", startComposition, true);
      window.removeEventListener("compositionend", endComposition, true);
      window.removeEventListener("blur", endComposition);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleReadingMode]);

  useEffect(() => () => { pendingEditorOpenBlurTokenRef.current += 1; }, []);
  return { handleUserDocumentEdit, toggleReadingMode, handleEditorBlurFromShell, blurFocusedEditorElementAfterOpen, handleAppWorkspaceMouseDownCapture };
}
