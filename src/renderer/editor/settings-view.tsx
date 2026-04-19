import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PREFERENCES,
  type FocusTriggerMode,
  type Preferences,
  type PreferencesUpdate,
  type ThemeMode
} from "../../shared/preferences";
import type { ThemeParameterDescriptor } from "../../shared/theme-package";

type UpdatePreferencesResult =
  | { status: "success"; preferences: Preferences }
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
    };

type ThemePackageEntry = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];

type SettingsViewProps = {
  surfaceState: "open" | "closing";
  preferences: Preferences;
  fontFamilies: string[];
  themePackages: ThemePackageEntry[];
  isRefreshingThemes: boolean;
  onRefreshThemes: () => Promise<void>;
  onUpdate: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
  onClose: () => void;
};

type DraftState = {
  uiFontFamily: string;
  uiFontSize: string;
  documentFontFamily: string;
  documentCjkFontFamily: string;
  documentFontSize: string;
  autosaveIdleDelayMs: string;
  focusIdleSeconds: string;
};

type FontOption = {
  label: string;
  value: string;
};

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色"
};

const THEME_EFFECT_LABELS = {
  auto: "自动",
  full: "始终开启",
  off: "关闭"
} as const;

function resolveParameterDefaultValue(parameter: ThemeParameterDescriptor): number {
  if (parameter.type === "toggle") {
    return parameter.default ? 1 : 0;
  }

  return parameter.default;
}

function resolveParameterCurrentValue(
  parameter: ThemeParameterDescriptor,
  overrides: Record<string, number> | undefined
): number {
  const override = overrides?.[parameter.id];
  if (typeof override === "number" && Number.isFinite(override)) {
    if (parameter.type === "toggle") {
      return override > 0.5 ? 1 : 0;
    }
    return Math.min(Math.max(override, parameter.min), parameter.max);
  }

  return resolveParameterDefaultValue(parameter);
}

function resolveThemePackageSelectionValue(
  packages: ThemePackageEntry[],
  selectedThemeId: string | null
): string | null {
  if (selectedThemeId === null) {
    return null;
  }

  return packages.some((themePackage) => themePackage.id === selectedThemeId)
    ? selectedThemeId
    : null;
}

function buildDraft(preferences: Preferences): DraftState {
  return {
    uiFontFamily: preferences.ui.fontFamily ?? "",
    uiFontSize: preferences.ui.fontSize === null ? "" : String(preferences.ui.fontSize),
    documentFontFamily: preferences.document.fontFamily ?? "",
    documentCjkFontFamily: preferences.document.cjkFontFamily ?? "",
    documentFontSize:
      preferences.document.fontSize === null ? "" : String(preferences.document.fontSize),
    autosaveIdleDelayMs: String(preferences.autosave.idleDelayMs),
    focusIdleSeconds: String(preferences.focus.idleDelayMs / 1000)
  };
}

function normalizeNumberInput(value: string): number | null | typeof Number.NaN {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildFontOptions(fontFamilies: string[], currentValue: string): FontOption[] {
  const normalizedFamilies = [...new Set(fontFamilies.map((value) => value.trim()).filter((value) => value.length > 0))];
  const options: FontOption[] = [{ label: "系统默认", value: "" }];

  for (const family of normalizedFamilies) {
    options.push({
      label: family,
      value: family
    });
  }

  if (currentValue.length > 0 && !normalizedFamilies.includes(currentValue)) {
    options.push({
      label: `已配置字体（未找到）：${currentValue}`,
      value: currentValue
    });
  }

  return options;
}

function formatFocusIdleSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

function buildFocusIdlePresetOptions(): FontOption[] {
  const values = new Set<number>();

  for (let value = 0.5; value <= 5; value += 0.5) {
    values.add(Number(value.toFixed(1)));
  }

  for (let value = 5; value <= 10; value += 1) {
    values.add(value);
  }

  for (let value = 10; value <= 30; value += 5) {
    values.add(value);
  }

  return Array.from(values)
    .sort((left, right) => left - right)
    .map((value) => ({
      value: formatFocusIdleSeconds(value),
      label: `${formatFocusIdleSeconds(value)}s`
    }));
}

function ThemeFolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 10h18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SettingsView({
  surfaceState,
  preferences,
  fontFamilies,
  themePackages,
  isRefreshingThemes,
  onRefreshThemes,
  onUpdate,
  onClose
}: SettingsViewProps) {
  const [draft, setDraft] = useState<DraftState>(() => buildDraft(preferences));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSavedChanges, setHasSavedChanges] = useState(false);

  useEffect(() => {
    setDraft(buildDraft(preferences));
  }, [preferences]);

  const communityThemePackages = useMemo(
    () => themePackages.filter((themePackage) => themePackage.source === "community"),
    [themePackages]
  );
  const uiFontOptions = useMemo(
    () => buildFontOptions(fontFamilies, draft.uiFontFamily.trim()),
    [fontFamilies, draft.uiFontFamily]
  );
  const documentFontOptions = useMemo(
    () => buildFontOptions(fontFamilies, draft.documentFontFamily.trim()),
    [fontFamilies, draft.documentFontFamily]
  );
  const documentCjkFontOptions = useMemo(
    () => buildFontOptions(fontFamilies, draft.documentCjkFontFamily.trim()),
    [fontFamilies, draft.documentCjkFontFamily]
  );
  const focusIdlePresetOptions = useMemo(() => buildFocusIdlePresetOptions(), []);
  const resolvedThemeSelectionValue = useMemo(
    () => resolveThemePackageSelectionValue(themePackages, preferences.theme.selectedId),
    [preferences.theme.selectedId, themePackages]
  );
  const selectedThemeMissing =
    preferences.theme.selectedId !== null && resolvedThemeSelectionValue === null;

  const activeThemePackage = useMemo(
    () =>
      resolvedThemeSelectionValue
        ? themePackages.find((entry) => entry.id === resolvedThemeSelectionValue) ?? null
        : null,
    [resolvedThemeSelectionValue, themePackages]
  );
  const activeThemeParameters: ThemeParameterDescriptor[] = activeThemePackage?.manifest.parameters ?? [];
  const activeThemeParameterOverrides = activeThemePackage
    ? preferences.theme.parameters?.[activeThemePackage.id]
    : undefined;

  async function applyPatch(patch: PreferencesUpdate): Promise<void> {
    const result = await onUpdate(patch);

    if (result.status === "error") {
      setErrorMessage(result.error.message);
      return;
    }

    setErrorMessage(null);
    setHasSavedChanges(true);
  }

  async function handleRefreshThemes(): Promise<void> {
    try {
      await onRefreshThemes();
      setErrorMessage(null);
    } catch {
      setErrorMessage("主题列表刷新失败。");
    }
  }

  async function handleOpenThemesDirectory(): Promise<void> {
    try {
      await window.yulora.openThemesDirectory();
      setErrorMessage(null);
    } catch {
      setErrorMessage("无法打开主题目录。");
    }
  }

  function handleThemeModeChange(mode: ThemeMode): void {
    void applyPatch({ theme: { mode } });
  }

  function handleThemeEffectsModeChange(value: "auto" | "full" | "off"): void {
    void applyPatch({ theme: { effectsMode: value } });
  }

  function handleThemeParameterChange(
    themeId: string,
    parameter: ThemeParameterDescriptor,
    rawValue: number | boolean
  ): void {
    const numericValue =
      parameter.type === "toggle"
        ? (typeof rawValue === "boolean" ? rawValue : rawValue > 0.5)
          ? 1
          : 0
        : typeof rawValue === "number"
          ? Math.min(Math.max(rawValue, parameter.min), parameter.max)
          : resolveParameterDefaultValue(parameter);

    void applyPatch({
      theme: {
        parameters: {
          [themeId]: { [parameter.id]: numericValue }
        }
      }
    });
  }

  function handleResetThemeParameters(themeId: string): void {
    const resetEntries: Record<string, number> = {};
    for (const parameter of activeThemeParameters) {
      resetEntries[parameter.id] = resolveParameterDefaultValue(parameter);
    }

    void applyPatch({
      theme: {
        parameters: {
          [themeId]: resetEntries
        }
      }
    });
  }

  function handleThemePackageChange(value: string): void {
    const nextValue = value === "default" ? null : value;

    if (nextValue === preferences.theme.selectedId) {
      return;
    }

    void applyPatch({ theme: { selectedId: nextValue } });
  }

  function handleUiFontSizeCommit(): void {
    const parsed = normalizeNumberInput(draft.uiFontSize);

    if (Number.isNaN(parsed)) {
      setDraft((current) => ({
        ...current,
        uiFontSize: preferences.ui.fontSize === null ? "" : String(preferences.ui.fontSize)
      }));
      return;
    }

    if (parsed === preferences.ui.fontSize) {
      return;
    }

    void applyPatch({ ui: { fontSize: parsed } });
  }

  function handleUiFontPresetChange(value: string): void {
    const nextValue = value.length === 0 ? null : value;

    if (nextValue === preferences.ui.fontFamily) {
      return;
    }

    setDraft((current) => ({
      ...current,
      uiFontFamily: value
    }));

    void applyPatch({
      ui: {
        fontFamily: nextValue
      }
    });
  }

  function handleDocumentFontSizeCommit(): void {
    const parsed = normalizeNumberInput(draft.documentFontSize);

    if (Number.isNaN(parsed)) {
      setDraft((current) => ({
        ...current,
        documentFontSize:
          preferences.document.fontSize === null ? "" : String(preferences.document.fontSize)
      }));
      return;
    }

    if (parsed === preferences.document.fontSize) {
      return;
    }

    void applyPatch({ document: { fontSize: parsed } });
  }

  function handleDocumentFontPresetChange(value: string): void {
    const nextValue = value.length === 0 ? null : value;

    if (nextValue === preferences.document.fontFamily) {
      return;
    }

    setDraft((current) => ({
      ...current,
      documentFontFamily: value
    }));

    void applyPatch({
      document: {
        fontFamily: nextValue
      }
    });
  }

  function handleDocumentCjkFontPresetChange(value: string): void {
    const nextValue = value.length === 0 ? null : value;

    if (nextValue === preferences.document.cjkFontFamily) {
      return;
    }

    setDraft((current) => ({
      ...current,
      documentCjkFontFamily: value
    }));

    void applyPatch({
      document: {
        cjkFontFamily: nextValue
      }
    });
  }

  function handleIdleDelayCommit(): void {
    const parsed = Number(draft.autosaveIdleDelayMs);

    if (!Number.isFinite(parsed)) {
      setDraft((current) => ({
        ...current,
        autosaveIdleDelayMs: String(preferences.autosave.idleDelayMs)
      }));
      return;
    }

    if (parsed === preferences.autosave.idleDelayMs) {
      return;
    }

    void applyPatch({ autosave: { idleDelayMs: parsed } });
  }

  function handleFocusTriggerModeChange(nextMode: FocusTriggerMode): void {
    if (nextMode === preferences.focus.triggerMode) {
      return;
    }

    void applyPatch({ focus: { triggerMode: nextMode } });
  }

  function handleFocusIdlePresetChange(value: string): void {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      focusIdleSeconds: value
    }));

    void applyPatch({ focus: { idleDelayMs: Math.round(seconds * 1000) } });
  }

  function handleFocusIdleSecondsCommit(): void {
    const parsed = normalizeNumberInput(draft.focusIdleSeconds);

    if (Number.isNaN(parsed) || parsed === null) {
      setDraft((current) => ({
        ...current,
        focusIdleSeconds: String(preferences.focus.idleDelayMs / 1000)
      }));
      return;
    }

    const clampedSeconds = Math.min(Math.max(parsed, 0.5), 30);
    const nextDelayMs = Math.round(clampedSeconds * 1000);

    setDraft((current) => ({
      ...current,
      focusIdleSeconds: formatFocusIdleSeconds(clampedSeconds)
    }));

    if (nextDelayMs === preferences.focus.idleDelayMs) {
      return;
    }

    void applyPatch({ focus: { idleDelayMs: nextDelayMs } });
  }

  function handleResetAll(): void {
    void applyPatch({
      theme: {
        mode: DEFAULT_PREFERENCES.theme.mode,
        selectedId: DEFAULT_PREFERENCES.theme.selectedId,
        effectsMode: DEFAULT_PREFERENCES.theme.effectsMode
      },
      ui: {
        fontFamily: DEFAULT_PREFERENCES.ui.fontFamily,
        fontSize: DEFAULT_PREFERENCES.ui.fontSize
      },
      document: {
        fontFamily: DEFAULT_PREFERENCES.document.fontFamily,
        cjkFontFamily: DEFAULT_PREFERENCES.document.cjkFontFamily,
        fontSize: DEFAULT_PREFERENCES.document.fontSize
      },
      focus: {
        triggerMode: DEFAULT_PREFERENCES.focus.triggerMode,
        idleDelayMs: DEFAULT_PREFERENCES.focus.idleDelayMs
      },
      autosave: { idleDelayMs: DEFAULT_PREFERENCES.autosave.idleDelayMs },
      recentFiles: { maxEntries: DEFAULT_PREFERENCES.recentFiles.maxEntries }
    });
  }

  return (
    <section
      className="settings-shell"
      data-yulora-panel="settings-drawer"
      data-yulora-surface="floating-drawer"
      data-state={surfaceState}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
    >
      <header className="settings-header">
        <button
          type="button"
          className="settings-back"
          onClick={onClose}
          aria-label="关闭设置"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>关闭</span>
        </button>
        <div className="settings-title-block">
          <p className="settings-kicker">Preferences</p>
          <h1 id="settings-heading">偏好设置</h1>
        </div>
      </header>

      {errorMessage ? (
        <p
          className="error-banner settings-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="settings-groups">
        <section className="settings-group">
          <header className="settings-group-header">
            <h2>Focus</h2>
            <p>Collapse shell chrome for a quieter writing surface while keeping outline independent.</p>
          </header>
          <div className="settings-row">
            <label className="settings-label" htmlFor="settings-focus-trigger-mode">
              <span>Focus trigger mode</span>
              <span className="settings-hint">
                Manual shows the editor-corner entry. Auto hides it and enters focus from typing or idle time.
              </span>
            </label>
            <select
              id="settings-focus-trigger-mode"
              className="settings-input settings-select"
              value={preferences.focus.triggerMode}
              onChange={(event) => handleFocusTriggerModeChange(event.target.value as FocusTriggerMode)}
            >
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
            </select>
          </div>
          <div className="settings-row">
            <label className="settings-label" htmlFor="settings-focus-idle-preset">
              <span>Focus after idle</span>
              <span className="settings-hint">
                {preferences.focus.triggerMode === "auto"
                  ? "Choose a preset or type seconds directly."
                  : "Only used in Auto trigger mode."}
              </span>
            </label>
            <div className="settings-focus-idle-controls">
              <select
                id="settings-focus-idle-preset"
                className="settings-input settings-select"
                value={draft.focusIdleSeconds}
                disabled={preferences.focus.triggerMode !== "auto"}
                onChange={(event) => handleFocusIdlePresetChange(event.target.value)}
              >
                {focusIdlePresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="settings-focus-idle-input">
                <input
                  id="settings-focus-idle-seconds"
                  className="settings-input settings-input-narrow"
                  type="number"
                  min={0.5}
                  max={30}
                  step={0.1}
                  disabled={preferences.focus.triggerMode !== "auto"}
                  value={draft.focusIdleSeconds}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      focusIdleSeconds: event.target.value
                    }))
                  }
                  onInput={(event) =>
                    setDraft((current) => ({
                      ...current,
                      focusIdleSeconds: (event.target as HTMLInputElement).value
                    }))
                  }
                  onBlur={handleFocusIdleSecondsCommit}
                />
                <span className="settings-focus-idle-suffix">s</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-group">
          <header className="settings-group-header">
            <h2>主题</h2>
            <p>颜色模式控制 light / dark / system，主题包控制整套视觉风格。</p>
          </header>
          <div className="settings-row">
            <label className="settings-label">
              <span>颜色模式</span>
              <span className="settings-hint">选择跟随系统，或手动切换浅色 / 深色。</span>
            </label>
            <div
              className="settings-radio-group"
              role="radiogroup"
              aria-label="颜色模式"
            >
              {(["system", "light", "dark"] as const).map((mode) => (
                <label
                  key={mode}
                  className={`settings-radio ${
                    preferences.theme.mode === mode ? "is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="settings-theme-mode"
                    value={mode}
                    checked={preferences.theme.mode === mode}
                    onChange={() => handleThemeModeChange(mode)}
                  />
                  <span>{THEME_LABELS[mode]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-theme-package"
            >
              <span>主题包</span>
              <span className="settings-hint">默认主题使用内置 light / dark 套件，社区主题来自自动扫描目录。</span>
            </label>
            <div className="settings-input-stack">
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: "var(--yulora-space-2)"
                }}
              >
                <select
                  id="settings-theme-package"
                  className="settings-input settings-select"
                  style={{ flex: 1, minWidth: 0 }}
                  value={resolvedThemeSelectionValue ?? "default"}
                  onChange={(event) => handleThemePackageChange(event.target.value)}
                >
                  <option value="default">Yulora 默认</option>
                  {communityThemePackages.map((themePackage) => (
                    <option
                      key={themePackage.id}
                      value={themePackage.id}
                    >
                      {themePackage.manifest.name}
                    </option>
                  ))}
                  {selectedThemeMissing ? (
                    <option value={preferences.theme.selectedId ?? "default"}>
                      已配置主题（未找到）：{preferences.theme.selectedId}
                    </option>
                  ) : null}
                </select>
                <button
                  type="button"
                  className="settings-back"
                  aria-label="打开主题目录"
                  title="打开主题目录"
                  onClick={() => {
                    void handleOpenThemesDirectory();
                  }}
                >
                  <ThemeFolderIcon />
                </button>
              </div>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="settings-reset"
                  onClick={() => {
                    void handleRefreshThemes();
                  }}
                  disabled={isRefreshingThemes}
                >
                  {isRefreshingThemes ? "刷新中..." : "刷新主题"}
                </button>
              </div>
            </div>
          </div>
          <div className="settings-row">
            <label className="settings-label" htmlFor="settings-theme-effects">
              <span>动态效果</span>
              <span className="settings-hint">自动模式会在低性能或减少动态效果场景下自动降级。</span>
            </label>
            <select
              id="settings-theme-effects"
              className="settings-input settings-select"
              value={preferences.theme.effectsMode}
              onChange={(event) =>
                handleThemeEffectsModeChange(event.target.value as "auto" | "full" | "off")
              }
            >
              {(["auto", "full", "off"] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {THEME_EFFECT_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
        </section>

        {activeThemePackage && activeThemeParameters.length > 0 ? (
          <section
            className="settings-group"
            data-yulora-panel="theme-parameters"
            data-yulora-theme-id={activeThemePackage.id}
          >
            <header className="settings-group-header">
              <h2>{activeThemePackage.manifest.name}：参数</h2>
              <p>
                主题自定义参数实时作用于该主题的 shader。修改会自动保存，仅对当前主题生效。
              </p>
            </header>
            {activeThemeParameters.map((parameter) => {
              const value = resolveParameterCurrentValue(parameter, activeThemeParameterOverrides);

              if (parameter.type === "toggle") {
                const checked = value > 0.5;
                const inputId = `settings-theme-parameter-${activeThemePackage.id}-${parameter.id}`;

                return (
                  <div className="settings-row" key={parameter.id}>
                    <label className="settings-label" htmlFor={inputId}>
                      <span>{parameter.label}</span>
                      {parameter.description ? (
                        <span className="settings-hint">{parameter.description}</span>
                      ) : null}
                    </label>
                    <label className="settings-toggle">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          handleThemeParameterChange(
                            activeThemePackage.id,
                            parameter,
                            event.target.checked
                          )
                        }
                      />
                      <span className="settings-toggle-label">
                        {checked ? "已开启" : "已关闭"}
                      </span>
                    </label>
                  </div>
                );
              }

              const inputId = `settings-theme-parameter-${activeThemePackage.id}-${parameter.id}`;
              const displayValue = Number.isInteger(parameter.step)
                ? value.toFixed(0)
                : value.toFixed(2);

              return (
                <div className="settings-row" key={parameter.id}>
                  <label className="settings-label" htmlFor={inputId}>
                    <span>{parameter.label}</span>
                    {parameter.description ? (
                      <span className="settings-hint">{parameter.description}</span>
                    ) : null}
                  </label>
                  <div className="settings-slider-row">
                    <input
                      id={inputId}
                      type="range"
                      className="settings-slider"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={value}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        if (Number.isFinite(nextValue)) {
                          handleThemeParameterChange(
                            activeThemePackage.id,
                            parameter,
                            nextValue
                          );
                        }
                      }}
                    />
                    <span className="settings-slider-value">{displayValue}</span>
                  </div>
                </div>
              );
            })}
            <div className="settings-row">
              <div className="settings-label">
                <span>重置参数</span>
                <span className="settings-hint">将该主题的全部自定义参数恢复为默认值。</span>
              </div>
              <button
                type="button"
                className="settings-reset"
                onClick={() => handleResetThemeParameters(activeThemePackage.id)}
              >
                恢复默认参数
              </button>
            </div>
          </section>
        ) : null}

        <section className="settings-group">
          <header className="settings-group-header">
            <h2>排版</h2>
            <p>应用 UI 字号影响面板和按钮，文档字号与字体影响编辑器正文和 Markdown 渲染。</p>
          </header>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-ui-font-preset"
            >
              <span>应用 UI 字体预设</span>
              <span className="settings-hint">作用于按钮、标题、侧栏和设置面板等应用界面文字。</span>
            </label>
            <select
              id="settings-ui-font-preset"
              className="settings-input settings-select"
              value={draft.uiFontFamily}
              onChange={(event) => handleUiFontPresetChange(event.target.value)}
            >
              {uiFontOptions.map((option) => (
                <option
                  key={option.value.length === 0 ? "__default__" : option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-ui-font-size"
            >
              <span>应用 UI 字号</span>
              <span className="settings-hint">单位像素，范围 8 - 72，留空表示使用默认值。</span>
            </label>
            <input
              id="settings-ui-font-size"
              className="settings-input settings-input-narrow"
              type="number"
              min={8}
              max={72}
              value={draft.uiFontSize}
              placeholder="默认"
              onChange={(event) =>
                setDraft((current) => ({ ...current, uiFontSize: event.target.value }))
              }
              onBlur={handleUiFontSizeCommit}
            />
          </div>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-document-font-size"
            >
              <span>文档字号</span>
              <span className="settings-hint">单位像素，范围 8 - 72，留空表示使用主题默认值。</span>
            </label>
            <input
              id="settings-document-font-size"
              className="settings-input settings-input-narrow"
              type="number"
              min={8}
              max={72}
              value={draft.documentFontSize}
              placeholder="默认"
              onChange={(event) =>
                setDraft((current) => ({ ...current, documentFontSize: event.target.value }))
              }
              onBlur={handleDocumentFontSizeCommit}
            />
          </div>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-document-font-preset"
            >
              <span>文档字体预设</span>
              <span className="settings-hint">应用于正文中的西文、数字和未单独覆盖的字符。</span>
            </label>
            <select
              id="settings-document-font-preset"
              className="settings-input settings-select"
              value={draft.documentFontFamily}
              onChange={(event) => handleDocumentFontPresetChange(event.target.value)}
            >
              {documentFontOptions.map((option) => (
                <option
                  key={option.value.length === 0 ? "__default__" : option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-document-cjk-font-preset"
            >
              <span>中文字体预设</span>
              <span className="settings-hint">仅作用于正文中文字符，代码块和行内代码不受影响。</span>
            </label>
            <select
              id="settings-document-cjk-font-preset"
              className="settings-input settings-select"
              value={draft.documentCjkFontFamily}
              onChange={(event) => handleDocumentCjkFontPresetChange(event.target.value)}
            >
              {documentCjkFontOptions.map((option) => (
                <option
                  key={option.value.length === 0 ? "__default__" : option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="settings-group">
          <header className="settings-group-header">
            <h2>自动保存</h2>
            <p>停止输入后等待的时长，单位毫秒。</p>
          </header>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-autosave-delay"
            >
              <span>空闲触发时长</span>
              <span className="settings-hint">范围 100 - 60000 ms。</span>
            </label>
            <input
              id="settings-autosave-delay"
              className="settings-input settings-input-narrow"
              type="number"
              min={100}
              max={60000}
              value={draft.autosaveIdleDelayMs}
              onChange={(event) =>
                setDraft((current) => ({ ...current, autosaveIdleDelayMs: event.target.value }))
              }
              onBlur={handleIdleDelayCommit}
            />
          </div>
        </section>

        <section className="settings-group">
          <header className="settings-group-header">
            <h2>最近文件</h2>
            <p>记录最近打开过的文档数量上限。</p>
          </header>
          <div className="settings-row">
            <label
              className="settings-label"
              htmlFor="settings-recent-max"
            >
              <span>最多保留条数</span>
              <span className="settings-hint">配置已持久化，将在 TASK-006 接入后开放。</span>
            </label>
            <input
              id="settings-recent-max"
              className="settings-input settings-input-narrow"
              type="number"
              min={0}
              max={100}
              value={preferences.recentFiles.maxEntries}
              disabled
              readOnly
            />
            <p className="settings-inline-note">将在 TASK-006 接入后开放。</p>
          </div>
        </section>
      </div>

      <footer className="settings-footer">
        <button
          type="button"
          className="settings-reset"
          onClick={handleResetAll}
        >
          恢复默认值
        </button>
        <p className="settings-save-status">
          {hasSavedChanges ? "已保存更改" : "修改将在失焦或切换选项时自动保存。"}
        </p>
      </footer>
    </section>
  );
}
