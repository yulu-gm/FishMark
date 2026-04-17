import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PREFERENCES, serializePreferences } from "../shared/preferences";
import {
  loadPreferencesFromDisk,
  resolvePreferencesFilePath,
  writePreferencesToDisk
} from "./preferences-store";

const FILE_PATH = path.join("C:/userData", "preferences.json");

function createDependencies(overrides: {
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile?: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
  rename?: (source: string, target: string) => Promise<void>;
  now?: () => number;
}) {
  return {
    readFile: overrides.readFile ?? vi.fn(),
    writeFile: overrides.writeFile ?? vi.fn(),
    rename: overrides.rename ?? vi.fn(),
    now: overrides.now ?? (() => 1_700_000_000_000)
  };
}

describe("resolvePreferencesFilePath", () => {
  it("appends the preferences file name to the userData directory", () => {
    const userDataDir = path.join("C:/Users/demo/AppData/Roaming", "yulora");
    const resolved = resolvePreferencesFilePath(userDataDir);

    expect(resolved).toBe(path.join(userDataDir, "preferences.json"));
  });
});

describe("loadPreferencesFromDisk", () => {
  it("returns defaults when the preferences file does not exist", async () => {
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" });
    const deps = createDependencies({
      readFile: vi.fn().mockRejectedValue(enoent)
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result).toEqual({
      source: "missing",
      preferences: DEFAULT_PREFERENCES
    });
    expect(deps.rename).not.toHaveBeenCalled();
  });

  it("treats unexpected read failures as missing so startup is not blocked", async () => {
    const deps = createDependencies({
      readFile: vi.fn().mockRejectedValue(new Error("EACCES"))
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result.source).toBe("missing");
    expect(result.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("parses a valid preferences file and re-normalizes the value", async () => {
    const deps = createDependencies({
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({
          version: 2,
          autosave: { idleDelayMs: 2500 },
          recentFiles: { maxEntries: 20 },
          ui: { fontSize: 18 },
          document: { fontFamily: "Fira Code", cjkFontFamily: "Source Han Sans SC", fontSize: 16 },
          theme: { mode: "dark", selectedId: "graphite" }
        })
      )
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result.source).toBe("parsed");
    expect(result.preferences).toEqual({
      version: 2,
      autosave: { idleDelayMs: 2500 },
      recentFiles: { maxEntries: 20 },
      ui: { fontSize: 18 },
      document: { fontFamily: "Fira Code", cjkFontFamily: "Source Han Sans SC", fontSize: 16 },
      theme: { mode: "dark", selectedId: "graphite" }
    });
  });

  it("migrates legacy editor font settings into the document settings", async () => {
    const deps = createDependencies({
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({
          version: 1,
          editor: { fontFamily: "IBM Plex Serif", fontSize: 19 }
        })
      )
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result.source).toBe("parsed");
    expect(result.preferences.ui).toEqual(DEFAULT_PREFERENCES.ui);
    expect(result.preferences.document).toEqual({
      fontFamily: "IBM Plex Serif",
      cjkFontFamily: null,
      fontSize: 19
    });
  });

  it("clamps out-of-range values when parsing", async () => {
    const deps = createDependencies({
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({
          autosave: { idleDelayMs: 10_000_000 },
          recentFiles: { maxEntries: -5 }
        })
      )
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result.preferences.autosave.idleDelayMs).toBe(60_000);
    expect(result.preferences.recentFiles.maxEntries).toBe(0);
  });

  it("renames a corrupt file aside and returns defaults", async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    const deps = createDependencies({
      readFile: vi.fn().mockResolvedValue("{ not json"),
      rename,
      now: () => 1_700_000_000_000
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(rename).toHaveBeenCalledWith(
      FILE_PATH,
      `${FILE_PATH}.corrupt-1700000000000`
    );
    expect(result).toEqual({
      source: "recovered-from-corrupt",
      preferences: DEFAULT_PREFERENCES,
      corruptBackupPath: `${FILE_PATH}.corrupt-1700000000000`
    });
  });

  it("still returns defaults when a corrupt file cannot be renamed", async () => {
    const deps = createDependencies({
      readFile: vi.fn().mockResolvedValue("{ not json"),
      rename: vi.fn().mockRejectedValue(new Error("EPERM"))
    });

    const result = await loadPreferencesFromDisk(FILE_PATH, deps);

    expect(result.source).toBe("recovered-from-corrupt");
    expect(result.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.corruptBackupPath).toBeUndefined();
  });
});

describe("writePreferencesToDisk", () => {
  it("writes to a temp file then renames it into place", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const rename = vi.fn().mockResolvedValue(undefined);
    const deps = createDependencies({ writeFile, rename });

    const result = await writePreferencesToDisk(FILE_PATH, DEFAULT_PREFERENCES, deps);

    expect(writeFile).toHaveBeenCalledWith(
      `${FILE_PATH}.tmp`,
      serializePreferences(DEFAULT_PREFERENCES),
      "utf8"
    );
    expect(rename).toHaveBeenCalledWith(`${FILE_PATH}.tmp`, FILE_PATH);
    expect(result).toEqual({ status: "success" });
  });

  it("returns write-failed when the initial write cannot complete", async () => {
    const deps = createDependencies({
      writeFile: vi.fn().mockRejectedValue(new Error("disk full"))
    });

    const result = await writePreferencesToDisk(FILE_PATH, DEFAULT_PREFERENCES, deps);

    expect(result).toEqual({
      status: "error",
      error: {
        code: "write-failed",
        message: "Preferences could not be written to disk."
      }
    });
  });

  it("returns commit-failed when the atomic rename cannot complete", async () => {
    const deps = createDependencies({
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockRejectedValue(new Error("EBUSY"))
    });

    const result = await writePreferencesToDisk(FILE_PATH, DEFAULT_PREFERENCES, deps);

    expect(result).toEqual({
      status: "error",
      error: {
        code: "commit-failed",
        message: "Preferences were written but could not be committed atomically."
      }
    });
  });
});
