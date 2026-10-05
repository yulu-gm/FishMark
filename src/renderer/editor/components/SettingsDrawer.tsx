import { lazy, Suspense } from "react";
import type { WorkspaceShellProps } from "../workspace-shell-props";
const SettingsView = lazy(async () => {
  const module = await import("../settings-view");
  return { default: module.SettingsView };
});

function SettingsDrawerFallback({ surfaceState }: { surfaceState: "open" | "closing" }) {
  return (
    <section
      className="settings-shell"
      data-fishmark-panel="settings-drawer"
      data-fishmark-surface="settings-drawer"
      data-state={surfaceState}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
    />
  );
}


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
          <Suspense
            fallback={
              <SettingsDrawerFallback surfaceState={isSettingsOpen ? "open" : "closing"} />
            }
          >
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
          </Suspense>
        </div>
      </div>
    ) : null
  );
}
