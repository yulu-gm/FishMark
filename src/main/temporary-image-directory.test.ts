import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES } from "../shared/preferences";
import {
  resolveTemporaryImageDirectory,
  selectTemporaryImageDirectory
} from "./temporary-image-directory";

describe("selectTemporaryImageDirectory", () => {
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
