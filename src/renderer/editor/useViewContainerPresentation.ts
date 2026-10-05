import { useEffect, useRef, useState } from "react";
import type { WorkspaceViewContainerId } from "./workspace-shell-props";
const VIEW_CONTAINER_EXIT_ANIMATION_MS = 180;

export function useViewContainerPresentation() {
  /*
   * The rail switches the shared side panel between view containers; `null`
   * means collapsed. `closingViewContainer` keeps the last container mounted
   * until its exit animation ends.
   */
  const [activeViewContainer, setActiveViewContainer] = useState<WorkspaceViewContainerId | null>(
    null
  );
  const [closingViewContainer, setClosingViewContainer] =
    useState<WorkspaceViewContainerId | null>(null);
  const viewContainerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearViewContainerCloseTimer(): void {
    if (viewContainerCloseTimerRef.current !== null) {
      clearTimeout(viewContainerCloseTimerRef.current);
      viewContainerCloseTimerRef.current = null;
    }
  }

  function toggleViewContainer(viewContainerId: WorkspaceViewContainerId): void {
    if (activeViewContainer === viewContainerId) {
      closeViewContainer();
      return;
    }

    clearViewContainerCloseTimer();
    setClosingViewContainer(null);
    setActiveViewContainer(viewContainerId);
  }

  function closeViewContainer(): void {
    if (activeViewContainer === null) {
      return;
    }

    clearViewContainerCloseTimer();
    setClosingViewContainer(activeViewContainer);
    setActiveViewContainer(null);
    viewContainerCloseTimerRef.current = setTimeout(() => {
      viewContainerCloseTimerRef.current = null;
      setClosingViewContainer(null);
    }, VIEW_CONTAINER_EXIT_ANIMATION_MS);
  }

  useEffect(() => () => clearViewContainerCloseTimer(), []);

  return { activeViewContainer, closingViewContainer, toggleViewContainer, closeViewContainer };
}
