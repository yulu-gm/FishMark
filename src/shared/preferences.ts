/**
 * Shared preferences contract between the main process, preload bridge, and
 * renderer. Values live in a JSON file under `app.getPath('userData')`, so this
 * module must stay free of Electron or Node imports and be safe to load from
 * any process.
 */

export const PREFERENCES_FILE_NAME = "preferences.json";

export const PREFERENCES_SCHEMA_VERSION = 2 as const;
export type PreferencesSchemaVersion = typeof PREFERENCES_SCHEMA_VERSION;

export const GET_PREFERENCES_CHANNEL = "yulora:get-preferences";
export const UPDATE_PREFERENCES_CHANNEL = "yulora:update-preferences";
export const PREFERENCES_CHANGED_EVENT = "yulora:preferences-changed";

export type ThemeMode = "system" | "light" | "dark";

export type AutosavePreferences = {
  /** Milliseconds of editor idleness before autosave fires. */
  idleDelayMs: number;
};

export type RecentFilesPreferences = {
  /** Maximum number of recently opened documents to remember. */
  maxEntries: number;
};

export type UiPreferences = {
  /** Font size in pixels, or `null` to use the theme default. */
  fontSize: number | null;
};

export type DocumentPreferences = {
  /** CSS font-family override, or `null` to use the platform default. */
  fontFamily: string | null;
  /** Font size in pixels, or `null` to use the theme default. */
  fontSize: number | null;
};

export type ThemePreferences = {
  mode: ThemeMode;
  selectedId: string | null;
};

export type Preferences = {
  version: PreferencesSchemaVersion;
  autosave: AutosavePreferences;
  recentFiles: RecentFilesPreferences;
  ui: UiPreferences;
  document: DocumentPreferences;
  theme: ThemePreferences;
};

export type PreferencesUpdate = {
  autosave?: Partial<AutosavePreferences>;
  recentFiles?: Partial<RecentFilesPreferences>;
  ui?: Partial<UiPreferences>;
  document?: Partial<DocumentPreferences>;
  theme?: Partial<ThemePreferences>;
};

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_SCHEMA_VERSION,
  autosave: {
    idleDelayMs: 1000
  },
  recentFiles: {
    maxEntries: 10
  },
  ui: {
    fontSize: null
  },
  document: {
    fontFamily: null,
    fontSize: null
  },
  theme: {
    mode: "system",
    selectedId: null
  }
};

const AUTOSAVE_IDLE_MIN_MS = 100;
const AUTOSAVE_IDLE_MAX_MS = 60_000;

const RECENT_FILES_MIN = 0;
const RECENT_FILES_MAX = 100;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdleDelay(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.autosave.idleDelayMs;
  }

  return clampInteger(value, AUTOSAVE_IDLE_MIN_MS, AUTOSAVE_IDLE_MAX_MS);
}

function normalizeMaxEntries(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.recentFiles.maxEntries;
  }

  return clampInteger(value, RECENT_FILES_MIN, RECENT_FILES_MAX);
}

function normalizeFontFamily(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

function normalizeFontSize(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return clampInteger(value, FONT_SIZE_MIN, FONT_SIZE_MAX);
}

function hasOwnProperty(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function resolveMigratedValue(
  primarySource: Record<string, unknown>,
  primaryKey: string,
  fallbackSource: Record<string, unknown>,
  fallbackKey: string
): unknown {
  if (hasOwnProperty(primarySource, primaryKey)) {
    return primarySource[primaryKey];
  }

  return fallbackSource[fallbackKey];
}

function normalizeThemeMode(value: unknown): ThemeMode {
  if (typeof value !== "string") {
    return DEFAULT_PREFERENCES.theme.mode;
  }

  return THEME_MODES.includes(value as ThemeMode)
    ? (value as ThemeMode)
    : DEFAULT_PREFERENCES.theme.mode;
}

function normalizeThemeSelectedId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/(?:-|_)(light|dark)$/u, "") || trimmed;
}

/**
 * Produce a valid {@link Preferences} object from arbitrary input.
 *
 * - Missing or malformed fields fall back to the default value.
 * - Numeric fields are clamped to their safe range.
 * - Unknown extra fields are dropped.
 *
 * Older schema versions are migrated by re-normalizing against the current
 * defaults. When new versions are introduced, add the migration here.
 */
export function normalizePreferences(raw: unknown): Preferences {
  const source = isRecord(raw) ? raw : {};

  const autosaveSource = isRecord(source.autosave) ? source.autosave : {};
  const recentFilesSource = isRecord(source.recentFiles) ? source.recentFiles : {};
  const uiSource = isRecord(source.ui) ? source.ui : {};
  const documentSource = isRecord(source.document) ? source.document : {};
  const legacyEditorSource = isRecord(source.editor) ? source.editor : {};
  const themeSource = isRecord(source.theme) ? source.theme : {};

  return {
    version: PREFERENCES_SCHEMA_VERSION,
    autosave: {
      idleDelayMs: normalizeIdleDelay(autosaveSource.idleDelayMs)
    },
    recentFiles: {
      maxEntries: normalizeMaxEntries(recentFilesSource.maxEntries)
    },
    ui: {
      fontSize: normalizeFontSize(uiSource.fontSize)
    },
    document: {
      fontFamily: normalizeFontFamily(
        resolveMigratedValue(documentSource, "fontFamily", legacyEditorSource, "fontFamily")
      ),
      fontSize: normalizeFontSize(
        resolveMigratedValue(documentSource, "fontSize", legacyEditorSource, "fontSize")
      )
    },
    theme: {
      mode: normalizeThemeMode(themeSource.mode),
      selectedId: normalizeThemeSelectedId(themeSource.selectedId)
    }
  };
}

/**
 * Apply a partial patch on top of an existing {@link Preferences} value and
 * re-normalize the result. Callers pass only the fields they want to change;
 * everything else is preserved.
 */
export function mergePreferences(
  current: Preferences,
  patch: PreferencesUpdate | undefined
): Preferences {
  if (!patch) {
    return normalizePreferences(current);
  }

  return normalizePreferences({
    version: PREFERENCES_SCHEMA_VERSION,
    autosave: { ...current.autosave, ...patch.autosave },
    recentFiles: { ...current.recentFiles, ...patch.recentFiles },
    ui: { ...current.ui, ...patch.ui },
    document: { ...current.document, ...patch.document },
    theme: { ...current.theme, ...patch.theme }
  });
}

/**
 * Serialize preferences to disk-friendly JSON (with trailing newline).
 */
export function serializePreferences(preferences: Preferences): string {
  return `${JSON.stringify(preferences, null, 2)}\n`;
}
