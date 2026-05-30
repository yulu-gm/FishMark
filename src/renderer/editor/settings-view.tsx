import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PREFERENCES,
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

type ThemePackageEntry = Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>[number];

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
  recentFilesMaxEntries: string;
};

type FontOption = {
  label: string;
  value: string;
};

type SettingsSectionId = "theme" | "typography" | "autosave" | "recent-files" | "images";
type SettingsCategoryId = "appearance" | "file";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  iconLabel: string;
  children: Array<{
    id: SettingsSectionId;
    label: string;
  }>;
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "appearance",
    label: "外观",
    iconLabel: "A",
    children: [
      { id: "theme", label: "主题" },
      { id: "typography", label: "排版" }
    ]
  },
  {
    id: "file",
    label: "文件",
    iconLabel: "F",
    children: [
      { id: "autosave", label: "自动保存" },
      { id: "recent-files", label: "最近文件" },
      { id: "images", label: "图片" }
    ]
  }
];

const DEFAULT_EXPANDED_SETTINGS_CATEGORIES: SettingsCategoryId[] = ["appearance", "file"];
const DEFAULT_SETTINGS_SECTION_ID: SettingsSectionId = "theme";

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
    recentFilesMaxEntries: String(preferences.recentFiles.maxEntries)
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

function findCategoryForSection(sectionId: SettingsSectionId): SettingsCategoryId {
  const category = SETTINGS_CATEGORIES.find((candidate) =>
    candidate.children.some((child) => child.id === sectionId)
  );

  return category?.id ?? "appearance";
}

function toggleCategory(
  categoryId: SettingsCategoryId,
  activeSectionId: SettingsSectionId,
  currentExpandedCategoryIds: SettingsCategoryId[]
): SettingsCategoryId[] {
  const activeCategoryId = findCategoryForSection(activeSectionId);
  if (categoryId === activeCategoryId) {
    return currentExpandedCategoryIds.includes(categoryId)
      ? currentExpandedCategoryIds
      : [...currentExpandedCategoryIds, categoryId];
  }

  return currentExpandedCategoryIds.includes(categoryId)
    ? currentExpandedCategoryIds.filter((id) => id !== categoryId)
    : [...currentExpandedCategoryIds, categoryId];
}

type SettingsGroupProps = {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  panel?: string;
  themeId?: string;
};

function SettingsGroup({ title, description, children, panel, themeId }: SettingsGroupProps) {
  return (
    <section
      className="settings-group"
      data-fishmark-panel={panel}
      data-fishmark-theme-id={themeId}
    >
      <header className="settings-group-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

type SettingsRowProps = {
  children: ReactNode;
};

function SettingsRow({ children }: SettingsRowProps) {
  return <div className="settings-row">{children}</div>;
}

type SettingsNavigationProps = {
  categories: SettingsCategory[];
  activeSectionId: SettingsSectionId;
  expandedCategoryIds: SettingsCategoryId[];
  onToggleCategory: (categoryId: SettingsCategoryId) => void;
  onSelectSection: (sectionId: SettingsSectionId) => void;
};

function SettingsNavigation({
  categories,
  activeSectionId,
  expandedCategoryIds,
  onToggleCategory,
  onSelectSection
}: SettingsNavigationProps) {
  return (
    <nav
      className="settings-navigation"
      data-fishmark-region="settings-navigation"
      aria-label="设置分类"
    >
      {categories.map((category) => {
        const isExpanded = expandedCategoryIds.includes(category.id);
        const isActiveCategory = category.children.some((child) => child.id === activeSectionId);
        const childrenId = `settings-navigation-${category.id}-children`;

        return (
          <div
            key={category.id}
            className="settings-navigation-group"
          >
            <button
              type="button"
              className={`settings-navigation-parent ${isActiveCategory ? "is-active" : ""}`}
              aria-expanded={isExpanded}
              aria-controls={childrenId}
              onClick={() => onToggleCategory(category.id)}
            >
              <span
                className="settings-navigation-chevron"
                aria-hidden="true"
              >
                {isExpanded ? "⌄" : "›"}
              </span>
              <span
                className="settings-navigation-icon"
                aria-hidden="true"
              >
                {category.iconLabel}
              </span>
              <span>{category.label}</span>
            </button>
            {isExpanded ? (
              <div
                id={childrenId}
                className="settings-navigation-children"
              >
                {category.children.map((child) => {
                  const isActive = child.id === activeSectionId;

                  return (
                    <button
                      key={child.id}
                      type="button"
                      className={`settings-navigation-child ${isActive ? "is-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onSelectSection(child.id)}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
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
  const [activeSectionId, setActiveSectionId] =
    useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION_ID);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<SettingsCategoryId[]>(() => [
    ...DEFAULT_EXPANDED_SETTINGS_CATEGORIES
  ]);

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

  function handleToggleCategory(categoryId: SettingsCategoryId): void {
    setExpandedCategoryIds((current) => toggleCategory(categoryId, activeSectionId, current));
  }

  function handleSelectSection(sectionId: SettingsSectionId): void {
    const categoryId = findCategoryForSection(sectionId);

    setActiveSectionId(sectionId);
    setExpandedCategoryIds((current) =>
      current.includes(categoryId) ? current : [...current, categoryId]
    );
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
      await window.fishmark.openThemesDirectory();
      setErrorMessage(null);
    } catch {
      setErrorMessage("无法打开主题目录。");
    }
  }

  async function handleSelectTemporaryImageDirectory(): Promise<void> {
    try {
      const selectedDirectory = await window.fishmark.selectTemporaryImageDirectory();

      if (!selectedDirectory) {
        return;
      }

      await applyPatch({
        images: { temporaryDirectory: selectedDirectory }
      });
    } catch {
      setErrorMessage("无法选择临时图片目录。");
    }
  }

  function handleResetTemporaryImageDirectory(): void {
    void applyPatch({
      images: {
        temporaryDirectory: DEFAULT_PREFERENCES.images.temporaryDirectory
      }
    });
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

  function handleRecentFilesMaxCommit(): void {
    const parsed = Number(draft.recentFilesMaxEntries);

    if (!Number.isFinite(parsed)) {
      setDraft((current) => ({
        ...current,
        recentFilesMaxEntries: String(preferences.recentFiles.maxEntries)
      }));
      return;
    }

    if (parsed === preferences.recentFiles.maxEntries) {
      return;
    }

    void applyPatch({ recentFiles: { maxEntries: parsed } });
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
      autosave: { idleDelayMs: DEFAULT_PREFERENCES.autosave.idleDelayMs },
      recentFiles: { maxEntries: DEFAULT_PREFERENCES.recentFiles.maxEntries },
      images: { temporaryDirectory: DEFAULT_PREFERENCES.images.temporaryDirectory }
    });
  }

  function renderThemeSection() {
    return (
      <>
        <SettingsGroup
          title="主题"
          description="颜色模式控制 light / dark / system，主题包控制整套视觉风格。"
        >
          <SettingsRow>
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
          </SettingsRow>
          <SettingsRow>
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
                  gap: "var(--fishmark-space-2)"
                }}
              >
                <select
                  id="settings-theme-package"
                  className="settings-input settings-select"
                  style={{ flex: 1, minWidth: 0 }}
                  value={resolvedThemeSelectionValue ?? "default"}
                  onChange={(event) => handleThemePackageChange(event.target.value)}
                >
                  <option value="default">FishMark 默认</option>
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
          </SettingsRow>
          <SettingsRow>
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
          </SettingsRow>
        </SettingsGroup>

        {activeThemePackage && activeThemeParameters.length > 0 ? (
          <SettingsGroup
            title={`${activeThemePackage.manifest.name}：参数`}
            description="主题自定义参数实时作用于该主题的 shader。修改会自动保存，仅对当前主题生效。"
            panel="theme-parameters"
            themeId={activeThemePackage.id}
          >
            {activeThemeParameters.map((parameter) => {
              const value = resolveParameterCurrentValue(parameter, activeThemeParameterOverrides);

              if (parameter.type === "toggle") {
                const checked = value > 0.5;
                const inputId = `settings-theme-parameter-${activeThemePackage.id}-${parameter.id}`;

                return (
                  <SettingsRow key={parameter.id}>
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
                  </SettingsRow>
                );
              }

              const inputId = `settings-theme-parameter-${activeThemePackage.id}-${parameter.id}`;
              const displayValue = Number.isInteger(parameter.step)
                ? value.toFixed(0)
                : value.toFixed(2);

              return (
                <SettingsRow key={parameter.id}>
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
                </SettingsRow>
              );
            })}
            <SettingsRow>
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
            </SettingsRow>
          </SettingsGroup>
        ) : null}
      </>
    );
  }

  function renderTypographySection() {
    return (
      <SettingsGroup
        title="排版"
        description="应用 UI 字号影响面板和按钮，文档字号与字体影响编辑器正文和 Markdown 渲染。"
      >
        <SettingsRow>
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
        </SettingsRow>
        <SettingsRow>
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
        </SettingsRow>
        <SettingsRow>
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
        </SettingsRow>
        <SettingsRow>
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
        </SettingsRow>
        <SettingsRow>
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
        </SettingsRow>
      </SettingsGroup>
    );
  }

  function renderAutosaveSection() {
    return (
      <SettingsGroup
        title="自动保存"
        description="停止输入后等待的时长，单位毫秒。"
      >
        <SettingsRow>
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
        </SettingsRow>
      </SettingsGroup>
    );
  }

  function renderRecentFilesSection() {
    return (
      <SettingsGroup
        title="最近文件"
        description="记录最近打开过的文档数量上限。"
      >
        <SettingsRow>
          <label
            className="settings-label"
            htmlFor="settings-recent-max"
          >
            <span>最多保留条数</span>
            <span className="settings-hint">范围 0 - 100，设为 0 会隐藏最近文件列表。</span>
          </label>
          <input
            id="settings-recent-max"
            className="settings-input settings-input-narrow"
            type="number"
            min={0}
            max={100}
            value={draft.recentFilesMaxEntries}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                recentFilesMaxEntries: event.target.value
              }))
            }
            onBlur={handleRecentFilesMaxCommit}
          />
        </SettingsRow>
      </SettingsGroup>
    );
  }

  function renderImagesSection() {
    const temporaryDirectory =
      preferences.images.temporaryDirectory ?? "FishMark 默认目录";

    return (
      <SettingsGroup
        title="图片"
        description="未保存文档中粘贴的图片会先写入临时图片目录。"
      >
        <SettingsRow>
          <div
            id="settings-temporary-image-directory-label"
            className="settings-label"
          >
            <span>临时图片目录</span>
            <span className="settings-hint">已保存文档仍会写入文档旁的 assets 目录。</span>
          </div>
          <div className="settings-input-stack">
            <div
              id="settings-temporary-image-directory"
              className="settings-input settings-path-display"
              aria-labelledby="settings-temporary-image-directory-label"
            >
              {temporaryDirectory}
            </div>
            <div className="settings-inline-actions">
              <button
                type="button"
                className="settings-reset"
                aria-label="选择临时图片目录"
                onClick={() => {
                  void handleSelectTemporaryImageDirectory();
                }}
              >
                选择目录
              </button>
              <button
                type="button"
                className="settings-reset"
                disabled={preferences.images.temporaryDirectory === null}
                onClick={handleResetTemporaryImageDirectory}
              >
                恢复默认目录
              </button>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>
    );
  }

  return (
    <section
      className="settings-shell"
      data-fishmark-panel="settings-drawer"
      data-fishmark-surface="settings-drawer"
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

      <div className="settings-body">
        <SettingsNavigation
          categories={SETTINGS_CATEGORIES}
          activeSectionId={activeSectionId}
          expandedCategoryIds={expandedCategoryIds}
          onToggleCategory={handleToggleCategory}
          onSelectSection={handleSelectSection}
        />
        <div className="settings-content">
          {activeSectionId === "theme" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="theme"
            >
              {renderThemeSection()}
            </div>
          ) : null}
          {activeSectionId === "typography" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="typography"
            >
              {renderTypographySection()}
            </div>
          ) : null}
          {activeSectionId === "autosave" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="autosave"
            >
              {renderAutosaveSection()}
            </div>
          ) : null}
          {activeSectionId === "recent-files" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="recent-files"
            >
              {renderRecentFilesSection()}
            </div>
          ) : null}
          {activeSectionId === "images" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="images"
            >
              {renderImagesSection()}
            </div>
          ) : null}
        </div>
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
