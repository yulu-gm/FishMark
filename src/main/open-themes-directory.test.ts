import { describe, expect, it, vi } from "vitest";

import { openThemesDirectory } from "./open-themes-directory";

describe("openThemesDirectory", () => {
  it("creates the themes directory and opens it", async () => {
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const openPath = vi.fn().mockResolvedValue("");

    await openThemesDirectory("C:/Users/chenglinwu/AppData/Roaming/Yulora", {
      mkdir,
      openPath
    });

    expect(mkdir).toHaveBeenCalledWith("C:/Users/chenglinwu/AppData/Roaming/Yulora/themes", {
      recursive: true
    });
    expect(openPath).toHaveBeenCalledWith("C:/Users/chenglinwu/AppData/Roaming/Yulora/themes");
  });

  it("throws when the shell reports a failure message", async () => {
    await expect(
      openThemesDirectory("C:/Users/chenglinwu/AppData/Roaming/Yulora", {
        mkdir: vi.fn().mockResolvedValue(undefined),
        openPath: vi.fn().mockResolvedValue("permission denied")
      })
    ).rejects.toThrow("permission denied");
  });
});
