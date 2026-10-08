import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import type { CodeEditorHandle } from "../code-editor-view";
import { isEditingContentPointerEvent, isEditorScrollbarPointerEvent, isFocusedEditorInteractiveElement, isWorkspaceNonEditorInteractiveTarget } from "./editor-pointer-utils";

type ActiveDocument = WorkspaceWindowSnapshot["activeDocument"];
/** Pointer/focus presentation only. Document commands remain application-owned. */
export function useEditorFocusPresentation({
  activeDocument, isSettingsOpen, isSettingsClosing, editorContainerRef, editorRef,
  handleEditorBlur, getWorkspaceActiveDocument, isDocumentOpen, editorLoadRevision,
  shellMode, setShellMode, setIsEditorFocused
}: {
  activeDocument: ActiveDocument;
  isSettingsOpen: boolean; isSettingsClosing: boolean; isDocumentOpen: boolean;
  editorContainerRef: RefObject<HTMLDivElement | null>; editorRef: RefObject<CodeEditorHandle | null>;
  handleEditorBlur: () => void; getWorkspaceActiveDocument: () => ActiveDocument;
  editorLoadRevision: number; shellMode: "reading" | "editing";
  setShellMode: (mode: "reading" | "editing") => void;
  setIsEditorFocused: (focused: boolean) => void;
}) {
  const lastEditorPointerIntentRef = useRef<"editing" | "blank" | null>(null);
  const pendingEditorOpenBlurTokenRef = useRef(0);
  const suppressNextEditorBlurAutosaveRef = useRef(false);
  const enterEditingMode = useCallback((): void => {
    pendingEditorOpenBlurTokenRef.current += 1;
    setShellMode("editing");
  }, [setShellMode]);

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
  }, []);

  const blurFocusedEditorElementAfterOpen = useCallback((): void => {
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
      });
    });
  }, [blurFocusedEditorElementWithoutAutosave]);

  const enterReadingMode = useCallback((): void => {
    if (
      !activeDocument ||
      isSettingsOpen ||
      isSettingsClosing
    ) {
      return;
    }

    setShellMode("reading");
    blurFocusedEditorElement();
  }, [
    activeDocument,
    blurFocusedEditorElement,
    isSettingsClosing,
    isSettingsOpen,
    setShellMode
  ]);

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

      lastEditorPointerIntentRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      enterReadingMode();
    },
    [activeDocument, editorContainerRef, enterReadingMode]
  );

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (!editorContainer) {
      return undefined;
    }

    const handleMouseDownCapture = (event: MouseEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        if (event.button !== 0) {
          lastEditorPointerIntentRef.current = null;
          return;
        }

        const isEditingContentClick = isEditingContentPointerEvent(event, editorContainer);
        const isScrollbarClick = isEditorScrollbarPointerEvent(event, editorContainer);
        if (isScrollbarClick) {
          lastEditorPointerIntentRef.current = null;
          return;
        }

        lastEditorPointerIntentRef.current = isEditingContentClick ? "editing" : "blank";

        if (isEditingContentClick) {
          if (getWorkspaceActiveDocument()) {
            enterEditingMode();
          }
          return;
        }

        event.preventDefault();
        enterReadingMode();
      }
    };

    const clearLastPointerIntent = () => {
      lastEditorPointerIntentRef.current = null;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && editorContainer.contains(event.target)) {
        cancelPendingEditorOpenBlur();
        const pointerIntent = lastEditorPointerIntentRef.current;
        lastEditorPointerIntentRef.current = null;
        setIsEditorFocused(true);

        if (pointerIntent !== "editing") {
          return;
        }

        if (getWorkspaceActiveDocument()) {
          enterEditingMode();
        }
      }
    };

    const handleFocusOut = () => {
      const activeElement = document.activeElement;
      setIsEditorFocused(activeElement instanceof Node && editorContainer.contains(activeElement));
    };

    editorContainer.addEventListener("mousedown", handleMouseDownCapture, true);
    editorContainer.addEventListener("focusin", handleFocusIn);
    editorContainer.addEventListener("focusout", handleFocusOut);
    window.addEventListener("mouseup", clearLastPointerIntent);

    return () => {
      editorContainer.removeEventListener("mousedown", handleMouseDownCapture, true);
      editorContainer.removeEventListener("focusin", handleFocusIn);
      editorContainer.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("mouseup", clearLastPointerIntent);
    };
  }, [
    cancelPendingEditorOpenBlur,
    enterEditingMode,
    enterReadingMode,
    getWorkspaceActiveDocument,
    isDocumentOpen,
    editorLoadRevision,
    editorContainerRef,
    setIsEditorFocused
  ]);

  useEffect(() => {
    if (!isDocumentOpen) {
      return;
    }

    if (shellMode !== "editing") {
      return;
    }

    const frame = requestAnimationFrame(() => {
      // 进入编辑模式或加载文档后，Search 可能先于此帧取得焦点；保留这次较新的聚焦意图。
      const activeElement = document.activeElement;
      if (
        isFocusedEditorInteractiveElement(editorContainerRef.current) ||
        (activeElement instanceof Element && activeElement.closest('[data-fishmark-region="search"]'))
      ) {
        return;
      }

      editorRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeDocument?.path, isDocumentOpen, shellMode, editorLoadRevision, editorContainerRef, editorRef]);

  useEffect(() => {
    if (
      !isDocumentOpen ||
      isSettingsOpen ||
      isSettingsClosing
    ) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) {
        return;
      }
      if (event.key === "Escape" && shellMode === "editing") {
        enterReadingMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enterReadingMode,
    isDocumentOpen,
    isSettingsClosing,
    isSettingsOpen,
    shellMode
  ]);

  useEffect(() => () => { pendingEditorOpenBlurTokenRef.current += 1; }, []);
  return { handleEditorBlurFromShell, blurFocusedEditorElementAfterOpen, handleAppWorkspaceMouseDownCapture };
}
