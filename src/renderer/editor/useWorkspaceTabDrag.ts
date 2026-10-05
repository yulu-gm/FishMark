import { useCallback, useRef } from "react";
export function useWorkspaceTabDrag({ reorderWorkspaceTab, detachWorkspaceTab }: { reorderWorkspaceTab: (tabId: string, index: number) => Promise<unknown>; detachWorkspaceTab: (tabId: string) => Promise<unknown> }) {
  const draggedWorkspaceTabIdRef = useRef<string | null>(null);
  const handledWorkspaceTabDropRef = useRef(false);
  const handleWorkspaceTabDragStart = useCallback(
    (tabId: string, event: React.DragEvent<HTMLElement>): void => {
      draggedWorkspaceTabIdRef.current = tabId;
      handledWorkspaceTabDropRef.current = false;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tabId);
    },
    []
  );

  const handleWorkspaceTabDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    if (!draggedWorkspaceTabIdRef.current) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleWorkspaceTabDrop = useCallback(
    (targetTabId: string, targetIndex: number, event: React.DragEvent<HTMLElement>): void => {
      const draggedTabId = draggedWorkspaceTabIdRef.current;

      if (!draggedTabId) {
        return;
      }

      event.preventDefault();
      handledWorkspaceTabDropRef.current = true;
      draggedWorkspaceTabIdRef.current = null;

      if (draggedTabId === targetTabId) {
        return;
      }

      void reorderWorkspaceTab(draggedTabId, targetIndex);
    },
    [reorderWorkspaceTab]
  );

  const handleWorkspaceTabDragEnd = useCallback(
    (tabId: string): void => {
      const shouldDetach =
        draggedWorkspaceTabIdRef.current === tabId && !handledWorkspaceTabDropRef.current;

      draggedWorkspaceTabIdRef.current = null;
      handledWorkspaceTabDropRef.current = false;

      if (shouldDetach) {
        void detachWorkspaceTab(tabId);
      }
    },
    [detachWorkspaceTab]
  );


  return { handleWorkspaceTabDragStart, handleWorkspaceTabDragOver, handleWorkspaceTabDrop, handleWorkspaceTabDragEnd };
}
