import { describe, expect, it, vi } from "vitest";

import { createFontCatalogService } from "./font-catalog-service";

function sortFamilies(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("createFontCatalogService", () => {
  it("lists and normalizes Windows font families via PowerShell", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: ["Segoe UI", "Source Han Sans SC", "Segoe UI", "", "闇為箿鏂囨シ"].join("\r\n"),
      stderr: ""
    });
    const service = createFontCatalogService({
      platform: "win32",
      runCommand
    });

    await expect(service.listFontFamilies()).resolves.toEqual(
      sortFamilies(["Segoe UI", "Source Han Sans SC", "闇為箿鏂囨シ"])
    );
    expect(runCommand).toHaveBeenCalledWith("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source }"
    ]);
  });

  it("lists and normalizes macOS font families via system_profiler output", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        SPFontsDataType: [
          { family: "PingFang SC" },
          { family: "Source Han Serif SC" },
          { family: "PingFang SC" },
          { family: " " }
        ]
      }),
      stderr: ""
    });
    const service = createFontCatalogService({
      platform: "darwin",
      runCommand
    });

    await expect(service.listFontFamilies()).resolves.toEqual(
      sortFamilies(["PingFang SC", "Source Han Serif SC"])
    );
    expect(runCommand).toHaveBeenCalledWith("system_profiler", ["SPFontsDataType", "-json"]);
  });

  it("returns an empty list when font enumeration fails", async () => {
    const service = createFontCatalogService({
      platform: "win32",
      runCommand: vi.fn().mockRejectedValue(new Error("boom"))
    });

    await expect(service.listFontFamilies()).resolves.toEqual([]);
  });

  it("returns an empty list on unsupported platforms", async () => {
    const runCommand = vi.fn();
    const service = createFontCatalogService({
      platform: "linux",
      runCommand
    });

    await expect(service.listFontFamilies()).resolves.toEqual([]);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
