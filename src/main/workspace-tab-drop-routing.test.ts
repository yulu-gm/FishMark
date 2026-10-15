import { describe, expect, it } from "vitest";
import { createWorkspaceTabDropRouting } from "./workspace-tab-drop-routing";

function setup(candidate = false) {
  let now = 1000, id = 0;
  const timers = new Set<() => void>();
  const routing = createWorkspaceTabDropRouting({ now: () => now, createId: () => `drop-${++id}`,
    hasCandidate: () => candidate, schedule: callback => { timers.add(callback); return () => { timers.delete(callback); }; } });
  const release = () => routing.observe("source", { type: "mouseUp", button: "left", x: 1846, y: 34, globalX: 1854, globalY: 91 });
  const hit = () => routing.observe("target", { type: "mouseMove", button: "none", x: 186, y: 34, globalX: 1854, globalY: 91 });
  return { routing, release, hit, advance: (ms: number) => { now += ms; }, expire: () => { for (const callback of [...timers]) callback(); } };
}

describe("native tab drop routing", () => {
  it("reserves one route from a genuine same-screen target event and consumes it once", async () => {
    const f = setup(); f.release();
    const resolved = f.routing.resolve("source", "tab"); f.hit();
    const route = await resolved;
    expect(route).toEqual({ kind: "target", targetWindowId: "target", dropId: "drop-1" });
    expect(f.routing.claim("drop-1", "source", "target", "tab")).toMatchObject({ point: { x: 186, y: 34 } });
    expect(() => f.routing.claim("drop-1", "source", "target", "tab")).toThrow();
    expect(await f.routing.resolve("source", "tab")).toEqual({ kind: "cancelled" });
  });
  it("retains a target event arriving before the renderer IPC", async () => {
    const f = setup(); f.release(); f.hit();
    expect(await f.routing.resolve("source", "tab")).toMatchObject({ kind: "target" });
  });
  it.each([true, false])("absence of positive hit only detaches outside existing candidate windows (candidate=%s)", async candidate => {
    const f = setup(candidate); f.release();
    const result = f.routing.resolve("source", "tab"); f.expire();
    expect(await result).toEqual({ kind: candidate ? "cancelled" : "detach" });
  });
  it("does not accept another global position, a pressed button or a late event", async () => {
    const f = setup(true); f.release();
    const result = f.routing.resolve("source", "tab");
    f.routing.observe("target", { type: "mouseMove", button: "none", x: 186, y: 34, globalX: 1854, globalY: 100 });
    f.advance(151); f.hit(); f.expire();
    expect(await result).toEqual({ kind: "cancelled" });
  });
  it("rejects an unobserved, stale or wrong-source release", async () => {
    const f = setup();
    expect(await f.routing.resolve("source", "tab")).toEqual({ kind: "cancelled" });
    f.release();
    expect(await f.routing.resolve("other", "tab")).toEqual({ kind: "cancelled" });
    f.advance(501);
    expect(await f.routing.resolve("source", "tab")).toEqual({ kind: "cancelled" });
  });
  it.each(["source", "target"])("revokes reserved routes when %s closes or navigates", async windowId => {
    const f = setup(); f.release(); f.hit(); await f.routing.resolve("source", "tab");
    f.routing.abortWindow(windowId);
    expect(() => f.routing.claim("drop-1", "source", "target", "tab")).toThrow();
  });
  it("checks source, target, tab and expiry without consuming a different owner's route", async () => {
    const f = setup(); f.release(); f.hit(); await f.routing.resolve("source", "tab");
    expect(() => f.routing.claim("drop-1", "other", "target", "tab")).toThrow();
    expect(() => f.routing.claim("drop-1", "source", "other", "tab")).toThrow();
    expect(() => f.routing.claim("drop-1", "source", "target", "other")).toThrow();
    f.advance(30_000);
    expect(() => f.routing.claim("drop-1", "source", "target", "tab")).toThrow();
  });
  it("a second press invalidates an unresolved release rather than creating a window", async () => {
    const f = setup(); f.release(); const result = f.routing.resolve("source", "tab");
    f.routing.observe("source", { type: "mouseDown", button: "left", x: 0, y: 0, globalX: 0, globalY: 0 });
    expect(await result).toEqual({ kind: "cancelled" });
  });

  it("keeps the release-time veto when a candidate closes before its native hit arrives", async () => {
    let candidate = true;
    let expire!: () => void;
    const routing = createWorkspaceTabDropRouting({ hasCandidate: () => candidate, schedule: callback => { expire = callback; return () => {}; } });
    routing.observe("source", { type: "mouseUp", button: "left", x: 1, y: 1, globalX: 1000, globalY: 1 });
    const result = routing.resolve("source", "tab"); candidate = false; routing.abortWindow("target"); expire();
    expect(await result).toEqual({ kind: "cancelled" });
  });

  it("does not retarget one release to a later overlapping window", async () => {
    const f = setup(); f.release(); f.hit();
    f.routing.observe("later", { type: "mouseMove", button: "none", x: 0, y: 0, globalX: 1854, globalY: 91 });
    expect(await f.routing.resolve("source", "tab")).toEqual({ kind: "cancelled" });
  });
});

