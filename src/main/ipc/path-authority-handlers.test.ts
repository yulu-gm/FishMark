import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { DEFAULT_PREFERENCES } from "../../shared/preferences";
import { createPathAuthority } from "../path-authority";
import { registerNativeFileHandlers } from "./register-native-file-handlers";
import { registerPreferencesHandlers } from "./register-preferences-handlers";
import { createIpcLifecycle, type IpcHandler } from "./ipc-lifecycle";

function fixture() {
  const handlers = new Map<string, IpcHandler>(); const sender = {};
  const event = { sender } as IpcMainInvokeEvent;
  const ipc = createIpcLifecycle({ handle: (channel, handler) => { handlers.set(channel, handler); }, removeHandler: () => {} });
  const authorize = vi.fn(() => () => {});
  const resolve = vi.fn(async () => { throw new Error("unexpected filesystem lookup"); });
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer }); workspace.registerWindow("one");
  const paths = createPathAuthority({ workspace, fileIdentity: { resolveExisting: resolve, resolveProspective: resolve } });
  paths.bind(sender, "one", "hidden-main-preload-token");
  registerNativeFileHandlers({ ipc, authorize, paths });
  const updatePreferences = vi.fn(async () => ({ status: "success" as const, preferences: DEFAULT_PREFERENCES }));
  const selectTemporaryDirectory = vi.fn(async () => null);
  registerPreferencesHandlers({ ipc, authorize, service: { getPreferences: () => ({ ...DEFAULT_PREFERENCES, images: { temporaryDirectory: "/already-main-authorized" } }), updatePreferences }, selectTemporaryDirectory });
  return { resolve, updatePreferences, selectTemporaryDirectory,
    invoke: (channel: string, ...args: unknown[]) => Promise.resolve().then(() => handlers.get(`fishmark:${channel}`)!(event, ...args)) };
}

describe("path authority transport", () => {
  it.each([undefined, {}, { targetPath: "/arbitrary.md" }, { targetPath: "/arbitrary.md", token: "wrong", source: "native-file" }])("rejects forged private native grants before filesystem I/O: %j", async (payload) => {
    const f = fixture();
    await expect(f.invoke("grant-native-file-path", payload)).rejects.toThrow("Path authority denied");
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("rejects a renderer temporary-directory expansion before preference writes or chooser calls", async () => {
    const f = fixture();
    await expect(f.invoke("update-preferences", { images: { temporaryDirectory: "/arbitrary-outside" } })).rejects.toThrow("Path authority denied");
    expect(f.updatePreferences).not.toHaveBeenCalled(); expect(f.selectTemporaryDirectory).not.toHaveBeenCalled(); expect(f.resolve).not.toHaveBeenCalled();
  });
  it.each([null, "/already-main-authorized"])("allows clear or unchanged temporary preference: %j", async (temporaryDirectory) => {
    const f = fixture();
    await expect(f.invoke("update-preferences", { images: { temporaryDirectory } })).resolves.toMatchObject({ status: "success" });
    expect(f.updatePreferences).toHaveBeenCalledWith({ images: { temporaryDirectory } }); expect(f.resolve).not.toHaveBeenCalled();
  });
});
