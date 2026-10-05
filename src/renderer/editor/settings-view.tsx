import { useEffect, useMemo, useState } from "react";
import { AutosaveSettings } from "./components/AutosaveSettings";
import { ImagesSettings } from "./components/ImagesSettings";
import { RecentFilesSettings } from "./components/RecentFilesSettings";
import type { DraftState, FontOption } from "./components/settings-inputs";
import { SETTINGS_CATEGORIES, findCategoryForSection, toggleCategory, type SettingsCategoryId, type SettingsSectionId } from "./components/settings-navigation-model";
import { SettingsNavigation } from "./components/SettingsNavigation";
import { ThemeSettings } from "./components/ThemeSettings";
import { TypographySettings } from "./components/TypographySettings";

import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesUpdate
} from "../../shared/preferences";

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
  onOpenThemesDirectory: () => Promise<void>;
  onSelectTemporaryImageDirectory: () => Promise<Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>> | null>;
  onUpdate: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
  onOpenExternalLink: (href: string) => void;
  onClose: () => void;
};

const DEFAULT_EXPANDED_SETTINGS_CATEGORIES: SettingsCategoryId[] = ["appearance", "file"];
const DEFAULT_SETTINGS_SECTION_ID: SettingsSectionId = "theme";

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

export function SettingsView({
  surfaceState,
  preferences,
  fontFamilies,
  themePackages,
  isRefreshingThemes,
  onRefreshThemes,
  onOpenThemesDirectory,
  onSelectTemporaryImageDirectory,
  onUpdate,
  onOpenExternalLink,
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleOpenThemesDirectory(): Promise<void> {
    try {
      await onOpenThemesDirectory();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSelectTemporaryImageDirectory(): Promise<void> {
    try {
      const result = await onSelectTemporaryImageDirectory();

      if (result === null) {
        return;
      }

      if (result.status === "error") setErrorMessage(result.error.message);
      else { setErrorMessage(null); setHasSavedChanges(true); }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleResetTemporaryImageDirectory(): void {
    void applyPatch({
      images: {
        temporaryDirectory: DEFAULT_PREFERENCES.images.temporaryDirectory
      }
    });
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
              <ThemeSettings preferences={preferences} themePackages={themePackages} isRefreshingThemes={isRefreshingThemes} handleOpenThemesDirectory={handleOpenThemesDirectory} handleRefreshThemes={handleRefreshThemes} onOpenExternalLink={onOpenExternalLink} applyPatch={applyPatch} />
            </div>
          ) : null}
          {activeSectionId === "typography" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="typography"
            >
              <TypographySettings draft={draft} setDraft={setDraft} uiFontOptions={uiFontOptions} documentFontOptions={documentFontOptions} documentCjkFontOptions={documentCjkFontOptions} handleUiFontPresetChange={handleUiFontPresetChange} handleUiFontSizeCommit={handleUiFontSizeCommit} handleDocumentFontPresetChange={handleDocumentFontPresetChange} handleDocumentCjkFontPresetChange={handleDocumentCjkFontPresetChange} handleDocumentFontSizeCommit={handleDocumentFontSizeCommit} />
            </div>
          ) : null}
          {activeSectionId === "autosave" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="autosave"
            >
              <AutosaveSettings draft={draft} setDraft={setDraft} handleIdleDelayCommit={handleIdleDelayCommit} />
            </div>
          ) : null}
          {activeSectionId === "recent-files" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="recent-files"
            >
              <RecentFilesSettings draft={draft} setDraft={setDraft} handleRecentFilesMaxCommit={handleRecentFilesMaxCommit} />
            </div>
          ) : null}
          {activeSectionId === "images" ? (
            <div
              className="settings-groups"
              data-fishmark-settings-section="images"
            >
              <ImagesSettings preferences={preferences} handleSelectTemporaryImageDirectory={handleSelectTemporaryImageDirectory} handleResetTemporaryImageDirectory={handleResetTemporaryImageDirectory} />
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
