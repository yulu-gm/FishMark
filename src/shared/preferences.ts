/**
 * Shared preferences contract between the main process, preload bridge, and
 * renderer. Values live in a JSON file under `app.getPath('userData')`, so this
 * module must stay free of Electron or Node imports and be safe to load from
 * any process.
 */

export const PREFERENCES_FILE_NAME = "preferences.json";

export const PREFERENCES_SCHEMA_VERSION = 3 as const;
export type PreferencesSchemaVersion = typeof PREFERENCES_SCHEMA_VERSION;

export const GET_PREFERENCES_CHANNEL = "fishmark:get-preferences";
export const UPDATE_PREFERENCES_CHANNEL = "fishmark:update-preferences";
export const SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL =
  "fishmark:select-temporary-image-directory";
export const PREFERENCES_CHANGED_EVENT = "fishmark:preferences-changed";

export type ThemeMode = "system" | "light" | "dark";
export type ThemeEffectsMode = "auto" | "full" | "off";

export type AutosavePreferences = {
  /** Milliseconds of editor idleness before autosave fires. */
  idleDelayMs: number;
};

export type RecentFilesPreferences = {
  /** Maximum number of recently opened documents to remember. */
  maxEntries: number;
};

export type UiPreferences = {
  /** CSS font-family override for application chrome, or `null` to use the platform default. */
  fontFamily: string | null;
  /** Font size in pixels, or `null` to use the theme default. */
  fontSize: number | null;
  /**
   * Width in CSS pixels of the shared workspace side panel (the region that
   * hosts the Search and Outline view containers), or `null` to use
   * {@link SIDE_PANEL_WIDTH_DEFAULT}. One value is shared by every view
   * container; a collapsed panel never overwrites it with `0`.
   */
  sidePanelWidth: number | null;
};

export type DocumentPreferences = {
  /** CSS font-family override, or `null` to use the platform default. */
  fontFamily: string | null;
  /** CSS font-family override for CJK text, or `null` to use the document font. */
  cjkFontFamily: string | null;
  /** Font size in pixels, or `null` to use the theme default. */
  fontSize: number | null;
};

export type ImagePreferences = {
  /** Absolute temporary directory path for extracted images, or `null` for the app default. */
  temporaryDirectory: string | null;
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
  recentFiles: RecentFilesPreferences;
  ui: UiPreferences;
  document: DocumentPreferences;
  images: ImagePreferences;
  theme: ThemePreferences;
};

export type PreferencesUpdate = {
  autosave?: Partial<AutosavePreferences>;
  recentFiles?: Partial<RecentFilesPreferences>;
  ui?: Partial<UiPreferences>;
  document?: Partial<DocumentPreferences>;
  images?: Partial<ImagePreferences>;
  theme?: Partial<ThemePreferences>;
};

export type UpdatePreferencesSuccess = {
  status: "success";
  preferences: Preferences;
};

export type UpdatePreferencesResult =
  | UpdatePreferencesSuccess
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
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
    fontFamily: null,
    fontSize: null,
    sidePanelWidth: null
  },
  document: {
    fontFamily: null,
    cjkFontFamily: null,
    fontSize: null
  },
  images: {
    temporaryDirectory: null
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

const RECENT_FILES_MIN = 0;
const RECENT_FILES_MAX = 100;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;

/**
 * The shared side panel (Search / Outline) keeps one width for every view
 * container. The stored value is expressed in CSS pixels and clamped to
 * {@link SIDE_PANEL_WIDTH_MIN}..{@link SIDE_PANEL_WIDTH_MAX}; narrower windows
 * clamp it for display only and never write the clamped value back.
 */
export const SIDE_PANEL_WIDTH_MIN = 160;
export const SIDE_PANEL_WIDTH_MAX = 480;
export const SIDE_PANEL_WIDTH_DEFAULT = 248;
/** Upper bound relative to the space available for the panel, as a fraction. */
export const SIDE_PANEL_WIDTH_MAX_VIEWPORT_FRACTION = 0.6;

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const THEME_EFFECTS_MODES: readonly ThemeEffectsMode[] = ["auto", "full", "off"];

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

function normalizeSidePanelWidth(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return clampInteger(value, SIDE_PANEL_WIDTH_MIN, SIDE_PANEL_WIDTH_MAX);
}

/**
 * Clamp a side panel width for a given amount of space.
 *
 * `availableWidth` is the space the panel column can occupy (the workspace
 * stage minus the panel gap); the result never exceeds
 * {@link SIDE_PANEL_WIDTH_MAX_VIEWPORT_FRACTION} of it. Pass `null` when the
 * space cannot be measured — then only the absolute bounds apply. The result is
 * always within {@link SIDE_PANEL_WIDTH_MIN}..{@link SIDE_PANEL_WIDTH_MAX}, so
 * callers can persist it directly; clamping for display must not be written
 * back.
 */
export function clampSidePanelWidth(
  width: number,
  availableWidth: number | null = null
): number {
  const absolute = Number.isFinite(width)
    ? clampInteger(width, SIDE_PANEL_WIDTH_MIN, SIDE_PANEL_WIDTH_MAX)
    : SIDE_PANEL_WIDTH_MIN;

  if (availableWidth === null || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return absolute;
  }

  const sharedMaximum = Math.max(
    SIDE_PANEL_WIDTH_MIN,
    Math.min(SIDE_PANEL_WIDTH_MAX, availableWidth * SIDE_PANEL_WIDTH_MAX_VIEWPORT_FRACTION)
  );

  return Math.min(absolute, Math.round(sharedMaximum));
}

function isAbsoluteFilesystemPath(value: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^[/\\]{2}[^/\\]+[/\\][^/\\]+/.test(value) ||
    value.startsWith("/")
  );
}

function normalizeImageTemporaryDirectory(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || !isAbsoluteFilesystemPath(trimmed)) {
    return null;
  }

  return trimmed;
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
  const recentFilesSource = isRecord(source.recentFiles) ? source.recentFiles : {};
  const uiSource = isRecord(source.ui) ? source.ui : {};
  const documentSource = isRecord(source.document) ? source.document : {};
  const imagesSource = isRecord(source.images) ? source.images : {};
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
      fontFamily: normalizeFontFamily(uiSource.fontFamily),
      fontSize: normalizeFontSize(uiSource.fontSize),
      sidePanelWidth: normalizeSidePanelWidth(uiSource.sidePanelWidth)
    },
    document: {
      fontFamily: normalizeFontFamily(documentSource.fontFamily),
      cjkFontFamily: normalizeFontFamily(documentSource.cjkFontFamily),
      fontSize: normalizeFontSize(documentSource.fontSize)
    },
    images: {
      temporaryDirectory: normalizeImageTemporaryDirectory(imagesSource.temporaryDirectory)
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
    recentFiles: { ...current.recentFiles, ...patch.recentFiles },
    ui: { ...current.ui, ...patch.ui },
    document: { ...current.document, ...patch.document },
    images: { ...current.images, ...patch.images },
    theme: { ...current.theme, ...themePatch, parameters: mergedThemeParameters }
  });
}

/**
 * Serialize preferences to disk-friendly JSON (with trailing newline).
 */
export function serializePreferences(preferences: Preferences): string {
  return `${JSON.stringify(preferences, null, 2)}\n`;
}
