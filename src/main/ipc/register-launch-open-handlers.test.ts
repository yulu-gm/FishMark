import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerLaunchOpenHandlers } from "./register-launch-open-handlers";
import type { IpcHandler } from "./ipc-lifecycle";
import { LAUNCH_OPEN_CONTROL_CHANNEL } from "../../shared/workspace";

function setup() {
  let handler!: IpcHandler;
  const owner = {};
  const authorize = vi.fn(() => () => {});
  const resolveWindow = vi.fn(() => owner);
  const setReady = vi.fn();
  const complete = vi.fn(() => true);
  registerLaunchOpenHandlers({ ipc: { handle: (channel, callback) => {
    expect(channel).toBe(LAUNCH_OPEN_CONTROL_CHANNEL); handler = callback;
  } }, authorize, resolveWindow, setReady, complete });
  const event = { sender: {} } as IpcMainInvokeEvent;
  return { handler, owner, authorize, resolveWindow, setReady, complete, event };
}
describe("launch open control IPC", () => {
  it("derives the owner from the authorized sender for ready and completion", () => {
    const f = setup();
    f.handler(f.event, { kind: "ready", ready: true });
    expect(f.authorize).toHaveBeenCalledWith(f.event, ["product", "editor-test"]);
    expect(f.setReady).toHaveBeenCalledWith(f.owner, true);
    f.handler(f.event, { kind: "complete", requestId: "launch:1", success: true, windowId: "forged" });
    expect(f.complete).toHaveBeenCalledWith(f.owner, "launch:1", true);
  });
  it.each([null, {}, {kind: "ready", ready: "true"}, {kind: "complete", requestId: "", success: true}, {kind: "complete", requestId: "x", success: 1}])("rejects malformed control %j", (value) => {
    const f = setup();
    expect(() => f.handler(f.event, value)).toThrow("Invalid IPC request");
    expect(f.setReady).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
  });
  it("rejects untrusted frames before changing queue state", () => {
    const f = setup();
    f.authorize.mockImplementation(() => { throw new Error("Untrusted IPC sender."); });
    expect(() => f.handler(f.event, {kind: "ready", ready: true})).toThrow("Untrusted");
    expect(f.resolveWindow).not.toHaveBeenCalled();
  });
});
