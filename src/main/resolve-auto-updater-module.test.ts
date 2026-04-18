import { describe, expect, it } from "vitest";

import { resolveAutoUpdaterModule } from "./resolve-auto-updater-module";

describe("resolveAutoUpdaterModule", () => {
  it("returns a top-level autoUpdater export when present", () => {
    const autoUpdater = {
      autoDownload: false,
      checkForUpdates: async () => undefined,
      quitAndInstall: () => {},
      on: () => undefined
    };

    expect(resolveAutoUpdaterModule({ autoUpdater })).toBe(autoUpdater);
  });

  it("falls back to default.autoUpdater for CommonJS dynamic imports", () => {
    const autoUpdater = {
      autoDownload: false,
      checkForUpdates: async () => undefined,
      quitAndInstall: () => {},
      on: () => undefined
    };

    expect(
      resolveAutoUpdaterModule({
        default: {
          autoUpdater
        }
      })
    ).toBe(autoUpdater);
  });

  it("throws a clear error when the module does not expose autoUpdater", () => {
    expect(() => resolveAutoUpdaterModule({})).toThrow(
      "electron-updater module did not expose autoUpdater"
    );
  });
});
