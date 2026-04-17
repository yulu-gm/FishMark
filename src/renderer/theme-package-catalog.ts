import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import { createBuiltinThemePackageDescriptor } from "./theme-runtime";
import type { ThemePackageRuntimeDescriptor } from "./theme-package-runtime";

export type ThemePackageDescriptor = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];

export type ThemePackageRuntimeEntry = {
  id: string;
  source: "builtin" | "community";
  supports: { light: boolean; dark: boolean };
  tokens: Partial<Record<"light" | "dark", string>>;
  styles: Partial<Record<"ui" | "editor" | "markdown" | "titlebar", string>>;
};

export type ThemePackageFallbackReason = "missing-theme" | "unsupported-mode" | null;

export type ActiveThemePackageResolution = {
  requestedId: string | null;
  resolvedMode: "light" | "dark";
  descriptor: ThemePackageRuntimeDescriptor;
  fallbackReason: ThemePackageFallbackReason;
};

function toPreviewAssetUrl(rawPath: string | undefined): string | null {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return null;
  }

  return createPreviewAssetUrl(rawPath);
}

export function normalizeThemePackageDescriptor(
  entry: ThemePackageDescriptor
): ThemePackageRuntimeEntry {
  const tokens: Partial<Record<"light" | "dark", string>> = {};
  const styles: Partial<Record<"ui" | "editor" | "markdown" | "titlebar", string>> = {};

  const lightTokenUrl = toPreviewAssetUrl(entry.manifest.tokens.light);
  const darkTokenUrl = toPreviewAssetUrl(entry.manifest.tokens.dark);

  if (lightTokenUrl) {
    tokens.light = lightTokenUrl;
  }

  if (darkTokenUrl) {
    tokens.dark = darkTokenUrl;
  }

  for (const part of ["ui", "editor", "markdown", "titlebar"] as const) {
    const resolved = toPreviewAssetUrl(entry.manifest.styles[part]);

    if (resolved) {
      styles[part] = resolved;
    }
  }

  return {
    id: entry.id,
    source: entry.source,
    supports: entry.manifest.supports,
    tokens,
    styles
  };
}

function toRuntimePackageDescriptor(entry: ThemePackageRuntimeEntry): ThemePackageRuntimeDescriptor {
  return {
    id: entry.id,
    tokens: entry.tokens,
    styles: entry.styles
  };
}

function resolveLegacyThemeFamilyId(themeId: string): string | null {
  const migrated = themeId.replace(/(?:-|_)(light|dark)$/u, "");
  return migrated === themeId ? null : migrated;
}

function createBuiltinFallbackDescriptor(mode: "light" | "dark"): ThemePackageRuntimeDescriptor {
  return createBuiltinThemePackageDescriptor(mode);
}

export function resolveActiveThemePackage(
  selectedId: string | null,
  packages: ThemePackageRuntimeEntry[],
  mode: "light" | "dark"
): ActiveThemePackageResolution {
  const legacyFamilyId = selectedId ? resolveLegacyThemeFamilyId(selectedId) : null;
  const selected = selectedId
    ? packages.find((entry) => entry.id === selectedId) ??
      (legacyFamilyId ? packages.find((entry) => entry.id === legacyFamilyId) : null) ??
      null
    : null;

  if (!selected) {
    return {
      requestedId: selectedId,
      resolvedMode: mode,
      descriptor: createBuiltinFallbackDescriptor(mode),
      fallbackReason: selectedId ? "missing-theme" : null
    };
  }

  if (!selected.supports[mode]) {
    return {
      requestedId: selectedId,
      resolvedMode: mode,
      descriptor: createBuiltinFallbackDescriptor(mode),
      fallbackReason: "unsupported-mode"
    };
  }

  return {
    requestedId: selectedId,
    resolvedMode: mode,
    descriptor: toRuntimePackageDescriptor(selected),
    fallbackReason: null
  };
}
