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
export type ThemeEffectsMode = "auto" | "full" | "off";
export type FocusTriggerMode = "manual" | "auto";

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

export type FocusPreferences = {
  /** How shell focus mode should be entered. */
  triggerMode: FocusTriggerMode;
  /** Milliseconds of editor idleness before auto focus activates. */
  idleDelayMs: number;
};

export type DocumentPreferences = {
  /** CSS font-family override, or `null` to use the platform default. */
  fontFamily: string | null;
  /** CSS font-family override for CJK text, or `null` to use the document font. */
  cjkFontFamily: string | null;
  /** Font size in pixels, or `null` to use the theme default. */
  fontSize: number | null;
};

/**
 * Per-theme parameter overrides. Keyed by theme package id, then by parameter
 * id. Values are always numbers (toggles are serialized as 0 or 1) so the main
 * process never has to know about the theme's parameter schema.
 */
export type ThemeParameterOverrides = Record<string, Record<string, number>>;

export type ThemePreferences = {
  mode: ThemeMode;
  selectedId: string | null;
  effectsMode: ThemeEffectsMode;
  parameters: ThemeParameterOverrides;
};

export type Preferences = {
  version: PreferencesSchemaVersion;
  autosave: AutosavePreferences;
  focus: FocusPreferences;
  recentFiles: RecentFilesPreferences;
  ui: UiPreferences;
  document: DocumentPreferences;
  theme: ThemePreferences;
};

export type PreferencesUpdate = {
  autosave?: Partial<AutosavePreferences>;
  focus?: Partial<FocusPreferences>;
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
  focus: {
    triggerMode: "auto",
    idleDelayMs: 3000
  },
  recentFiles: {
    maxEntries: 10
  },
  ui: {
    fontSize: null
  },
  document: {
    fontFamily: null,
    cjkFontFamily: null,
    fontSize: null
  },
  theme: {
    mode: "system",
    selectedId: null,
    effectsMode: "auto",
    parameters: {}
  }
};

const AUTOSAVE_IDLE_MIN_MS = 100;
const AUTOSAVE_IDLE_MAX_MS = 60_000;
const FOCUS_IDLE_MIN_MS = 500;
const FOCUS_IDLE_MAX_MS = 30_000;

const RECENT_FILES_MIN = 0;
const RECENT_FILES_MAX = 100;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const THEME_EFFECTS_MODES: readonly ThemeEffectsMode[] = ["auto", "full", "off"];
const FOCUS_TRIGGER_MODES: readonly FocusTriggerMode[] = ["manual", "auto"];

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

function normalizeFocusIdleDelay(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.focus.idleDelayMs;
  }

  return clampInteger(value, FOCUS_IDLE_MIN_MS, FOCUS_IDLE_MAX_MS);
}

function normalizeFocusTriggerMode(value: unknown): FocusTriggerMode {
  if (typeof value !== "string") {
    return DEFAULT_PREFERENCES.focus.triggerMode;
  }

  return FOCUS_TRIGGER_MODES.includes(value as FocusTriggerMode)
    ? (value as FocusTriggerMode)
    : DEFAULT_PREFERENCES.focus.triggerMode;
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

function normalizeThemeMode(value: unknown): ThemeMode {
  if (typeof value !== "string") {
    return DEFAULT_PREFERENCES.theme.mode;
  }

  return THEME_MODES.includes(value as ThemeMode)
    ? (value as ThemeMode)
    : DEFAULT_PREFERENCES.theme.mode;
}

function normalizeThemeEffectsMode(value: unknown): ThemeEffectsMode {
  if (typeof value !== "string") {
    return DEFAULT_PREFERENCES.theme.effectsMode;
  }

  return THEME_EFFECTS_MODES.includes(value as ThemeEffectsMode)
    ? (value as ThemeEffectsMode)
    : DEFAULT_PREFERENCES.theme.effectsMode;
}

function normalizeThemeParameterOverrides(value: unknown): ThemeParameterOverrides {
  if (!isRecord(value)) {
    return {};
  }

  const result: ThemeParameterOverrides = {};

  for (const themeId in value) {
    const trimmedThemeId = themeId.trim();
    if (trimmedThemeId.length === 0) {
      continue;
    }

    const parameterSource = value[themeId];
    if (!isRecord(parameterSource)) {
      continue;
    }

    const parameterEntries: Record<string, number> = {};
    for (const parameterId in parameterSource) {
      const parameterValue = parameterSource[parameterId];
      const trimmedParameterId = parameterId.trim();
      if (
        trimmedParameterId.length === 0 ||
        typeof parameterValue !== "number" ||
        !Number.isFinite(parameterValue)
      ) {
        continue;
      }

      parameterEntries[trimmedParameterId] = parameterValue;
    }

    if (Object.keys(parameterEntries).length > 0) {
      result[trimmedThemeId] = parameterEntries;
    }
  }

  return result;
}

function normalizeThemeSelectedId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
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
  const focusSource = isRecord(source.focus) ? source.focus : {};
  const recentFilesSource = isRecord(source.recentFiles) ? source.recentFiles : {};
  const uiSource = isRecord(source.ui) ? source.ui : {};
  const documentSource = isRecord(source.document) ? source.document : {};
  const themeSource = isRecord(source.theme) ? source.theme : {};

  return {
    version: PREFERENCES_SCHEMA_VERSION,
    autosave: {
      idleDelayMs: normalizeIdleDelay(autosaveSource.idleDelayMs)
    },
    focus: {
      triggerMode: normalizeFocusTriggerMode(focusSource.triggerMode),
      idleDelayMs: normalizeFocusIdleDelay(focusSource.idleDelayMs)
    },
    recentFiles: {
      maxEntries: normalizeMaxEntries(recentFilesSource.maxEntries)
    },
    ui: {
      fontSize: normalizeFontSize(uiSource.fontSize)
    },
    document: {
      fontFamily: normalizeFontFamily(documentSource.fontFamily),
      cjkFontFamily: normalizeFontFamily(documentSource.cjkFontFamily),
      fontSize: normalizeFontSize(documentSource.fontSize)
    },
    theme: {
      mode: normalizeThemeMode(themeSource.mode),
      selectedId: normalizeThemeSelectedId(themeSource.selectedId),
      effectsMode: normalizeThemeEffectsMode(themeSource.effectsMode),
      parameters: normalizeThemeParameterOverrides(themeSource.parameters)
    }
  };
}

function mergeThemeParameterOverrides(
  current: ThemeParameterOverrides,
  patch: ThemeParameterOverrides | undefined
): ThemeParameterOverrides {
  if (!patch) {
    return current;
  }

  const merged: ThemeParameterOverrides = { ...current };

  for (const themeId in patch) {
    const patchEntries = patch[themeId];
    if (patchEntries === undefined) {
      continue;
    }

    merged[themeId] = { ...(current[themeId] ?? {}), ...patchEntries };
  }

  return merged;
}

/**
 * Apply a partial patch on top of an existing {@link Preferences} value and
 * re-normalize the result. Callers pass only the fields they want to change;
 * everything else is preserved. Theme parameter overrides merge per-theme so
 * adjusting one theme's slider doesn't wipe out overrides for other themes.
 */
export function mergePreferences(
  current: Preferences,
  patch: PreferencesUpdate | undefined
): Preferences {
  if (!patch) {
    return normalizePreferences(current);
  }

  const themePatch = patch.theme;
  const mergedThemeParameters = mergeThemeParameterOverrides(
    current.theme.parameters,
    themePatch?.parameters
  );

  return normalizePreferences({
    version: PREFERENCES_SCHEMA_VERSION,
    autosave: { ...current.autosave, ...patch.autosave },
    focus: { ...current.focus, ...patch.focus },
    recentFiles: { ...current.recentFiles, ...patch.recentFiles },
    ui: { ...current.ui, ...patch.ui },
    document: { ...current.document, ...patch.document },
    theme: { ...current.theme, ...themePatch, parameters: mergedThemeParameters }
  });
}

/**
 * Serialize preferences to disk-friendly JSON (with trailing newline).
 */
export function serializePreferences(preferences: Preferences): string {
  return `${JSON.stringify(preferences, null, 2)}\n`;
}
