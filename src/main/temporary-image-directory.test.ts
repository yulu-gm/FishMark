import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "../shared/preferences";
import {
  resolveTemporaryImageDirectory,
  selectTemporaryImageDirectory,
  selectAndPersistTemporaryImageDirectory
} from "./temporary-image-directory";

describe("selectTemporaryImageDirectory", () => {
  it("does not persist or commit authority when the chooser owner is lost during canonical resolution", async () => {
    let finish!: (value: { canonicalPath: string }) => void; let alive = true;
    const updatePreferences = vi.fn(); const commit = vi.fn();
    const pending = selectAndPersistTemporaryImageDirectory({ select: async () => "C:/picked",
      fileIdentity: { resolveProspective: () => new Promise((resolve) => { finish = resolve; }) } as unknown as Parameters<typeof selectAndPersistTemporaryImageDirectory>[0]["fileIdentity"],
      check: () => { if (!alive) throw new Error("Path authority denied."); }, service: { updatePreferences }, commit });
    await Promise.resolve(); alive = false; finish({ canonicalPath: "C:/retarget" });
    await expect(pending).rejects.toThrow("Path authority denied");
    expect(updatePreferences).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
  });
  it("persists the validated canonical directory before committing in-memory authority", async () => {
    const commit = vi.fn();
    const updatePreferences = vi.fn(async () => ({ status: "success" as const, preferences: DEFAULT_PREFERENCES }));
    await expect(selectAndPersistTemporaryImageDirectory({ select: async () => "C:/alias",
      fileIdentity: { resolveProspective: async () => ({ canonicalPath: "C:/canonical/missing" }) } as unknown as Parameters<typeof selectAndPersistTemporaryImageDirectory>[0]["fileIdentity"],
      check: () => {}, service: { updatePreferences }, commit })).resolves.toBe("C:/canonical/missing");
    expect(updatePreferences).toHaveBeenCalledWith({ images: { temporaryDirectory: "C:/canonical/missing" } });
    expect(commit).toHaveBeenCalledWith("C:/canonical/missing");
    expect(updatePreferences.mock.invocationCallOrder[0]).toBeLessThan(commit.mock.invocationCallOrder[0]!);
  });
  it("returns the selected absolute directory path", async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["D:/FishMark/temp/clipboard-images"]
    });

    const result = await selectTemporaryImageDirectory({ showOpenDialog });

    expect(showOpenDialog).toHaveBeenCalledWith({
      title: "Select Temporary Image Directory",
      properties: ["openDirectory", "createDirectory"]
    });
    expect(result).toBe("D:/FishMark/temp/clipboard-images");
  });

  it("returns null when the picker is cancelled or no directory is selected", async () => {
    await expect(
      selectTemporaryImageDirectory({
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
      })
    ).resolves.toBeNull();
    await expect(
      selectTemporaryImageDirectory({
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] })
      })
    ).resolves.toBeNull();
  });
});

describe("resolveTemporaryImageDirectory", () => {
  it("uses the configured image temporary directory when present", () => {
    expect(
      resolveTemporaryImageDirectory("C:/Users/me/AppData/Roaming/FishMark", {
        ...DEFAULT_PREFERENCES,
        images: { temporaryDirectory: "D:/FishMark/temp/images" }
      })
    ).toBe("D:/FishMark/temp/images");
  });

  it("falls back to the FishMark userData temp directory", () => {
    const userDataDir = "C:/Users/me/AppData/Roaming/FishMark";

    expect(resolveTemporaryImageDirectory(userDataDir, DEFAULT_PREFERENCES)).toBe(
      path.join(userDataDir, "temp", "clipboard-images")
    );
  });
});
