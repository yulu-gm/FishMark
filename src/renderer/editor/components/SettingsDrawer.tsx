import { SettingsView } from "../settings-view";
import type { WorkspaceShellProps } from "../workspace-shell-props";
export function SettingsDrawer({
  isSettingsDrawerVisible,
  isSettingsOpen,
  onCloseSettingsDrawer,
  preferences,
  fontFamilies,
  themePackages,
  isRefreshingThemePackages,
  onRefreshThemePackages,
  onOpenThemesDirectory,
  onSelectTemporaryImageDirectory,
  onUpdatePreferences,
  onOpenExternalLink
}: Pick<WorkspaceShellProps, "isSettingsDrawerVisible" | "isSettingsOpen" | "onCloseSettingsDrawer" | "preferences" | "fontFamilies" | "themePackages" | "isRefreshingThemePackages" | "onRefreshThemePackages" | "onOpenThemesDirectory" | "onSelectTemporaryImageDirectory" | "onUpdatePreferences" | "onOpenExternalLink">) {

  return (
    isSettingsDrawerVisible ? (
      <div
        data-fishmark-dialog="settings-drawer"
        data-fishmark-overlay-style="floating-drawer"
        data-state={isSettingsOpen ? "open" : "closing"}
        onClick={onCloseSettingsDrawer}
      >
        <div onClick={(event) => event.stopPropagation()}>
          <SettingsView
            surfaceState={isSettingsOpen ? "open" : "closing"}
            preferences={preferences}
            fontFamilies={fontFamilies}
            themePackages={themePackages}
            isRefreshingThemes={isRefreshingThemePackages}
            onRefreshThemes={onRefreshThemePackages}
            onOpenThemesDirectory={onOpenThemesDirectory}
            onSelectTemporaryImageDirectory={onSelectTemporaryImageDirectory}
            onUpdate={onUpdatePreferences}
            onOpenExternalLink={onOpenExternalLink}
            onClose={onCloseSettingsDrawer}
          />
        </div>
      </div>
    ) : null
  );
}
