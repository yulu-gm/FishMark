import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../../shared/preferences";
import { RendererPlatformGateway, type WorkspaceApplicationGateway } from "./renderer-platform-gateway";

describe("renderer application gateway", () => {
  it("updates the selected image directory and schedules autosave from the committed preferences", async () => {
    const updatePreferences = vi.fn(async () => ({ status: "success" as const, preferences: DEFAULT_PREFERENCES }));
    const onPreferencesUpdated = vi.fn();
    const gateway = new RendererPlatformGateway({
      selectTemporaryImageDirectory: async () => "/tmp/images",
      updatePreferences
    } as unknown as WorkspaceApplicationGateway, vi.fn(), () => {}, onPreferencesUpdated);
    await expect(gateway.selectTemporaryImageDirectory()).resolves.toMatchObject({ status: "success" });
    expect(updatePreferences).toHaveBeenCalledWith({ images: { temporaryDirectory: "/tmp/images" } });
    expect(onPreferencesUpdated).toHaveBeenCalledWith(DEFAULT_PREFERENCES.autosave.idleDelayMs);
  });

  it("does not update preferences when the directory chooser is cancelled", async () => {
    const updatePreferences = vi.fn();
    const gateway = new RendererPlatformGateway({ selectTemporaryImageDirectory: async () => null, updatePreferences } as unknown as WorkspaceApplicationGateway, vi.fn(), () => {}, vi.fn());
    await expect(gateway.selectTemporaryImageDirectory()).resolves.toBeNull();
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("maps recent-file and clipboard failures without involving a component", async () => {
    const notify = vi.fn();
    const gateway = new RendererPlatformGateway({
      clearRecentFile: async () => { throw new Error("recent offline"); },
      importClipboardImage: async () => ({ status: "error", error: { code: "write-failed", message: "image offline" } })
    } as unknown as WorkspaceApplicationGateway, notify, () => {}, vi.fn());
    await expect(gateway.clearRecentFile({ path: "a.md" })).resolves.toBeNull();
    await expect(gateway.importClipboardImage({ documentPath: "a.md" })).resolves.toBeNull();
    expect(notify.mock.calls).toEqual([[{ kind: "error", message: "recent offline" }], [{ kind: "error", message: "image offline" }]]);
  });
});
