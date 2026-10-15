import { randomUUID } from "node:crypto";

type Point = Readonly<{ x: number; y: number }>;
type Route = Readonly<{ sourceWindowId: string; targetWindowId: string; tabId: string; point: Point; expiresAt: number }>;
type Release = { sourceWindowId: string; point: Point; at: number; used: boolean; candidateAtRelease: boolean; ambiguous: boolean; target?: { windowId: string; point: Point }; notify?: () => void };
const nativeReleaseLifetimeMs = 500;

// Native input delivery, rather than overlapping window rectangles, determines
// the receiver after the source releases pointer capture. Renderer input cannot
// nominate another window. The short rendezvous never moves canonical state.
export function createWorkspaceTabDropRouting(input: {
  now?: () => number;
  createId?: () => string;
  schedule?: (listener: () => void, milliseconds: number) => () => void;
  hasCandidate: (sourceWindowId: string, globalPoint: Point) => boolean;
}) {
  const now = input.now ?? Date.now;
  const createId = input.createId ?? randomUUID;
  const schedule = input.schedule ?? ((listener, milliseconds) => {
    const timer = setTimeout(listener, milliseconds);
    return () => clearTimeout(timer);
  });
  let release: Release | null = null;
  const routes = new Map<string, Route>();
  function prune() {
    for (const [id, route] of routes) if (route.expiresAt <= now()) routes.delete(id);
  }
  return {
    observe(windowId: string, mouse: { type: string; button?: string; x: number; y: number; globalX?: number; globalY?: number }) {
      if (!Number.isFinite(mouse.globalX) || !Number.isFinite(mouse.globalY)) return;
      const screenPoint = { x: mouse.globalX!, y: mouse.globalY! };
      if (mouse.type === "mouseDown" && mouse.button === "left") {
        for (const [id, route] of routes) if (route.sourceWindowId === windowId || route.targetWindowId === windowId) routes.delete(id);
        const previous = release; release = null; previous?.notify?.();
      } else if (mouse.type === "mouseUp" && mouse.button === "left") {
        const previous = release;
        release = { sourceWindowId: windowId, point: screenPoint, at: now(), used: false,
          candidateAtRelease: input.hasCandidate(windowId, screenPoint), ambiguous: false };
        previous?.notify?.();
      } else if (release && mouse.type === "mouseMove" && mouse.button === "none" &&
          windowId !== release.sourceWindowId && now() - release.at <= nativeReleaseLifetimeMs &&
          Math.abs(screenPoint.x - release.point.x) <= 1 && Math.abs(screenPoint.y - release.point.y) <= 1) {
        if (release.target && release.target.windowId !== windowId) {
          release.ambiguous = true;
          for (const [id, route] of routes) if (route.sourceWindowId === release.sourceWindowId) routes.delete(id);
        } else release.target ??= { windowId, point: { x: mouse.x, y: mouse.y } };
        release.notify?.();
      }
    },
    async resolve(sourceWindowId: string, tabId: string): Promise<
      { kind: "detach" } | { kind: "cancelled" } | { kind: "target"; targetWindowId: string; dropId: string }
    > {
      prune();
      const captured = release;
      if (!captured || captured.used || captured.sourceWindowId !== sourceWindowId || now() - captured.at > nativeReleaseLifetimeMs) return { kind: "cancelled" };
      captured.used = true;
      if (!captured.target) await new Promise<void>((resolve) => {
        const cancel = schedule(() => { captured.notify = undefined; resolve(); }, 100);
        captured.notify = () => { cancel(); captured.notify = undefined; resolve(); };
      });
      if (release !== captured || captured.ambiguous) return { kind: "cancelled" };
      if (!captured.target) return captured.candidateAtRelease || input.hasCandidate(sourceWindowId, captured.point) ? { kind: "cancelled" } : { kind: "detach" };
      const dropId = createId();
      routes.set(dropId, { sourceWindowId, targetWindowId: captured.target.windowId, tabId,
        point: captured.target.point, expiresAt: now() + 30_000 });
      return { kind: "target", targetWindowId: captured.target.windowId, dropId };
    },
    claim(dropId: string, sourceWindowId: string, targetWindowId: string, tabId: string): Route {
      prune();
      const route = routes.get(dropId);
      if (!route || route.sourceWindowId !== sourceWindowId || route.targetWindowId !== targetWindowId || route.tabId !== tabId) {
        throw new Error("The tab drop is no longer available.");
      }
      routes.delete(dropId);
      return route;
    },
    abortWindow(windowId: string) {
      for (const [id, route] of routes) if (route.sourceWindowId === windowId || route.targetWindowId === windowId) routes.delete(id);
      if (release?.sourceWindowId === windowId || release?.target?.windowId === windowId) {
        const previous = release; release = null; previous?.notify?.();
      }
    }
  };
}
