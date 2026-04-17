import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const createdDirectories: string[] = [];

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("after-pack Windows icon hook", () => {
  it("patches the packaged Windows executable icon without relying on electron-builder rcedit flow", () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "yulora-after-pack-"));
    const appOutDirectory = path.join(tempDirectory, "win-unpacked");
    const targetExePath = path.join(appOutDirectory, "Yulora.exe");
    const sourceExePath = process.execPath;
    const iconPath = path.join(process.cwd(), "build", "icons", "light", "icon.ico");

    createdDirectories.push(tempDirectory);

    spawnSync(process.execPath, ["scripts/generate-icons.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30000
    });

    rmSync(appOutDirectory, { recursive: true, force: true });
    mkdirSync(appOutDirectory, { recursive: true });
    copyFileSync(sourceExePath, targetExePath);

    const result = spawnSync(
      process.execPath,
      [
        "scripts/after-pack-win-icon.mjs",
        JSON.stringify({
          appOutDir: appOutDirectory,
          electronPlatformName: "win32",
          packager: {
            appInfo: {
              productFilename: "Yulora"
            }
          }
        })
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30000
      }
    );

    expect(result.status).toBe(0);
    expect(existsSync(iconPath)).toBe(true);

    if (process.platform === "win32") {
      expect(result.stdout).toContain("Patched Windows executable icon");
    } else {
      expect(result.stdout).toContain("Skipping Windows executable icon patch on non-Windows host.");
    }
  }, 30000);
});
