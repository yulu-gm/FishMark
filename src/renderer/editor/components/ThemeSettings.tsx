import { useMemo, type MouseEvent } from "react";
import type { Preferences, PreferencesUpdate, ThemeMode } from "../../../shared/preferences";
import type { ThemeParameterDescriptor } from "../../../shared/theme-package";
import { resolveEffectiveThemeParameterValue } from "../../theme-style-runtime";
import { SettingsGroup, SettingsRow } from "./SettingsFields";
type ThemePackageEntry = Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>[number];
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

const THEME_GALLERY_URL = "https://yulu-gm.github.io/fishmark-themes/";

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

export function ThemeSettings({ preferences, themePackages, isRefreshingThemes, handleOpenThemesDirectory, handleRefreshThemes, onOpenExternalLink, applyPatch }: {
  preferences: Preferences; themePackages: ThemePackageEntry[]; isRefreshingThemes: boolean;
  handleOpenThemesDirectory: () => Promise<void>; handleRefreshThemes: () => Promise<void>;
  onOpenExternalLink: (href: string) => void; applyPatch: (patch: PreferencesUpdate) => Promise<void>;
}) {
  const communityThemePackages = useMemo(
    () => themePackages.filter((themePackage) => themePackage.source === "community"),
    [themePackages]
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
          : resolveEffectiveThemeParameterValue(parameter, undefined);

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
      resetEntries[parameter.id] = resolveEffectiveThemeParameterValue(parameter, undefined);
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

  function handleOpenThemeGallery(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    onOpenExternalLink(THEME_GALLERY_URL);
  }

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
                className={`settings-radio ${preferences.theme.mode === mode ? "is-selected" : ""
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
              <a
                className="settings-external-link"
                href={THEME_GALLERY_URL}
                target="_blank"
                rel="noreferrer"
                onClick={handleOpenThemeGallery}
              >
                打开主题页面
              </a>
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
            const value = resolveEffectiveThemeParameterValue(parameter, activeThemeParameterOverrides);

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
