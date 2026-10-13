import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

type TabDrag = {
  tabId: string;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
  element: HTMLElement;
};

export function useWorkspaceTabDrag({ reorderWorkspaceTab, detachWorkspaceTab }: {
  reorderWorkspaceTab: (tabId: string, index: number) => Promise<unknown>;
  detachWorkspaceTab: (tabId: string) => Promise<unknown>;
}) {
  const active = useRef<TabDrag | null>(null);
  const suppressClick = useRef(false);
  const release = useCallback(() => {
    const session = active.current;
    active.current = null;
    if (session) {
      delete session.element.dataset.dragging;
      if (session.element.hasPointerCapture(session.pointerId)) {
        session.element.releasePointerCapture(session.pointerId);
      }
    }
    return session;
  }, []);
  const cancel = useCallback(() => {
    if (active.current) suppressClick.current = true;
    release();
  }, [release]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      cancel();
    };
  }, [cancel]);

  const onPointerDown = useCallback((tabId: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || active.current) return;
    // Keep the editor selection intact; capture owns release outside the window.
    event.preventDefault();
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { tabId, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      dragging: false, element: event.currentTarget };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = active.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.dragging && Math.hypot(event.clientX - session.x, event.clientY - session.y) >= 6) {
      session.dragging = true;
      session.element.dataset.dragging = "true";
      suppressClick.current = true;
    }
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId || event.button !== 0) return;
    const session = release();
    if (!session?.dragging) return;
    event.preventDefault();
    const strip = session.element.closest('[data-fishmark-region="workspace-tab-strip"]');
    const target = session.element.ownerDocument.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-fishmark-region="workspace-tab-shell"]');
    if (strip && target && target.closest('[data-fishmark-region="workspace-tab-strip"]') === strip) {
      const tab = target.querySelector<HTMLElement>('[data-fishmark-region="workspace-tab"]');
      const targetTabId = tab?.dataset.tabId;
      const index = Array.from(strip.querySelectorAll('[data-fishmark-region="workspace-tab-shell"]')).indexOf(target);
      if (targetTabId && targetTabId !== session.tabId && index >= 0) void reorderWorkspaceTab(session.tabId, index);
      return;
    }
    void detachWorkspaceTab(session.tabId);
  }, [detachWorkspaceTab, release, reorderWorkspaceTab]);

  const onPointerCancel = useCallback((event: PointerEvent<HTMLElement>) => {
    if (active.current?.pointerId === event.pointerId) cancel();
  }, [cancel]);
  const consumeClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.detail === 0 || !suppressClick.current) return false;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, consumeClick };
}
