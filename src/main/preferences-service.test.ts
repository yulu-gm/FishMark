import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES, serializePreferences } from "../shared/preferences";
import { createPreferencesService } from "./preferences-service";

const USER_DATA_DIR = path.join("C:/userData");
const PREFERENCES_PATH = path.join(USER_DATA_DIR, "preferences.json");

function createDeps(overrides: {
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile?: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
  rename?: (source: string, target: string) => Promise<void>;
  now?: () => number;
}) {
  return {
    readFile: overrides.readFile ?? vi.fn(),
    writeFile: overrides.writeFile ?? vi.fn().mockResolvedValue(undefined),
    rename: overrides.rename ?? vi.fn().mockResolvedValue(undefined),
    now: overrides.now ?? (() => 1_700_000_000_000)
  };
}

describe("createPreferencesService", () => {
  it("starts with defaults before initialize() runs", () => {
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({})
    });

    expect(service.getPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("loads parsed preferences from disk on initialize", async () => {
    const dependencies = createDeps({
      readFile: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({
            autosave: { idleDelayMs: 2500 },
            ui: { fontSize: 18 },
            document: { fontFamily: "Georgia", fontSize: 17 },
            theme: { mode: "dark", selectedId: "graphite" }
          })
        )
    });
    const service = createPreferencesService({ userDataDir: USER_DATA_DIR, dependencies });

    const loadResult = await service.initialize();

    expect(loadResult.source).toBe("parsed");
    expect(service.getPreferences().autosave.idleDelayMs).toBe(2500);
    expect(service.getPreferences().ui.fontSize).toBe(18);
    expect(service.getPreferences().document).toEqual({
      fontFamily: "Georgia",
      fontSize: 17
    });
    expect(service.getPreferences().theme.mode).toBe("dark");
    expect(service.getPreferences().theme.selectedId).toBe("graphite");
  });

  it("migrates legacy editor fields when loading cached preferences from disk", async () => {
    const dependencies = createDeps({
      readFile: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({
            editor: { fontFamily: "Source Serif 4", fontSize: 18 }
          })
        )
    });
    const service = createPreferencesService({ userDataDir: USER_DATA_DIR, dependencies });

    const loadResult = await service.initialize();

    expect(loadResult.source).toBe("parsed");
    expect(service.getPreferences().document).toEqual({
      fontFamily: "Source Serif 4",
      fontSize: 18
    });
  });

  it("only reads from disk once even when initialize is called repeatedly", async () => {
    const readFile = vi.fn().mockResolvedValue(serializePreferences(DEFAULT_PREFERENCES));
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({ readFile })
    });

    await Promise.all([service.initialize(), service.initialize(), service.initialize()]);

    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("rewrites defaults and reports recovery when the on-disk file was corrupt", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const onCorruptRecovery = vi.fn();
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      onCorruptRecovery,
      dependencies: createDeps({
        readFile: vi.fn().mockResolvedValue("{ not json"),
        writeFile,
        now: () => 1_700_000_000_000
      })
    });

    const loadResult = await service.initialize();

    expect(loadResult.source).toBe("recovered-from-corrupt");
    expect(onCorruptRecovery).toHaveBeenCalledWith(
      `${PREFERENCES_PATH}.corrupt-1700000000000`
    );
    // The rewrite of defaults is fire-and-forget; allow the microtask queue to
    // flush so we can assert it actually happened.
    await Promise.resolve();
    await Promise.resolve();
    expect(writeFile).toHaveBeenCalled();
  });

  it("writes a patched preferences object and notifies change listeners", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const rename = vi.fn().mockResolvedValue(undefined);
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({
        readFile: vi.fn().mockResolvedValue(serializePreferences(DEFAULT_PREFERENCES)),
        writeFile,
        rename
      })
    });

    await service.initialize();
    const listener = vi.fn();
    service.onChange(listener);

    const result = await service.updatePreferences({
      autosave: { idleDelayMs: 1500 },
      ui: { fontSize: 20 },
      document: { fontFamily: "IBM Plex Serif", fontSize: 18 },
      theme: { mode: "dark", selectedId: "graphite" }
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.preferences.autosave.idleDelayMs).toBe(1500);
      expect(result.preferences.ui.fontSize).toBe(20);
      expect(result.preferences.document).toEqual({
        fontFamily: "IBM Plex Serif",
        fontSize: 18
      });
      expect(result.preferences.theme.mode).toBe("dark");
      expect(result.preferences.theme.selectedId).toBe("graphite");
    }
    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.getPreferences().autosave.idleDelayMs).toBe(1500);
    expect(service.getPreferences().ui.fontSize).toBe(20);
  });

  it("keeps the cached value and skips notification when the write fails", async () => {
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({
        readFile: vi.fn().mockResolvedValue(serializePreferences(DEFAULT_PREFERENCES)),
        writeFile: vi.fn().mockRejectedValue(new Error("disk full"))
      })
    });

    await service.initialize();
    const listener = vi.fn();
    service.onChange(listener);

    const result = await service.updatePreferences({ autosave: { idleDelayMs: 5000 } });

    expect(result.status).toBe("error");
    expect(service.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after a listener detaches", async () => {
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({
        readFile: vi.fn().mockResolvedValue(serializePreferences(DEFAULT_PREFERENCES))
      })
    });

    await service.initialize();
    const listener = vi.fn();
    const detach = service.onChange(listener);

    await service.updatePreferences({ autosave: { idleDelayMs: 2000 } });
    detach();
    await service.updatePreferences({ autosave: { idleDelayMs: 3000 } });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("isolates listener errors so siblings still receive the change", async () => {
    const service = createPreferencesService({
      userDataDir: USER_DATA_DIR,
      dependencies: createDeps({
        readFile: vi.fn().mockResolvedValue(serializePreferences(DEFAULT_PREFERENCES))
      })
    });

    await service.initialize();
    const failing = vi.fn().mockImplementation(() => {
      throw new Error("listener boom");
    });
    const recipient = vi.fn();

    service.onChange(failing);
    service.onChange(recipient);

    await service.updatePreferences({ theme: { mode: "dark", selectedId: "graphite" } });

    expect(failing).toHaveBeenCalled();
    expect(recipient).toHaveBeenCalledWith(
      expect.objectContaining({ theme: { mode: "dark", selectedId: "graphite" } })
    );
  });
});
