import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesUpdate,
  type ThemeMode
} from "../../shared/preferences";

type UpdatePreferencesResult =
  | { status: "success"; preferences: Preferences }
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
    };

type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];

type SettingsViewProps = {
  surfaceState: "open" | "closing";
  preferences: Preferences;
  themes: ThemeCatalogEntry[];
  isRefreshingThemes: boolean;
  onRefreshThemes: () => Promise<void>;
  onUpdate: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
  onClose: () => void;
};

type DraftState = {
  uiFontSize: string;
  documentFontFamily: string;
  documentFontSize: string;
  idleDelayMs: string;
};

type FontPreset = {
  label: string;
  value: string;
};

const CUSTOM_FONT_PRESET_VALUE = "__custom__";

const FONT_PRESETS: FontPreset[] = [
  { label: "系统默认", value: "" },
  { label: "Aptos", value: "Aptos" },
  { label: "Segoe UI", value: "Segoe UI" },
  { label: "Georgia", value: "Georgia" },
  { label: "Source Serif 4", value: "Source Serif 4" },
  { label: "IBM Plex Serif", value: "IBM Plex Serif" },
  { label: "Cascadia Code", value: "Cascadia Code" }
];

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色"
};

function buildDraft(preferences: Preferences): DraftState {
  return {
    uiFontSize: preferences.ui.fontSize === null ? "" : String(preferences.ui.fontSize),
    documentFontFamily: preferences.document.fontFamily ?? "",
    documentFontSize:
      preferences.document.fontSize === null ? "" : String(preferences.document.fontSize),
    idleDelayMs: String(preferences.autosave.idleDelayMs)
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

function resolveFontPresetValue(fontFamily: string): string {
  const matchedPreset = FONT_PRESETS.find((preset) => preset.value === fontFamily);
  return matchedPreset ? matchedPreset.value : CUSTOM_FONT_PRESET_VALUE;
}

export function SettingsView({
  surfaceState,
  preferences,
  themes,
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

  const communityThemes = useMemo(
    () => themes.filter((theme) => theme.source === "community"),
    [themes]
  );
  const selectedThemeMissing =
    preferences.theme.selectedId !== null &&
    !communityThemes.some((theme) => theme.id === preferences.theme.selectedId);
  const fontPresetValue = resolveFontPresetValue(draft.documentFontFamily.trim());

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

  function handleThemeModeChange(mode: ThemeMode): void {
    void applyPatch({ theme: { mode } });
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

  function handleDocumentFontFamilyCommit(): void {
    const trimmed = draft.documentFontFamily.trim();
    const nextValue = trimmed.length === 0 ? null : trimmed;

    if (nextValue === preferences.document.fontFamily) {
      return;
    }

    void applyPatch({ document: { fontFamily: nextValue } });
  }

  function handleDocumentFontPresetChange(value: string): void {
    if (value === CUSTOM_FONT_PRESET_VALUE) {
      return;
    }

    setDraft((current) => ({
      ...current,
      documentFontFamily: value
    }));

    void applyPatch({
      document: {
        fontFamily: value.length === 0 ? null : value
      }
    });
  }

  function handleIdleDelayCommit(): void {
    const parsed = Number(draft.idleDelayMs);

    if (!Number.isFinite(parsed)) {
      setDraft((current) => ({
        ...current,
        idleDelayMs: String(preferences.autosave.idleDelayMs)
      }));
      return;
    }

    if (parsed === preferences.autosave.idleDelayMs) {
      return;
    }

    void applyPatch({ autosave: { idleDelayMs: parsed } });
  }

  function handleResetAll(): void {
    void applyPatch({
      theme: {
        mode: DEFAULT_PREFERENCES.theme.mode,
        selectedId: DEFAULT_PREFERENCES.theme.selectedId
      },
      ui: {
        fontSize: DEFAULT_PREFERENCES.ui.fontSize
      },
      document: {
        fontFamily: DEFAULT_PREFERENCES.document.fontFamily,
        fontSize: DEFAULT_PREFERENCES.document.fontSize
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
            <h2>主题</h2>
            <p>颜色模式控制 light / dark / system，主题包控制整套 CSS 覆写。</p>
          </header>
          <div className="settings-row">
            <label className="settings-label">
              <span>颜色模式</span>
              <span className="settings-hint">选择跟随系统或手动切换浅色 / 深色。</span>
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
              <select
                id="settings-theme-package"
                className="settings-input"
                value={preferences.theme.selectedId ?? "default"}
                onChange={(event) => handleThemePackageChange(event.target.value)}
              >
                <option value="default">Yulora 默认</option>
                {communityThemes.map((theme) => (
                  <option
                    key={theme.id}
                    value={theme.id}
                  >
                    {theme.name}
                  </option>
                ))}
                {selectedThemeMissing ? (
                  <option value={preferences.theme.selectedId ?? "default"}>
                    已配置主题（未找到）：{preferences.theme.selectedId}
                  </option>
                ) : null}
              </select>
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
                {selectedThemeMissing ? (
                  <p className="settings-inline-note">当前主题未找到，已回退到默认主题渲染。</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-group">
          <header className="settings-group-header">
            <h2>排版</h2>
            <p>应用 UI 字号影响面板和按钮，文档字号与字体影响编辑器正文与 Markdown 渲染。</p>
          </header>
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
              <span className="settings-hint">先选预设，再按需输入自定义字体族。</span>
            </label>
            <div className="settings-input-stack">
              <select
                id="settings-document-font-preset"
                className="settings-input"
                value={fontPresetValue}
                onChange={(event) => handleDocumentFontPresetChange(event.target.value)}
              >
                {FONT_PRESETS.map((preset) => (
                  <option
                    key={preset.label}
                    value={preset.value}
                  >
                    {preset.label}
                  </option>
                ))}
                <option value={CUSTOM_FONT_PRESET_VALUE}>自定义</option>
              </select>
              <input
                id="settings-document-font-family"
                className="settings-input"
                type="text"
                value={draft.documentFontFamily}
                placeholder="例如 IBM Plex Serif"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    documentFontFamily: event.target.value
                  }))
                }
                onBlur={handleDocumentFontFamilyCommit}
              />
            </div>
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
              value={draft.idleDelayMs}
              onChange={(event) =>
                setDraft((current) => ({ ...current, idleDelayMs: event.target.value }))
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
