import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { SIDE_PANEL_WIDTH_DEFAULT, clampSidePanelWidth } from "../../shared/preferences";
/**
 * In-flight pointer drag of the shared side panel's right edge. `startWidth` is
 * the width when the drag began and `availableWidth` is the space the panel
 * column may occupy; both are captured at pointerdown so a frame only needs the
 * pointer delta.
 */
type SidePanelResizeSession = {
  pointerId: number;
  startX: number;
  startWidth: number;
  availableWidth: number;
};
const SIDE_PANEL_RESIZE_KEY_STEP = 16;

export function useSidePanelResize({ workspaceShellRef, sidePanelStoredWidth, onSidePanelWidthCommit }: {
  workspaceShellRef: RefObject<HTMLElement | null>;
  sidePanelStoredWidth: number | null;
  onSidePanelWidthCommit: (width: number) => void;
}) {
  const [resizeSession, setResizeSession] = useState<SidePanelResizeSession | null>(null);
  const [draggedPanelWidth, setDraggedPanelWidth] = useState<number | null>(null);
  const resizeSessionRef = useRef<SidePanelResizeSession | null>(null);
  const draggedPanelWidthRef = useRef<number | null>(null);
  /*
   * The stored width is resolved for the drag maths (the CSS clamps it for
   * display); a collapsed region never overwrites it.
   */
  const displayedSidePanelWidth = draggedPanelWidth ?? sidePanelStoredWidth ?? SIDE_PANEL_WIDTH_DEFAULT;
  const isResizingSidePanel = resizeSession !== null;
  /*
   * The panel column may occupy the workspace stage minus the gap; when the
   * shell has not been laid out (or is not mounted) fall back to the window so
   * the drag still has a sane maximum.
   */
  const measureSidePanelAvailableWidth = (): number => {
    const shell = workspaceShellRef.current;
    const shellWidth = shell?.getBoundingClientRect().width ?? 0;

    return shellWidth > 0 ? shellWidth : window.innerWidth;
  };

  const applyDraggedPanelWidth = (width: number | null) => {
    draggedPanelWidthRef.current = width;
    setDraggedPanelWidth(width);
  };

  const handleSidePanelResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    // Keep focus (and the caret) where it was while the pointer drags.
    event.preventDefault();
    // Pointer capture keeps move/up delivery on the separator after the cursor
    // leaves its narrow hit target, so every drag has one deterministic finish.
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const availableWidth = measureSidePanelAvailableWidth();
    const displayWidth = clampSidePanelWidth(displayedSidePanelWidth, availableWidth);
    const session: SidePanelResizeSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: displayWidth,
      availableWidth
    };

    resizeSessionRef.current = session;
    setResizeSession(session);
    applyDraggedPanelWidth(displayWidth);
  };

  const handleSidePanelResizePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const session = resizeSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const pointerDelta = event.clientX - session.startX;

    applyDraggedPanelWidth(
      clampSidePanelWidth(session.startWidth + pointerDelta, session.availableWidth)
    );
  };

  /**
   * End the drag. `commit` writes the resulting width to preferences exactly
   * once; cancelling (Escape) restores the pre-drag width without writing.
   */
  const finishSidePanelResize = (commit: boolean) => {
    const session = resizeSessionRef.current;
    const width = draggedPanelWidthRef.current;

    resizeSessionRef.current = null;
    setResizeSession(null);
    applyDraggedPanelWidth(null);

    if (!commit || session === null || width === null) {
      return;
    }

    onSidePanelWidthCommit(clampSidePanelWidth(width, session.availableWidth));
  };

  const handleSidePanelResizeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && resizeSessionRef.current !== null) {
      event.preventDefault();
      finishSidePanelResize(false);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const availableWidth = measureSidePanelAvailableWidth();
    const baseWidth = clampSidePanelWidth(displayedSidePanelWidth, availableWidth);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const nextWidth = clampSidePanelWidth(
      baseWidth + direction * SIDE_PANEL_RESIZE_KEY_STEP,
      availableWidth
    );

    applyDraggedPanelWidth(nextWidth);
    onSidePanelWidthCommit(nextWidth);
  };

  return {
    displayedSidePanelWidth, isResizingSidePanel, handleSidePanelResizePointerDown,
    handleSidePanelResizePointerMove, finishSidePanelResize, handleSidePanelResizeKeyDown
  };
}
