import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_SCHEMA_VERSION,
  mergePreferences,
  normalizePreferences,
  serializePreferences
} from "./preferences";

describe("normalizePreferences", () => {
  it("returns defaults when given null, undefined, or a non-object value", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("not-an-object")).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(["array", "is", "not", "record"])).toEqual(DEFAULT_PREFERENCES);
  });

  it("stamps the current schema version even when the input lacks one", () => {
    const result = normalizePreferences({});

    expect(result.version).toBe(PREFERENCES_SCHEMA_VERSION);
  });

  it("defaults image preferences to no temporary directory on schema version 3", () => {
    expect(PREFERENCES_SCHEMA_VERSION).toBe(3);
    expect(DEFAULT_PREFERENCES.images).toEqual({ temporaryDirectory: null });
    expect(normalizePreferences({}).images).toEqual({ temporaryDirectory: null });
  });

  it("migrates legacy preferences without image settings to the current image defaults", () => {
    const result = normalizePreferences({
      version: 2,
      autosave: { idleDelayMs: 2500 },
      recentFiles: { maxEntries: 25 },
      ui: { fontFamily: "Segoe UI", fontSize: 15 },
      document: { fontFamily: "Mono", cjkFontFamily: "Source Han Sans SC", fontSize: 16 },
      theme: { mode: "dark", selectedId: "graphite", effectsMode: "full", parameters: {} }
    });

    expect(result.version).toBe(3);
    expect(result.images).toEqual({ temporaryDirectory: null });
    expect(result.autosave.idleDelayMs).toBe(2500);
    expect(result.theme.mode).toBe("dark");
  });

  it("falls back to default idle delay for non-numeric or non-finite values", () => {
    expect(normalizePreferences({ autosave: { idleDelayMs: "1000" } }).autosave.idleDelayMs).toBe(
      DEFAULT_PREFERENCES.autosave.idleDelayMs
    );
    expect(normalizePreferences({ autosave: { idleDelayMs: Number.NaN } }).autosave.idleDelayMs).toBe(
      DEFAULT_PREFERENCES.autosave.idleDelayMs
    );
    expect(
      normalizePreferences({ autosave: { idleDelayMs: Number.POSITIVE_INFINITY } }).autosave
        .idleDelayMs
    ).toBe(DEFAULT_PREFERENCES.autosave.idleDelayMs);
  });

  it("clamps the idle delay to the supported range and rounds non-integer input", () => {
    expect(normalizePreferences({ autosave: { idleDelayMs: 0 } }).autosave.idleDelayMs).toBe(100);
    expect(
      normalizePreferences({ autosave: { idleDelayMs: 10_000_000 } }).autosave.idleDelayMs
    ).toBe(60_000);
    expect(normalizePreferences({ autosave: { idleDelayMs: 2500.6 } }).autosave.idleDelayMs).toBe(
      2501
    );
  });

  it("clamps recent-files max entries to the supported range", () => {
    expect(normalizePreferences({ recentFiles: { maxEntries: -1 } }).recentFiles.maxEntries).toBe(
      0
    );
    expect(normalizePreferences({ recentFiles: { maxEntries: 500 } }).recentFiles.maxEntries).toBe(
      100
    );
    expect(
      normalizePreferences({ recentFiles: { maxEntries: "ten" } }).recentFiles.maxEntries
    ).toBe(DEFAULT_PREFERENCES.recentFiles.maxEntries);
  });

  it("trims and nullifies the font family", () => {
    expect(
      normalizePreferences({ document: { fontFamily: "  Fira Code  " } }).document.fontFamily
    ).toBe("Fira Code");
    expect(normalizePreferences({ document: { fontFamily: "" } }).document.fontFamily).toBeNull();
    expect(normalizePreferences({ document: { fontFamily: "   " } }).document.fontFamily).toBeNull();
    expect(normalizePreferences({ document: { fontFamily: 42 } }).document.fontFamily).toBeNull();
  });

  it("trims and nullifies the CJK font family", () => {
    expect(
      normalizePreferences({ document: { cjkFontFamily: "  Source Han Sans SC  " } }).document
        .cjkFontFamily
    ).toBe("Source Han Sans SC");
    expect(normalizePreferences({ document: { cjkFontFamily: "" } }).document.cjkFontFamily).toBeNull();
    expect(normalizePreferences({ document: { cjkFontFamily: "   " } }).document.cjkFontFamily).toBeNull();
    expect(normalizePreferences({ document: { cjkFontFamily: 42 } }).document.cjkFontFamily).toBeNull();
  });

  it("clamps and rounds the document font size and allows explicit null", () => {
    expect(normalizePreferences({ document: { fontSize: 4 } }).document.fontSize).toBe(8);
    expect(normalizePreferences({ document: { fontSize: 999 } }).document.fontSize).toBe(72);
    expect(normalizePreferences({ document: { fontSize: 14.6 } }).document.fontSize).toBe(15);
    expect(normalizePreferences({ document: { fontSize: null } }).document.fontSize).toBeNull();
    expect(normalizePreferences({ document: { fontSize: "big" } }).document.fontSize).toBeNull();
  });

  it("clamps and rounds the ui font size and allows explicit null", () => {
    expect(normalizePreferences({ ui: { fontSize: 4 } }).ui.fontSize).toBe(8);
    expect(normalizePreferences({ ui: { fontSize: 999 } }).ui.fontSize).toBe(72);
    expect(normalizePreferences({ ui: { fontSize: 14.6 } }).ui.fontSize).toBe(15);
    expect(normalizePreferences({ ui: { fontSize: null } }).ui.fontSize).toBeNull();
    expect(normalizePreferences({ ui: { fontSize: "big" } }).ui.fontSize).toBeNull();
  });

  it("trims and nullifies the ui font family", () => {
    expect(normalizePreferences({ ui: { fontFamily: "  Segoe UI  " } }).ui.fontFamily).toBe(
      "Segoe UI"
    );
    expect(normalizePreferences({ ui: { fontFamily: "" } }).ui.fontFamily).toBeNull();
    expect(normalizePreferences({ ui: { fontFamily: "   " } }).ui.fontFamily).toBeNull();
    expect(normalizePreferences({ ui: { fontFamily: 42 } }).ui.fontFamily).toBeNull();
  });

  it("only accepts known theme modes and falls back to system otherwise", () => {
    expect(normalizePreferences({ theme: { mode: "dark" } }).theme.mode).toBe("dark");
    expect(normalizePreferences({ theme: { mode: "light" } }).theme.mode).toBe("light");
    expect(normalizePreferences({ theme: { mode: "system" } }).theme.mode).toBe("system");
    expect(normalizePreferences({ theme: { mode: "solarized" } }).theme.mode).toBe("system");
    expect(normalizePreferences({ theme: { mode: 7 } }).theme.mode).toBe("system");
  });

  it("trims the selected theme id and falls back to null for invalid input", () => {
    expect(normalizePreferences({ theme: { selectedId: "  graphite  " } }).theme.selectedId).toBe(
      "graphite"
    );
    expect(normalizePreferences({ theme: { selectedId: "" } }).theme.selectedId).toBeNull();
    expect(normalizePreferences({ theme: { selectedId: "   " } }).theme.selectedId).toBeNull();
    expect(normalizePreferences({ theme: { selectedId: 17 } }).theme.selectedId).toBeNull();
  });

  it("preserves theme family ids even when they end with a mode suffix", () => {
    expect(normalizePreferences({ theme: { selectedId: "graphite-dark" } }).theme.selectedId).toBe(
      "graphite-dark"
    );
    expect(
      normalizePreferences({ theme: { selectedId: "terminal_light" } }).theme.selectedId
    ).toBe("terminal_light");
    expect(normalizePreferences({ theme: { selectedId: "midnight" } }).theme.selectedId).toBe(
      "midnight"
    );
  });

  it("normalizes theme effects mode to auto/full/off", () => {
    expect(normalizePreferences({ theme: { effectsMode: "auto" } }).theme.effectsMode).toBe("auto");
    expect(normalizePreferences({ theme: { effectsMode: "full" } }).theme.effectsMode).toBe("full");
    expect(normalizePreferences({ theme: { effectsMode: "off" } }).theme.effectsMode).toBe("off");
    expect(normalizePreferences({ theme: { effectsMode: "storm" } }).theme.effectsMode).toBe("auto");
  });

  it("trims accepted absolute image temporary directory paths", () => {
    expect(
      normalizePreferences({ images: { temporaryDirectory: "  C:/Users/me/AppData/Temp  " } })
        .images.temporaryDirectory
    ).toBe("C:/Users/me/AppData/Temp");
    expect(
      normalizePreferences({ images: { temporaryDirectory: "  C:\\Users\\me\\AppData\\Temp  " } })
        .images.temporaryDirectory
    ).toBe("C:\\Users\\me\\AppData\\Temp");
    expect(
      normalizePreferences({ images: { temporaryDirectory: "  //server/share/fishmark  " } }).images
        .temporaryDirectory
    ).toBe("//server/share/fishmark");
    expect(
      normalizePreferences({ images: { temporaryDirectory: "  \\\\server\\share\\fishmark  " } })
        .images.temporaryDirectory
    ).toBe("\\\\server\\share\\fishmark");
    expect(
      normalizePreferences({ images: { temporaryDirectory: "  /tmp/fishmark  " } }).images
        .temporaryDirectory
    ).toBe("/tmp/fishmark");
  });

  it("rejects empty, non-string, and relative image temporary directories", () => {
    expect(normalizePreferences({ images: { temporaryDirectory: "" } }).images.temporaryDirectory).toBeNull();
    expect(
      normalizePreferences({ images: { temporaryDirectory: "   " } }).images.temporaryDirectory
    ).toBeNull();
    expect(
      normalizePreferences({ images: { temporaryDirectory: "temp/fishmark" } }).images
        .temporaryDirectory
    ).toBeNull();
    expect(
      normalizePreferences({ images: { temporaryDirectory: ".\\temp\\fishmark" } }).images
        .temporaryDirectory
    ).toBeNull();
    expect(
      normalizePreferences({ images: { temporaryDirectory: 42 } }).images.temporaryDirectory
    ).toBeNull();
  });

  it("drops unknown extra fields at every level", () => {
    const result = normalizePreferences({
      version: 99,
      autosave: { idleDelayMs: 2000, extra: true },
      ui: { fontSize: 18, fontFamily: "Segoe UI", extra: true },
      document: { fontFamily: "Mono", cjkFontFamily: "Source Han Sans SC", fontSize: null, unknown: "x" },
      surprise: { nested: 1 }
    });

    expect(result).toEqual({
      version: PREFERENCES_SCHEMA_VERSION,
      autosave: { idleDelayMs: 2000 },
      recentFiles: DEFAULT_PREFERENCES.recentFiles,
      ui: { fontSize: 18, fontFamily: "Segoe UI" },
      document: { fontFamily: "Mono", cjkFontFamily: "Source Han Sans SC", fontSize: null },
      theme: DEFAULT_PREFERENCES.theme,
      images: DEFAULT_PREFERENCES.images
    });
  });
});

describe("mergePreferences", () => {
  it("returns normalized defaults when the patch is undefined", () => {
    expect(mergePreferences(DEFAULT_PREFERENCES, undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("only overwrites the fields included in the patch", () => {
    const next = mergePreferences(DEFAULT_PREFERENCES, {
      autosave: { idleDelayMs: 2500 },
      document: {
        fontFamily: "IBM Plex Serif",
        cjkFontFamily: "Source Han Sans SC",
        fontSize: 18
      },
      theme: { mode: "dark", selectedId: "graphite" }
    });

    expect(next).toEqual({
      ...DEFAULT_PREFERENCES,
      autosave: { idleDelayMs: 2500 },
      document: {
        fontFamily: "IBM Plex Serif",
        cjkFontFamily: "Source Han Sans SC",
        fontSize: 18
      },
      theme: { mode: "dark", selectedId: "graphite", effectsMode: "auto", parameters: {} }
    });
  });

  it("re-normalizes the merged result so out-of-range patches stay safe", () => {
    const next = mergePreferences(DEFAULT_PREFERENCES, {
      autosave: { idleDelayMs: 10_000_000 },
      recentFiles: { maxEntries: -1 },
      ui: { fontSize: 200 }
    });

    expect(next.autosave.idleDelayMs).toBe(60_000);
    expect(next.recentFiles.maxEntries).toBe(0);
    expect(next.ui.fontSize).toBe(72);
  });

  it("updates and restores the image temporary directory while preserving other preferences", () => {
    const withTemporaryDirectory = mergePreferences(DEFAULT_PREFERENCES, {
      autosave: { idleDelayMs: 2500 },
      images: { temporaryDirectory: "  /tmp/fishmark-images  " }
    });

    expect(withTemporaryDirectory.images.temporaryDirectory).toBe("/tmp/fishmark-images");
    expect(withTemporaryDirectory.autosave.idleDelayMs).toBe(2500);
    expect(withTemporaryDirectory.theme).toEqual(DEFAULT_PREFERENCES.theme);

    const restored = mergePreferences(withTemporaryDirectory, {
      images: { temporaryDirectory: null }
    });

    expect(restored.images.temporaryDirectory).toBeNull();
    expect(restored.autosave.idleDelayMs).toBe(2500);
  });
});

describe("serializePreferences", () => {
  it("emits pretty-printed JSON with a trailing newline", () => {
    const serialized = serializePreferences(DEFAULT_PREFERENCES);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(DEFAULT_PREFERENCES);
  });
});
