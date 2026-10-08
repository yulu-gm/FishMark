import { describe, expect, it, vi } from "vitest";
import { createProductApi, type ProductIpcPort } from "./product-api";
import { LAUNCH_OPEN_CONTROL_CHANNEL, OPEN_WORKSPACE_PATH_EVENT } from "../shared/workspace";

function setup() {
  const invoke = vi.fn(async () => undefined);
  const on = vi.fn();
  const off = vi.fn();
  const api = createProductApi({
    ipc: { invoke: invoke as ProductIpcPort["invoke"], on, off },
    runtime: { platform: "win32", argv: [] }, filePath: { getPathForFile: () => "" }
  });
  const callback = () => on.mock.lastCall![1] as (event: unknown, payload: unknown) => Promise<void>;
  return { api, invoke, on, off, callback };
}

describe("launch open preload handshake", () => {
  it("subscribes before ready, awaits completion and deduplicates transport retries", async () => {
    const f = setup();
    let finish!: () => void;
    const listener = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const unsubscribe = f.api.onOpenWorkspacePath(listener);
    expect(f.on).toHaveBeenCalledWith(OPEN_WORKSPACE_PATH_EVENT, expect.any(Function));
    expect(f.invoke).toHaveBeenCalledWith(LAUNCH_OPEN_CONTROL_CHANNEL, { kind: "ready", ready: true });
    const payload = { requestId: "launch:1", targetPath: "a.md" };
    const first = f.callback()({}, payload);
    const retry = f.callback()({}, payload);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, retry]);
    expect(f.invoke).toHaveBeenLastCalledWith(LAUNCH_OPEN_CONTROL_CHANNEL, { kind: "complete", requestId: "launch:1", success: true });
    await f.callback()({}, payload);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(f.off).toHaveBeenCalledWith(OPEN_WORKSPACE_PATH_EVENT, f.callback());
    expect(f.invoke).toHaveBeenLastCalledWith(LAUNCH_OPEN_CONTROL_CHANNEL, { kind: "ready", ready: false });
  });

  it("acknowledges a throwing listener as failed so subsequent requests can proceed", async () => {
    const f = setup();
    f.api.onOpenWorkspacePath(() => { throw new Error("renderer command failed"); });
    await f.callback()({}, { requestId: "launch:1", targetPath: "a.md" });
    expect(f.invoke).toHaveBeenLastCalledWith(LAUNCH_OPEN_CONTROL_CHANNEL, { kind: "complete", requestId: "launch:1", success: false });
  });
});
