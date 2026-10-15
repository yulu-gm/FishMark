import type { Preferences } from "../shared/preferences";
import type { ThemePackageDescriptor } from "../shared/theme-package";

export function resolveResourceThemeSelection(theme: Preferences["theme"], packages: readonly ThemePackageDescriptor[], systemDark: boolean) {
  const mode = theme.mode === "system" ? (systemDark ? "dark" : "light") : theme.mode;
  const requested = packages.find((entry) => entry.id === theme.selectedId);
  // Match renderer's default fallback, including a safely scanned community default.
  const descriptor = requested?.manifest.supports[mode] ? requested : packages.find((entry) => entry.id === "default") ?? null;
  return { descriptor, mode, effects: requested !== undefined && requested === descriptor && theme.effectsMode !== "off" };
}
